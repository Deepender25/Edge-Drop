/**
 * Bounded thumbnail production + caching for the edgelocal://thumb/ route.
 *
 * WHY: every thumbnail request used to decode the FULL original screenshot
 * (a 4K capture is ~33 MB of raw bitmap), resize to 240 px, PNG-encode, and
 * throw everything away — while telling the renderer `no-cache`, guaranteeing
 * the same expensive work repeated on every list reorder/scroll. With
 * hundreds of image cards this starved the CPU exactly while animations run.
 *
 * Now:
 *  - A tiny LRU (64 entries, ~1.5 MB worst case) serves hot thumbnails as
 *    pre-encoded buffers with zero decode work.
 *  - Responses carry validators (ETag -> 304) and long freshness for
 *    content-addressed captures, so Chromium reuses its decoded bitmap and
 *    rarely asks again at all.
 *
 * Keys include mtime+size so externally replaced files are never served stale.
 */
import { statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { nativeImage } from 'electron'

const MAX_THUMBNAIL_EDGE_PX = 240
const LRU_MAX_ENTRIES = 64

export interface ThumbnailPayload {
  etag: string
  contentType: string
  body: Buffer
}

const lru = new Map<string, ThumbnailPayload>()

function lruGet(key: string): ThumbnailPayload | undefined {
  const hit = lru.get(key)
  if (!hit) return undefined
  // Refresh insertion order for LRU semantics.
  lru.delete(key)
  lru.set(key, hit)
  return hit
}

function lruPut(key: string, value: ThumbnailPayload): void {
  lru.delete(key)
  lru.set(key, value)
  if (lru.size > LRU_MAX_ENTRIES) {
    const oldest = lru.keys().next().value
    if (oldest !== undefined) lru.delete(oldest)
  }
}

/** Test hook: drop all cached thumbnails. */
export function clearThumbnailCache(): void {
  lru.clear()
}

/** Test hook: number of cached payloads. */
export function thumbnailCacheSize(): number {
  return lru.size
}

interface FileFacts {
  mtimeMs: number
  size: number
}

function readFacts(filePath: string): FileFacts | null {
  try {
    const st = statSync(filePath)
    if (!st.isFile()) return null
    return { mtimeMs: Math.floor(st.mtimeMs), size: st.size }
  } catch {
    return null
  }
}

/**
 * Produce (or fetch from LRU) the encoded 240 px PNG for a raster image.
 * Returns null when the source cannot be read or decoded.
 */
function cacheKey(filePath: string, facts: FileFacts): string {
  return `${filePath}|${facts.mtimeMs}:${facts.size}`
}

export function getThumbnailPayload(filePath: string): ThumbnailPayload | null {
  const facts = readFacts(filePath)
  if (!facts) return null

  const key = cacheKey(filePath, facts)
  const cached = lruGet(key)
  if (cached) return cached

  try {
    const img = nativeImage.createFromPath(filePath)
    if (img.isEmpty()) return null

    const { width, height } = img.getSize()
    const scale = Math.min(1, MAX_THUMBNAIL_EDGE_PX / Math.max(width, height))
    const thumb =
      scale < 1
        ? img.resize({
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale)),
            quality: 'good'
          })
        : img

    const body = thumb.toPNG()
    const payload: ThumbnailPayload = {
      // Content-fingerprint validator: any change to the source file flips
      // mtime/size, producing a fresh key AND a fresh etag together.
      etag: `"${createHash('sha256').update(`${filePath}|${facts.mtimeMs}:${facts.size}`).digest('hex')}"`,
      contentType: 'image/png',
      body
    }
    lruPut(key, payload)
    return payload
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Motion-aware scheduling                                             */
/* ------------------------------------------------------------------ */
//
// A decode blocks the main thread for 40–125ms per photo (measured), and
// with a transparent window on software compositing every presented frame
// passes through the main thread — a decode during the open/close/flyout
// motion freezes those frames for its whole duration. Cache misses are
// therefore queued, decoded one per macrotask so frames and IPC get through
// in between, and held while UI motion is in progress. Hits stay immediate.

/** How long a motion notice holds decodes (open/close/flyout run ≤ 320ms). */
const MOTION_QUIET_MS = 450

let motionQuietUntil = 0
const inflight = new Map<string, Promise<ThumbnailPayload | null>>()
const queue: Array<() => void> = []
let pumping = false

/** Main process signals that a panel/flyout transition is starting now. */
export function noteUiMotion(durationMs = MOTION_QUIET_MS): void {
  motionQuietUntil = Math.max(motionQuietUntil, Date.now() + durationMs)
}

/** Milliseconds until the current panel/flyout motion is over (0 when none). */
export function uiMotionLeftMs(): number {
  return Math.max(0, motionQuietUntil - Date.now())
}

function pump(): void {
  if (pumping) return
  pumping = true
  const step = (): void => {
    const wait = motionQuietUntil - Date.now()
    if (wait > 0) {
      setTimeout(step, wait)
      return
    }
    const job = queue.shift()
    if (!job) {
      pumping = false
      return
    }
    job()
    setTimeout(step, 0)
  }
  setTimeout(step, 0)
}

/**
 * Same result as getThumbnailPayload, but cache misses are decoded through
 * the motion-aware queue instead of synchronously inside the request.
 */
export function getThumbnailPayloadScheduled(filePath: string): Promise<ThumbnailPayload | null> {
  const facts = readFacts(filePath)
  if (!facts) return Promise.resolve(null)

  const key = cacheKey(filePath, facts)
  const cached = lruGet(key)
  if (cached) return Promise.resolve(cached)

  const pending = inflight.get(key)
  if (pending) return pending

  const job = new Promise<ThumbnailPayload | null>((resolve) => {
    queue.push(() => {
      try {
        resolve(getThumbnailPayload(filePath))
      } catch {
        resolve(null)
      }
    })
    pump()
  })
  inflight.set(key, job)
  void job.then(() => inflight.delete(key))
  return job
}

/**
 * Cache policy for a thumbnail response.
 *  - Stored captures (`edgelocal://thumb/<imageId>`) are content-addressed:
 *    the id is minted once per capture and its bytes are never rewritten, so
 *    the representation is effectively immutable.
 *  - External file thumbnails may change on disk; give them short freshness
 *    plus mandatory-ish revalidation via ETag.
 */
export function thumbnailCacheControl(isStoredCapture: boolean): string {
  return isStoredCapture
    ? 'private, max-age=31536000, immutable'
    : 'private, max-age=300'
}
