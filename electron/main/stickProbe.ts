/**
 * Pure edge-probe math extracted from the cursor poll.
 *
 * Zero Electron imports so the EXACT production decision logic can be
 * exercised in unit tests against simulated multi-display topologies -
 * the deepest verification possible without physical hardware.
 *
 * Semantics (must stay byte-equivalent to the original inline block):
 *  - client coords = global cursor - stick display workArea origin
 *  - garbage guard: |clientX| outside [-5000, 15000] / same for Y
 *  - distFromEdge: distance from the stuck edge (left edge => clientX)
 *  - inEdge: distFromEdge within [-30, hotZoneWidth]
 */

import type { WorkAreaRect } from './workAreaCache'

export interface StickProbeInput {
  /** Global virtual-desktop cursor point (screen.getCursorScreenPoint()). */
  cursor: { x: number; y: number }
  /** Work area of the display the shelf is stuck to. */
  workArea: WorkAreaRect
  stickPosition: 'left' | 'right'
  /** Physical thickness of the hover trigger band. */
  hotZoneWidth: number
}

export interface StickProbeResult {
  clientX: number
  clientY: number
  /** Distance from the stuck edge; small/negative means "at the edge". */
  distFromEdge: number
  /** True when the cursor dwells inside the trigger band. */
  inEdge: boolean
  /** True when Windows sent implausible coordinates; callers must skip. */
  garbage: boolean
}

/** Distance beyond which the adaptive poll is allowed to throttle down. */
export const FAST_POLL_PROXIMITY_PX = 450

export function probeStickEdge(input: StickProbeInput): StickProbeResult {
  const { cursor, workArea, stickPosition, hotZoneWidth } = input

  const clientX = cursor.x - workArea.x
  const clientY = cursor.y - workArea.y

  const garbage =
    clientX < -5000 || clientX > 15000 || clientY < -5000 || clientY > 15000

  const distFromEdge = stickPosition === 'right'
    ? workArea.width - clientX
    : clientX

  const inEdge = !garbage && distFromEdge >= -30 && distFromEdge <= hotZoneWidth

  return { clientX, clientY, distFromEdge, inEdge, garbage }
}

/** True when this frame qualifies for fast-poll proximity (<= 450px from edge). */
export function isNearProximity(distFromEdge: number): boolean {
  return distFromEdge <= FAST_POLL_PROXIMITY_PX
}

/* ------------------------------------------------------------------ */
/* Seam-aware arming (industry three-pillar model)                     */
/*                                                                     */
/* When the shelf is mounted on a boundary shared with another         */
/* display, position alone cannot distinguish "hover my edge" from     */
/* "traveling between screens". Three pillars make it deterministic:   */
/*                                                                     */
/*  1. OWN-PIXEL ARMING  - the trigger arms only at dist >= 0 (the     */
/*     stick display's own side). The legacy -30px overshoot remains   */
/*     ONLY as keep-open forgiveness downstream, never for arming.     */
/*  2. INTENT SPEED      - a frame arms only when travel speed is      */
/*     below MAX_INTENT_SPEED_PX_PER_MS (or unknowable due to a long   */
/*     sampling gap). Fast flicks through the band never arm.          */
/*  3. CROSSING LOCKOUT  - a boundary crossing suppresses arming for   */
/*     SEAM_LOCKOUT_MS, killing the "popped open right after landing   */
/*     on the other screen" residual.                                  */
/*                                                                     */
/* At a normal outer edge all three are invisible: the cursor clamps   */
/* at the physical boundary so dist is always >= 0, crossings never    */
/* occur, and arrival-then-stop yields speed ~0 immediately.           */
/* ------------------------------------------------------------------ */

/** Suppression after a boundary crossing lasts until the cursor COMES TO REST… */
export const REST_FRAMES_REQUIRED = 3
/** …and "rest" means slow movement parked inside the own-side band. */
export const MAX_INTENT_SPEED_PX_PER_MS = 1.5

/** Caller-held memory between ticks (no module-level globals => fully simulatable). */
export interface SeamTickState {
  lastPoint?: { x: number; y: number }
  lastDist?: number
  lastTime?: number
  /** True between a boundary crossing and the moment rest forgives it. */
  crossPending?: boolean
  /** Consecutive qualifying rest frames accumulated while crossPending. */
  restStreak?: number
}

export interface SeamAwareProbe {
  probe: StickProbeResult
  /** True on the exact tick the cursor crossed the stuck boundary. */
  crossedNow: boolean
  /** px/ms between this and the previous sample; null when unmeasurable. */
  speedPxPerMs: number | null
  slowEnough: boolean
  /** True while a crossing awaits rest-forgiveness (arming suppressed). */
  lockedOut: boolean
  /**
   * The seam-policy verdict that production must report as `inEdge`.
   * Requires ALL of: own pixels, inside band, slow enough, not pending rest.
   */
  armedInEdge: boolean
  nextState: SeamTickState
}

export function probeSeamAware(
  input: {
    cursor: { x: number; y: number }
    workArea: WorkAreaRect
    stickPosition: 'left' | 'right'
    hotZoneWidth: number
    /** Monotonic-ish wall time for THIS sample (Date.now() in production). */
    now: number
  },
  state: SeamTickState
): SeamAwareProbe {
  const probe = probeStickEdge({
    cursor: input.cursor,
    workArea: input.workArea,
    stickPosition: input.stickPosition,
    hotZoneWidth: input.hotZoneWidth
  })

  // Garbage samples must never poison the tracker.
  if (probe.garbage) {
    return {
      probe,
      crossedNow: false,
      speedPxPerMs: null,
      slowEnough: false,
      lockedOut: false,
      armedInEdge: false,
      nextState: state
    }
  }

  // ── Speed (pillar 2) ────────────────────────────────────────────────────
  let speedPxPerMs: number | null = null
  if (state.lastPoint && state.lastTime !== undefined) {
    const dt = Math.min(250, Math.max(1, input.now - state.lastTime))
    const dx = input.cursor.x - state.lastPoint.x
    const dy = input.cursor.y - state.lastPoint.y
    speedPxPerMs = Math.sqrt(dx * dx + dy * dy) / dt
  }
  const slowEnough = speedPxPerMs === null || speedPxPerMs <= MAX_INTENT_SPEED_PX_PER_MS

  // ── Crossing detection ──────────────────────────────────────────────────
  const crossedNow =
    state.lastDist !== undefined &&
    ((state.lastDist < 0 && probe.distFromEdge >= 0) ||
      (state.lastDist >= 0 && probe.distFromEdge < 0))

  // ── REST-AS-INTENT (pillar 3, refined) ──────────────────────────────────
  // A crossing suppresses arming until the cursor comes to REST: moving
  // slowly while parked INSIDE the own-side band for REST_FRAMES_REQUIRED
  // consecutive frames. Motion resets the streak; rest forgives the crossing
  // entirely. Behavior beats clocks: flicks never rest, so they stay
  // suppressed forever; a deliberate stop is forgiven almost immediately.
  let crossPending = state.crossPending ?? false
  let restStreak = state.restStreak ?? 0

  if (crossedNow) {
    crossPending = true
    restStreak = 0
  } else if (crossPending) {
    const inOwnBand =
      probe.distFromEdge >= 0 && probe.distFromEdge <= input.hotZoneWidth
    if (inOwnBand && slowEnough) restStreak++
    else restStreak = 0
    if (restStreak >= REST_FRAMES_REQUIRED) crossPending = false
  }

  const lockedOut = crossPending

  // ── Combined verdict ────────────────────────────────────────────────────
  // Pillar 1 lives in the distFromEdge >= 0 term (own pixels only).
  const armedInEdge =
    !lockedOut &&
    probe.distFromEdge >= 0 &&
    probe.distFromEdge <= input.hotZoneWidth &&
    slowEnough

  return {
    probe,
    crossedNow,
    speedPxPerMs,
    slowEnough,
    lockedOut,
    armedInEdge,
    nextState: {
      lastPoint: { x: input.cursor.x, y: input.cursor.y },
      lastDist: probe.distFromEdge,
      lastTime: input.now,
      crossPending,
      restStreak
    }
  }
}
