import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkAreaCache, type ResolvedWorkArea, type WorkAreaRect } from '../electron/main/workAreaCache'

const wa = (x: number, width = 1920): WorkAreaRect => ({ x, y: 0, width, height: 1040 })

describe('WorkAreaCache — versioned stick-display cache', () => {
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errSpy.mockRestore()
  })

  it('builds on first read for the requested stick id', () => {
    const look = vi.fn((id?: number): ResolvedWorkArea | null =>
      id === 2 ? { displayId: 2, workArea: wa(1920) } : { displayId: 1, workArea: wa(0) })
    const cache = new WorkAreaCache(look)

    expect(cache.get(2)).toEqual(wa(1920))
    expect(look).toHaveBeenCalledTimes(1)
    expect(cache.versionedFor).toBe(2)
  })

  it('REBUILDS when the stick id changes — the fix for stale cross-monitor detection', () => {
    const look = vi.fn((id?: number): ResolvedWorkArea | null =>
      id === 2 ? { displayId: 2, workArea: wa(3840) } : { displayId: 1, workArea: wa(0) })
    const cache = new WorkAreaCache(look)

    const primaryFrame = cache.get(1)
    const secondaryFrame = cache.get(2)

    expect(primaryFrame).toEqual(wa(0))
    expect(secondaryFrame).toEqual(wa(3840))
    expect(look).toHaveBeenCalledTimes(2) // once per distinct id
  })

  it('serves repeat reads of the SAME id with zero extra lookups', () => {
    const look = vi.fn(() => ({ displayId: 5, workArea: wa(0) }))
    const cache = new WorkAreaCache(look)
    cache.get(5); cache.get(5); cache.get(5)
    expect(look).toHaveBeenCalledTimes(1)
  })

  it('retains LAST-KNOWN-GOOD rectangle when enumeration throws', () => {
    let shouldThrow = false
    const cache = new WorkAreaCache((id) => {
      if (shouldThrow) throw new Error('display topology exploded')
      return { displayId: 7, workArea: wa(100) }
    })
    const good = cache.get(7)
    expect(good).toEqual(wa(100))

    shouldThrow = true
    // Same id: no rebuild attempted -> cached value survives.
    expect(cache.get(7)).toEqual(wa(100))

    // Different id forces a rebuild attempt; failure keeps the old frame alive.
    expect(cache.get(9)).toEqual(wa(100))
    expect(errSpy).toHaveBeenCalled()
  })

  it('returns null only before the FIRST successful lookup', () => {
    const cache = new WorkAreaCache(() => null)
    expect(cache.get(3)).toBeNull()
    expect(errSpy).not.toHaveBeenCalled() // null result is not an error
    expect(cache.versionedFor).toBeUndefined()
  })

  it('explicit refresh() re-reads even for an unchanged id (topology events)', () => {
    let originX = 0
    const cache = new WorkAreaCache(() => ({ displayId: 4, workArea: wa(originX) }))
    expect(cache.get(4)).toEqual(wa(0))

    originX = -1920 // monitor physically moved to the left side
    cache.refresh(4)
    expect(cache.get(4)).toEqual(wa(-1920))
  })

  it('ignores malformed lookup results instead of caching them', () => {
    let payload: ResolvedWorkArea | null = { displayId: 8, workArea: undefined as unknown as WorkAreaRect }
    const cache = new WorkAreaCache(() => payload)
    expect(cache.get(8)).toBeNull()

    payload = { displayId: 8, workArea: wa(42) }
    expect(cache.get(8)).toEqual(wa(42))
  })
})
