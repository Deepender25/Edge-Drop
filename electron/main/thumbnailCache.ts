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
export function getThumbnailPayload(filePath: string): ThumbnailPayload | null {
  const facts = readFacts(filePath)
  if (!facts) return null

  const key = `${filePath}|${facts.mtimeMs}:${facts.size}`
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
