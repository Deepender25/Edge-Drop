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
  thumbnailCacheControl,
  thumbnailCacheSize
} from '../electron/main/thumbnailCache'

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
