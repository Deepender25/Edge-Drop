import { describe, it, expect } from 'vitest'
import { computeStickBounds, type DisplayInfo } from '../electron/main/geometry'

function makeDisplay(
  id: number, x: number, y: number, w: number, h: number,
  opts: { scaleFactor?: number; isPrimary?: boolean } = {}
): DisplayInfo {
  return { id, workArea: { x, y, width: w, height: h }, scaleFactor: opts.scaleFactor ?? 1, isPrimary: opts.isPrimary ?? false }
}

const PRIMARY = makeDisplay(1, 0, 0, 1920, 1040, { isPrimary: true, scaleFactor: 1 })
const SECONDARY = makeDisplay(2, 1920, 0, 1920, 1040, { isPrimary: false, scaleFactor: 1 })

describe('computeStickBounds � original tests', () => {
  it('sticks to left edge of primary display', () => {
    const r = computeStickBounds({ position: 'left', displays: [PRIMARY], windowWidth: 384 })
    expect(r.x).toBe(0); expect(r.y).toBe(0); expect(r.displayId).toBe(1)
  })
  it('sticks to right edge of secondary display', () => {
    const r = computeStickBounds({ position: 'right', displays: [PRIMARY, SECONDARY], displayId: 2, windowWidth: 384 })
    expect(r.x).toBe(3456); expect(r.displayId).toBe(2)
  })
  it('falls back to nearest display via currentBounds', () => {
    const r = computeStickBounds({ position: 'left', displays: [PRIMARY, SECONDARY], displayId: undefined, currentBounds: { x: 2100, y: 100 }, windowWidth: 384 })
    expect(r.displayId).toBe(2)
  })
})

describe('Fix 1 � isPrimary typed property for Tier-4 fallback', () => {
  it('secondary listed first: still picks primary via isPrimary flag', () => {
    const secondaryFirst = [SECONDARY, PRIMARY]
    const r = computeStickBounds({ position: 'left', displays: secondaryFirst, windowWidth: 384 })
    expect(r.displayId).toBe(1)
  })
  it('3-display array with primary last still picks correct primary', () => {
    const mon3 = makeDisplay(3, 3840, 0, 1920, 1040)
    const r = computeStickBounds({ position: 'left', displays: [SECONDARY, mon3, PRIMARY], windowWidth: 384 })
    expect(r.displayId).toBe(1)
  })
  it('no isPrimary flags: falls back to displays[0]', () => {
    const noFlags = [makeDisplay(10, 0, 0, 1920, 1040), makeDisplay(20, 1920, 0, 1920, 1040)]
    const r = computeStickBounds({ position: 'left', displays: noFlags, windowWidth: 384 })
    expect(r.displayId).toBe(10)
  })
})

describe('Fix 4 � Tier-2 fuzzy match uses workArea (not bounds)', () => {
  it('matches secondary across reboot when ID changes but workArea is same', () => {
    const rebooted = makeDisplay(99, 1920, 0, 1920, 1040)
    const r = computeStickBounds({ position: 'left', displays: [PRIMARY, rebooted], displayId: 2, savedWorkArea: { x: 1920, y: 0, width: 1920, height: 1040 }, savedScaleFactor: 1, windowWidth: 384 })
    expect(r.displayId).toBe(99)
  })
  it('bounds-vs-workArea mismatch (40px taskbar) fails Tier-2 ? falls to primary', () => {
    const rebooted = makeDisplay(99, 1920, 0, 1920, 1040)
    const r = computeStickBounds({ position: 'left', displays: [PRIMARY, rebooted], displayId: 2, savedWorkArea: { x: 1920, y: 0, width: 1920, height: 1080 }, savedScaleFactor: 1, windowWidth: 384 })
    expect(r.displayId).toBe(1)
  })
  it('tolerates 7px OS jitter in workArea and still matches', () => {
    const jittered = makeDisplay(99, 1927, 0, 1920, 1040)
    const r = computeStickBounds({ position: 'left', displays: [PRIMARY, jittered], displayId: 2, savedWorkArea: { x: 1920, y: 0, width: 1920, height: 1040 }, savedScaleFactor: 1, windowWidth: 384 })
    expect(r.displayId).toBe(99)
  })
  it('does NOT match when jitter is 9px (exceeds 8px tolerance)', () => {
    const tooFar = makeDisplay(99, 1929, 0, 1920, 1040)
    const r = computeStickBounds({ position: 'left', displays: [PRIMARY, tooFar], displayId: 2, savedWorkArea: { x: 1920, y: 0, width: 1920, height: 1040 }, savedScaleFactor: 1, windowWidth: 384 })
    expect(r.displayId).toBe(1)
  })
  it('uses scaleFactor tiebreaker when two monitors share identical workArea', () => {
    const hiDpi = makeDisplay(10, 1920, 0, 1920, 1040, { scaleFactor: 1.5 })
    const loDpi = makeDisplay(11, 1920, 0, 1920, 1040, { scaleFactor: 1.0 })
    const r = computeStickBounds({ position: 'left', displays: [PRIMARY, hiDpi, loDpi], displayId: 99, savedWorkArea: { x: 1920, y: 0, width: 1920, height: 1040 }, savedScaleFactor: 1.5, windowWidth: 384 })
    expect(r.displayId).toBe(10)
  })
})

describe('TV mirror regression � combined scenario', () => {
  it('fresh install: places on Primary even when secondary is listed first', () => {
    const r = computeStickBounds({ position: 'left', displays: [SECONDARY, PRIMARY], windowWidth: 384 })
    expect(r.displayId).toBe(1)
  })
  it('saved secondary preference survives reboot with new IDs', () => {
    const newPrimary = makeDisplay(100, 0, 0, 1920, 1040, { isPrimary: true })
    const newSecondary = makeDisplay(200, 1920, 0, 1920, 1040)
    const r = computeStickBounds({ position: 'left', displays: [newPrimary, newSecondary], displayId: 2, savedWorkArea: { x: 1920, y: 0, width: 1920, height: 1040 }, savedScaleFactor: 1, windowWidth: 384 })
    expect(r.displayId).toBe(200); expect(r.x).toBe(1920)
  })
  it('TV mirror transient ID change: Tier-2 still finds secondary by workArea', () => {
    const transientSecondary = makeDisplay(999, 1920, 0, 1920, 1040)
    const r = computeStickBounds({ position: 'left', displays: [PRIMARY, transientSecondary], displayId: 2, savedWorkArea: { x: 1920, y: 0, width: 1920, height: 1040 }, savedScaleFactor: 1, windowWidth: 384 })
    expect(r.displayId).toBe(999); expect(r.x).toBe(1920)
  })

  // ── Twin-monitor tie-break (identical geometry AND scale) ────────────────
  // True twins report near-identical workAreas, so geometry cannot separate
  // them; determinism must come from primary preference instead of array order.
  const twinA = { id: 11, workArea: { x: 1920, y: 0, width: 1920, height: 1040 }, bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1, isPrimary: false }
  const twinB = { id: 22, workArea: { x: 1920, y: 0, width: 1920, height: 1040 }, bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1, isPrimary: true }

  it('breaks identical-twin ambiguity by preferring the OS-designated primary', () => {
    const r = computeStickBounds({
      position: 'left',
      displays: [twinA, twinB], // primary listed SECOND
      displayId: undefined,
      savedWorkArea: { x: 1920, y: 0, width: 1920, height: 1040 },
      savedScaleFactor: 1,
      windowWidth: 384
    })
    expect(r.displayId).toBe(22)
  })

  it('falls back to deterministic first-candidate when twins have no primary flag', () => {
    const a = { ...twinA }
    const b = { ...twinB, isPrimary: false }
    const r = computeStickBounds({
      position: 'left',
      displays: [a, b],
      displayId: undefined,
      savedWorkArea: { x: 1920, y: 0, width: 1920, height: 1040 },
      savedScaleFactor: 1,
      windowWidth: 384
    })
    expect(r.displayId).toBe(11)
  })
})

