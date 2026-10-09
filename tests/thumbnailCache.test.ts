import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const calls = vi.hoisted(() => ({ createFromPath: 0 }))

vi.mock('electron', () => ({
  nativeImage: {
    createFromPath: vi.fn((_p: string) => {
      calls.createFromPath++
      return {
        isEmpty: () => false,
        getSize: () => ({ width: 1920, height: 1080 }),
        resize: () => ({ toPNG: () => Buffer.from([0x89, 0x50, 0x4e, 0x47]) }),
        toPNG: () => Buffer.from([0x89, 0x50, 0x4e, 0x47])
      }
    })
  }
}))

import {
  clearThumbnailCache,
  getThumbnailPayload,
  getThumbnailPayloadScheduled,
  noteUiMotion,
  thumbnailCacheControl,
  thumbnailCacheSize
} from '../electron/main/thumbnailCache'

describe('thumbnailCache — motion-aware scheduling', () => {
  let dir: string

  beforeEach(() => {
    vi.useFakeTimers()
    dir = join(tmpdir(), `ed-thumbsched-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(dir, { recursive: true })
    clearThumbnailCache()
    calls.createFromPath = 0
  })

  afterEach(async () => {
    // Let the queue pump finish so it does not stay parked on a fake timer.
    await vi.runAllTimersAsync()
    vi.useRealTimers()
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  function makeFile(name: string): string {
    const p = join(dir, name)
    writeFileSync(p, Buffer.from('fake-image-bytes'))
    return p
  }

  it('never decodes inside the request: one decode per macrotask', async () => {
    const a = getThumbnailPayloadScheduled(makeFile('a.jpg'))
    const b = getThumbnailPayloadScheduled(makeFile('b.jpg'))
    expect(calls.createFromPath).toBe(0)
    await vi.advanceTimersToNextTimerAsync()
    expect(calls.createFromPath).toBe(1)
    await vi.advanceTimersToNextTimerAsync()
    expect(calls.createFromPath).toBe(2)
    expect((await a)!.contentType).toBe('image/png')
    expect((await b)!.contentType).toBe('image/png')
  })

  it('holds decodes while UI motion is in progress, then runs them', async () => {
    noteUiMotion(450)
    const p = getThumbnailPayloadScheduled(makeFile('a.jpg'))
    await vi.advanceTimersByTimeAsync(400)
    expect(calls.createFromPath).toBe(0)
    await vi.advanceTimersByTimeAsync(100)
    expect(calls.createFromPath).toBe(1)
    expect(await p).not.toBeNull()
  })

  it('returns cached thumbnails immediately, even during motion', async () => {
    const f = makeFile('a.jpg')
    const first = getThumbnailPayload(f)
    noteUiMotion(450)
    expect(await getThumbnailPayloadScheduled(f)).toBe(first)
    expect(calls.createFromPath).toBe(1)
  })

  it('shares one decode between concurrent requests for the same file', async () => {
    const f = makeFile('a.jpg')
    const a = getThumbnailPayloadScheduled(f)
    const b = getThumbnailPayloadScheduled(f)
    await vi.runAllTimersAsync()
    expect(await a).toBe(await b)
    expect(calls.createFromPath).toBe(1)
  })

  it('resolves null for a missing file without queueing', async () => {
    expect(await getThumbnailPayloadScheduled(join(dir, 'missing.jpg'))).toBeNull()
    expect(calls.createFromPath).toBe(0)
  })
})

describe('thumbnailCache — bounded LRU + validators', () => {
  let dir: string

  beforeEach(() => {
    dir = join(tmpdir(), `ed-thumbcache-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(dir, { recursive: true })
    clearThumbnailCache()
    calls.createFromPath = 0
  })

  afterEach(() => {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  function makePng(name: string): string {
    const p = join(dir, name)
    writeFileSync(p, Buffer.from('fake-image-bytes'))
    return p
  }

  it('produces an encoded payload with content type and validator etag', () => {
    const p = makePng('a.png')
    const payload = getThumbnailPayload(p)
    expect(payload).not.toBeNull()
    expect(payload!.contentType).toBe('image/png')
    expect(payload!.etag).toMatch(/^"[0-9a-f]{64}"$/)
    expect(Buffer.isBuffer(payload!.body)).toBe(true)
  })

  it('serves repeat requests from the LRU with ZERO re-decodes of the source', () => {
    const p = makePng('b.png')
    const first = getThumbnailPayload(p)!
    expect(calls.createFromPath).toBe(1)

    for (let i = 0; i < 5; i++) {
      expect(getThumbnailPayload(p)).toBe(first) // same cached object identity
    }
    expect(calls.createFromPath).toBe(1)
  })

  it('regenerates when the source file changes (mtime bumped)', () => {
    const p = makePng('c.png')
    const first = getThumbnailPayload(p)!
    const firstEtag = first.etag

    // Force a fresh mtime deterministically (same-size rewrite alone could
    // keep the timestamp identical on coarse filesystems).
    writeFileSync(p, Buffer.from('changed-image-bytes!'))
    const future = new Date(Date.now() + 5000)
    utimesSync(p, future, future)

    const second = getThumbnailPayload(p)!
    expect(second.etag).not.toBe(firstEtag)
    expect(calls.createFromPath).toBe(2)
  })

  it('returns null for missing or unreadable sources without caching anything', () => {
    expect(getThumbnailPayload(join(dir, 'missing.png'))).toBeNull()
    expect(thumbnailCacheSize()).toBe(0)
  })

  it('never exceeds the LRU bound regardless of request count', () => {
    for (let i = 0; i < 80; i++) {
      getThumbnailPayload(makePng(`f${i}.png`))
    }
    expect(thumbnailCacheSize()).toBeLessThanOrEqual(64)
  })

  it('evicts oldest entries first (LRU order preserved under churn)', () => {
    const survivors: Array<ReturnType<typeof getThumbnailPayload>> = []
    for (let i = 0; i < 60; i++) {
      survivors.push(getThumbnailPayload(makePng(`old${i}.png`)))
    }
    // Push the map past its cap; the earliest payloads must be evicted.
    for (let i = 0; i < 10; i++) {
      getThumbnailPayload(makePng(`new${i}.png`))
    }
    expect(thumbnailCacheSize()).toBeLessThanOrEqual(64)
    // Old entries beyond capacity are gone; a re-request re-decodes instead
    // of returning stale objects.
    expect(getThumbnailPayload(join(dir, 'old0.png'))).not.toBe(survivors[0])
  })

  it('cache policy: stored captures are immutable, external files stay revalidated', () => {
    expect(thumbnailCacheControl(true)).toContain('immutable')
    expect(thumbnailCacheControl(false)).not.toContain('immutable')
    expect(thumbnailCacheControl(false)).toMatch(/max-age=\d+/)
  })
})
