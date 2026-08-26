/**
 * Virtual Multi-Display Simulation Suite
 * ======================================
 *
 * The user cannot attach a second monitor, so this suite reconstructs the
 * ENTIRE production decision pipeline in software and replays real-world
 * hardware scenarios against it:
 *
 *   virtual displays  ──►  WorkAreaCache (REAL production class)
 *                     ──►  computeStickBounds (REAL geometry.ts)
 *                     ──►  probeStickEdge    (REAL poll math, extracted)
 *
 * Every scenario below maps 1:1 to a physical situation. The headline case
 * is the exact bug a user reported: "configured on my second monitor,
 * hovering ITS edge does nothing - but hovering the PRIMARY screen's edge
 * pops the panel open on the secondary."
 */
import { describe, expect, it, vi } from 'vitest'
import { WorkAreaCache } from '../electron/main/workAreaCache'
import { computeStickBounds } from '../electron/main/geometry'
import { probeStickEdge, probeSeamAware, isNearProximity, FAST_POLL_PROXIMITY_PX, REST_FRAMES_REQUIRED, MAX_INTENT_SPEED_PX_PER_MS, type SeamTickState } from '../electron/main/stickProbe'

/* ------------------------------------------------------------------ */
/* Virtual desktop simulator                                           */
/* ------------------------------------------------------------------ */

interface VDisplay {
  id: number
  x: number; y: number; width: number; height: number
  scaleFactor: number
  isPrimary: boolean
}

function display(id: number, x: number, y: number, width: number, height: number, isPrimary = false, scaleFactor = 1): VDisplay {
  return { id, x, y, width, height, scaleFactor, isPrimary }
}

/** Work area = bounds minus a 40px taskbar at the bottom (Windows default). */
const workAreaOf = (d: VDisplay) => ({ x: d.x, y: d.y, width: d.width, height: d.height - 40 })

class VirtualDesktop {
  displays: VDisplay[]
  primaryId: number

  constructor(displays: VDisplay[]) {
    this.displays = displays
    this.primaryId = displays.find(d => d.isPrimary)!.id
  }

  getAllDisplays() {
    return this.displays.map(d => ({
      id: d.id,
      bounds: { x: d.x, y: d.y, width: d.width, height: d.height },
      workArea: workAreaOf(d),
      scaleFactor: d.scaleFactor,
      isPrimary: d.id === this.primaryId
    }))
  }

  getPrimaryDisplay() {
    return this.getAllDisplays().find(d => d.isPrimary)!
  }
}

/**
 * Production-faithful stick controller: mirrors the exact call sequence of
 * window.ts (getStickGeometry -> setStickDisplayId/refresh -> _pollTick).
 */
class StickController {
  cache: WorkAreaCache
  currentStickDisplayId: number | undefined
  windowBounds: { x: number; y: number } | null = null
  lastProbe: ReturnType<typeof probeStickEdge> | null = null
  stickPosition: 'left' | 'right' = 'left'
  hotZoneWidth = 3
  windowWidth = 384

  constructor(public desktop: VirtualDesktop) {
    this.cache = new WorkAreaCache((displayId) => {
      const all = this.desktop.getAllDisplays()
      const stick = all.find(d => d.id === displayId) ?? this.desktop.getPrimaryDisplay()
      return stick?.workArea ? { displayId: stick.id, workArea: stick.workArea } : null
    })
  }

  /** Mirrors getStickGeometry(): resolve target display, move window, re-version cache. */
  applyStickDisplay(displayId: number | undefined) {
    const result = computeStickBounds({
      position: this.stickPosition,
      displays: this.desktop.getAllDisplays(),
      displayId,
      savedWorkArea: undefined,
      savedScaleFactor: undefined,
      windowWidth: this.windowWidth,
      currentBounds: this.windowBounds ?? undefined
    })
    // Simulated setBounds happens here in production; then the identity +
    // cache refresh that constitute THE FIX:
    this.currentStickDisplayId = result.resolvedDisplay.id
    this.windowBounds = { x: result.x, y: result.y }
    this.cache.refresh(result.resolvedDisplay.id)
    return result
  }

  /** Mirrors one _pollTick against a global cursor point. */
  tick(globalCursor: { x: number; y: number }) {
    const wa = this.cache.get(this.currentStickDisplayId)
    if (!wa) { this.lastProbe = null; return null }
    this.lastProbe = probeStickEdge({
      cursor: globalCursor,
      workArea: wa,
      stickPosition: this.stickPosition,
      hotZoneWidth: this.hotZoneWidth
    })
    return this.lastProbe
  }

  get edgeTriggered(): boolean {
    return this.lastProbe?.inEdge === true
  }

  /** What the OLD buggy code computed: window on new screen, cache stuck on old id. */
  buggyLegacyTick(globalCursor: { x: number; y: number }, staleWorkArea: { x: number; y: number; width: number; height: number }) {
    return probeStickEdge({
      cursor: globalCursor,
      workArea: staleWorkArea,
      stickPosition: this.stickPosition,
      hotZoneWidth: this.hotZoneWidth
    })
  }
}

/* ------------------------------------------------------------------ */
/* Shared topology: laptop + external side-by-side                     */
/* ------------------------------------------------------------------ */

function sideBySideDesktop(): VirtualDesktop {
  return new VirtualDesktop([
    display(1, 0, 0, 1920, 1080, true),      // primary
    display(2, 1920, 0, 2560, 1440)          // secondary to the right
  ])
}

describe('SIMULATION — reported bug: hover secondary does nothing, hover primary opens panel on secondary', () => {
  it('REPRODUCES the legacy defect first (proves the test can catch it)', () => {
    const ctl = new StickController(sideBySideDesktop())
    ctl.applyStickDisplay(2)

    // Legacy frame: window moved, but cache still held PRIMARY's origin.
    const stalePrimaryFrame = { x: 0, y: 0, width: 1920, height: 1040 }

    // Hover secondary's left edge (global x=1921):
    const onSecondary = ctl.buggyLegacyTick({ x: 1921, y: 500 }, stalePrimaryFrame)
    expect(onSecondary.inEdge).toBe(false)          // ← user's "does not appear"

    // Hover primary's left edge (global x=1):
    const onPrimary = ctl.buggyLegacyTick({ x: 1, y: 500 }, stalePrimaryFrame)
    expect(onPrimary.inEdge).toBe(true)             // ← user's "appears on secondary"
  })

  it('FIXED: after switching sticks to the secondary, ITS edge triggers and the primary never does', () => {
    const ctl = new StickController(sideBySideDesktop())
    ctl.stickPosition = 'left'
    ctl.applyStickDisplay(2)

    // Secondary's left edge — global cursor just inside its left boundary.
    expect(ctl.tick({ x: 1921, y: 500 })!.inEdge).toBe(true)
    expect(ctl.tick({ x: 1922, y: 700 })!.inEdge).toBe(true)
    // One pixel OUTSIDE the trigger band: no trigger.
    expect(ctl.tick({ x: 1925, y: 500 })!.inEdge).toBe(false)

    // Primary's interior must be completely inert now.
    expect(ctl.tick({ x: 1, y: 500 })!.inEdge).toBe(false)
    expect(ctl.tick({ x: 0, y: 900 })!.inEdge).toBe(false)
    expect(ctl.tick({ x: 960, y: 540 })!.inEdge).toBe(false)

    // DOCUMENTED SEAM BEHAVIOR: the two monitors are physically adjacent, and
    // the virtual desktop is continuous. The production contract tolerates up
    // to 30px of cross-seam overshoot so the open shelf survives nudging
    // across the boundary — identical to pre-fix behavior and physically
    // indistinguishable from the edge itself.
    expect(ctl.tick({ x: 1919, y: 500 })!.inEdge).toBe(true)   // 1px into primary = seam
    expect(ctl.tick({ x: 1890, y: 500 })!.inEdge).toBe(true)   // exactly -30 = last buffered px
    expect(ctl.tick({ x: 1889, y: 500 })!.inEdge).toBe(false)  // -31 = beyond seam buffer
  })

  it('client coordinates are translated into SECONDARY space (renderer zones stay valid)', () => {
    const ctl = new StickController(sideBySideDesktop())
    ctl.applyStickDisplay(2)
    const p = ctl.tick({ x: 1921, y: 613 })!
    expect(p.clientX).toBe(1)                 // 1px into the secondary
    expect(p.clientY).toBe(613)               // untouched vertical
  })

  it('switching BACK to primary restores primary-edge detection instantly', () => {
    const ctl = new StickController(sideBySideDesktop())
    ctl.applyStickDisplay(2)
    ctl.applyStickDisplay(1)

    expect(ctl.tick({ x: 2, y: 400 })!.inEdge).toBe(true)
    expect(ctl.tick({ x: 1921, y: 400 })!.inEdge).toBe(false)
  })
})

describe('SIMULATION — right-stick on the secondary', () => {
  it('triggers only at the secondary’s RIGHT edge with correct distance math', () => {
    const ctl = new StickController(sideBySideDesktop())
    ctl.stickPosition = 'right'
    ctl.applyStickDisplay(2)

    const secRight = 1920 + 2560 // 4480
    const inside = ctl.tick({ x: secRight - 2, y: 300 })!
    expect(inside.inEdge).toBe(true)
    expect(inside.distFromEdge).toBe(2)

    const outside = ctl.tick({ x: secRight - 10, y: 300 })!
    expect(outside.inEdge).toBe(false)

    // Primary's right edge (x=1919) is far from OUR edge: inert.
    expect(ctl.tick({ x: 1919, y: 300 })!.inEdge).toBe(false)
  })
})

describe('SIMULATION — vertically stacked secondary', () => {
  it('detects its own edge with correct Y translation', () => {
    const desktop = new VirtualDesktop([
      display(1, 0, 0, 1920, 1080, true),
      display(2, 0, 1080, 1920, 1440) // directly BELOW the primary
    ])
    const ctl = new StickController(desktop)
    ctl.applyStickDisplay(2)

    const p = ctl.tick({ x: 1, y: 1090 })!
    expect(p.inEdge).toBe(true)
    expect(p.clientX).toBe(1)
    expect(p.clientY).toBe(10) // 1090 - 1080
  })
})

describe('SIMULATION — live topology changes', () => {
  it('monitor physically relocated: OS event refreshes cache, new coordinates detect', () => {
    const desktop = sideBySideDesktop()
    const ctl = new StickController(desktop)
    ctl.applyStickDisplay(2)
    expect(ctl.tick({ x: 1921, y: 100 })!.inEdge).toBe(true)

    // User rearranges: secondary pushed further right (e.g. third monitor added).
    desktop.displays[1] = display(2, 3840, 0, 2560, 1440)
    ctl.desktop = desktop
    ctl.cache.refresh(2) // what handleDisplayChange/updateCachedWorkArea performs

    expect(ctl.tick({ x: 3841, y: 100 })!.inEdge).toBe(true)   // new location works
    expect(ctl.tick({ x: 1921, y: 100 })!.inEdge).toBe(false)  // old spot no longer an edge of stick
  })

  it('stick monitor unplugged: geometry pass resolves primary, poll relocates without crashing', () => {
    const desktop = sideBySideDesktop()
    const ctl = new StickController(desktop)
    ctl.applyStickDisplay(2)

    // Unplug display 2 entirely.
    desktop.displays = desktop.displays.filter(d => d.id !== 2)

    // PRODUCTION SEQUENCE (window.ts): 'display-removed' -> repositionWindow
    // -> getStickGeometry resolves with display 2 gone; Tier-4 falls back to
    // primary and the tail of getStickGeometry re-versions the poll cache.
    ctl.applyStickDisplay(undefined)

    expect(ctl.currentStickDisplayId).toBe(1)
    expect(ctl.tick({ x: 1, y: 100 })!.inEdge).toBe(true)   // primary edge responds
    expect(ctl.tick({ x: 1921, y: 100 })!.inEdge).toBe(false) // dead monitor's spot inert
  })

  it('enumeration THROW mid-session retains last-known-good frame (poll never dies)', () => {
    let explode = false
    const desktop = sideBySideDesktop()
    const ctl = new StickController(desktop)
    // Replace lookup internals via subclassing the cache used by the controller.
    const throwingCache = new WorkAreaCache(() => {
      if (explode) throw new Error('topology enumeration crashed')
      const all = desktop.getAllDisplays()
      const s = all.find(d => d.id === ctl.currentStickDisplayId) ?? desktop.getPrimaryDisplay()
      return { displayId: s.id, workArea: s.workArea }
    })
    ctl.cache = throwingCache
    ctl.applyStickDisplay(2)
    expect(ctl.tick({ x: 1921, y: 50 })!.inEdge).toBe(true)

    explode = true
    const stillAlive = ctl.tick({ x: 1922, y: 60 })
    expect(stillAlive!.inEdge).toBe(true) // last-known-good keeps detection alive
  })
})

describe('SIMULATION — restart equivalence & garbage filtering', () => {
  it('fresh app launch with persisted secondary preference detects immediately on first tick', () => {
    const ctl = new StickController(sideBySideDesktop())
    ctl.currentStickDisplayId = 2 // restored from settings.json, no switch performed
    expect(ctl.tick({ x: 1921, y: 250 })!.inEdge).toBe(true) // lazy versioned build
  })

  it('garbage coordinates from Windows are filtered before triggering', () => {
    const ctl = new StickController(sideBySideDesktop())
    ctl.applyStickDisplay(2)
    expect(ctl.tick({ x: -80000, y: 5 })!.garbage).toBe(true)
    expect(ctl.edgeTriggered).toBe(false)
  })

  it('custom hot-zone thickness is honored on the correct display', () => {
    const ctl = new StickController(sideBySideDesktop())
    ctl.applyStickDisplay(2)
    ctl.hotZoneWidth = 7
    expect(ctl.tick({ x: 1927, y: 10 })!.inEdge).toBe(true)
    expect(ctl.tick({ x: 1928, y: 10 })!.inEdge).toBe(false)
  })
})

describe('SIMULATION — adaptive proximity thresholds (unchanged feel)', () => {
  it('fast-poll zone boundary sits exactly at 450px on either stick side', () => {
    expect(isNearProximity(FAST_POLL_PROXIMITY_PX)).toBe(true)
    expect(isNearProximity(FAST_POLL_PROXIMITY_PX + 1)).toBe(false)

    const ctl = new StickController(sideBySideDesktop())
    ctl.applyStickDisplay(2)
    expect(isNearProximity(ctl.tick({ x: 1921 + FAST_POLL_PROXIMITY_PX - 1, y: 0 })!.distFromEdge)).toBe(true)
    expect(isNearProximity(ctl.tick({ x: 1921 + FAST_POLL_PROXIMITY_PX + 5, y: 0 })!.distFromEdge)).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/* THREE-PILLAR SEAM POLICY (probeSeamAware)                           */
/* Simulated at 16ms production fast-poll cadence                      */
/* ------------------------------------------------------------------ */

const SEC_X = 1920
function seamController(stickPosition: 'left' | 'right' = 'left') {
  const ctl = new StickController(sideBySideDesktop())
  ctl.stickPosition = stickPosition
  ctl.applyStickDisplay(2)
  let state: SeamTickState = {}
  let t = 1000
  const wa = ctl.cache.get(ctl.currentStickDisplayId)!
  return {
    tick(x: number, y = 500) {
      t += 16
      const r = probeSeamAware({ cursor: { x, y }, workArea: wa, stickPosition, hotZoneWidth: 3, now: t }, state)
      state = r.nextState
      return r
    },
    get time() { return t }
  }
}

describe('SEAM POLICY - pillar 1: own-pixel arming', () => {
  it('neighbor-side hover (even fully stopped) never arms', () => {
    const c = seamController()
    let r = c.tick(SEC_X - 5)
    for (let i = 0; i < 10; i++) r = c.tick(SEC_X - 5) // dwell ~160ms
    expect(r.armedInEdge).toBe(false)
    expect(r.probe.inEdge).toBe(true) // legacy band would have armed - policy must not
  })

  it('own-side pixel inside the band arms once slow', () => {
    const c = seamController()
    let r = c.tick(SEC_X + 2) // arrival may be fast
    for (let i = 0; i < 5; i++) r = c.tick(SEC_X + 2) // settle
    expect(r.armedInEdge).toBe(true)
  })
})

describe('SEAM POLICY - pillar 2: velocity intent', () => {
  it('fast flick THROUGH the band never arms on any frame', () => {
    const c = seamController()
    let anyArmed = false
    for (let x = 1500; x <= 2400; x += 96) { // ~6 px/ms sweep
      const r = c.tick(x)
      if (r.armedInEdge) anyArmed = true
    }
    expect(anyArmed).toBe(false)
  })

  it("arrival then settle arms within a beat, like today's feel", () => {
    const c = seamController()
    c.tick(SEC_X + 60)
    let r = c.tick(SEC_X + 2)
    r = c.tick(SEC_X + 2)
    expect(r.slowEnough).toBe(true)
    r = c.tick(SEC_X + 2)
    expect(r.armedInEdge).toBe(true)
  })
})

describe('SEAM POLICY - pillar 3: rest-as-intent forgiveness', () => {
  it('slow crossing suppresses until the cursor RESTS on own pixels (~3 frames), then forgives', () => {
    const c = seamController()
    // Cross slowly to the neighbor side.
    c.tick(SEC_X + 1); c.tick(SEC_X - 40); c.tick(SEC_X - 80)
    // Come back and park on own pixels: arrival frame is pending-rest.
    let r = c.tick(SEC_X + 1)
    expect(r.lockedOut).toBe(true)
    r = c.tick(SEC_X + 1) // rest frame 1
    r = c.tick(SEC_X + 1) // rest frame 2
    expect(r.lockedOut).toBe(true)
    r = c.tick(SEC_X + 1) // rest frame 3 => forgiven, armed same frame
    expect(r.lockedOut).toBe(false)
    expect(r.armedInEdge).toBe(true)
  })

  it('fast movement during the settle window RESETS rest progress', () => {
    const c = seamController()
    c.tick(SEC_X + 1); c.tick(SEC_X - 40)
    c.tick(SEC_X + 1)                    // arrive (crossing) -> streak 0
    c.tick(SEC_X + 2)                    // rest 1
    let r = c.tick(SEC_X - 30)           // quick jiggle across the seam: reset + re-cross
    expect(r.crossedNow).toBe(true)
    r = c.tick(SEC_X + 2)                // arrival again, streak restarts at 0
    expect(r.armedInEdge).toBe(false)
    r = c.tick(SEC_X + 2)                // rest 1
    r = c.tick(SEC_X + 2)                // rest 2
    r = c.tick(SEC_X + 2)                // rest 3 -> forgiven
    expect(r.lockedOut).toBe(false)
    expect(r.armedInEdge).toBe(true)
  })

  it('rest policy constants match the documented design', () => {
    expect(REST_FRAMES_REQUIRED).toBe(3)
    expect(MAX_INTENT_SPEED_PX_PER_MS).toBeGreaterThan(0)
  })
})

describe('SEAM POLICY - outer-edge parity (single display, no neighbor)', () => {
  it('hardware edge clamps cursor: prompt arming, zero crossings, zero lockouts', () => {
    const desktop = new VirtualDesktop([display(1, 0, 0, 1920, 1080, true)])
    const cache = new WorkAreaCache((id) => {
      const all = desktop.getAllDisplays()
      const s = all.find(d => d.id === id) ?? desktop.getPrimaryDisplay()
      return { displayId: s.id, workArea: s.workArea }
    })
    const wa = cache.get(1)!
    let state: SeamTickState = {}
    let t = 1000
    let sawCrossing = false
    let sawLockout = false

    const seq = [400, 120, 30, 4, 0, 0, 0, 0, 0, 0]
    let armedAtFrame = -1
    seq.forEach((x, i) => {
      t += 16
      const r = probeSeamAware({ cursor: { x, y: 300 }, workArea: wa, stickPosition: 'left', hotZoneWidth: 3, now: t }, state)
      state = r.nextState
      if (r.crossedNow) sawCrossing = true
      if (r.lockedOut) sawLockout = true
      if (r.armedInEdge && armedAtFrame === -1) armedAtFrame = i
    })
    expect(sawCrossing).toBe(false)
    expect(sawLockout).toBe(false)
    expect(armedAtFrame).toBeGreaterThanOrEqual(0)
    expect(armedAtFrame).toBeLessThanOrEqual(5)
  })
})

describe('SEAM POLICY - primary interior regression guard while stuck to secondary', () => {
  it('primary interior never arms; own-side seam strip arms after arriving + settling', () => {
    const c = seamController()
    expect(c.tick(960, 540)!.armedInEdge).toBe(false)
    expect(c.tick(500, 200)!.armedInEdge).toBe(false)

    // Teleporting from primary-center into the seam IS a boundary crossing:
    // arming stays suppressed until rest forgives it (~3 settled frames).
    const arrive = c.tick(SEC_X + 1)!
    expect(arrive.crossedNow).toBe(true)
    expect(arrive.armedInEdge).toBe(false)

    // Park on own pixels; rest streak builds and forgives without any timer.
    let r = c.tick(SEC_X + 2)!   // rest 1
    r = c.tick(SEC_X + 2)!       // rest 2
    r = c.tick(SEC_X + 2)!       // rest 3 -> forgiven
    expect(r.lockedOut).toBe(false)
    expect(r.slowEnough).toBe(true)
    expect(r.armedInEdge).toBe(true)
  })
})
