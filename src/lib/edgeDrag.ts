/**
 * A drag from another app, seen before it reaches the shelf (main reports it
 * with every cursor update, see electron/main/externalDrag.ts).
 *
 * - Anywhere on screen: the edge bar swells a little, ready for it.
 * - Closer: the swell grows with the drag's distance to the bar ("pull").
 * - At the bar ("catch"): the shelf opens straight into its drop zone.
 *
 * All positions are in the stick display's work-area coordinates, the same
 * ones the cursor poll reports.
 */

/** Distance from the bar where the pull starts to build. */
export const DRAG_PULL_RANGE_PX = 360
/** How deep from the screen edge the catch reaches (side docks / top dock). */
export const DRAG_CATCH_DEPTH_PX = 48
export const DRAG_CATCH_DEPTH_TOP_PX = 40
/** Extra room past each end of the bar that still catches. */
export const DRAG_CATCH_SLACK_PX = 24
/** The drag must stay in the catch this long, so one passing by never opens it. */
export const DRAG_CATCH_DWELL_MS = 60

export interface EdgeDragLane {
  stickPosition: 'left' | 'right' | 'top'
  /** Where the bar starts and ends along the edge (y for side docks, x for top). */
  start: number
  end: number
  displayWidth: number
}

/** Distance from the screen edge, and how far past the bar's ends, of a point. */
function offsets(lane: EdgeDragLane, x: number, y: number): { depth: number; past: number } {
  const depth = lane.stickPosition === 'top' ? y : lane.stickPosition === 'right' ? lane.displayWidth - x : x
  const along = lane.stickPosition === 'top' ? x : y
  const past = along < lane.start ? lane.start - along : along > lane.end ? along - lane.end : 0
  return { depth: Math.max(0, depth), past }
}

/** 0 (far, or at the edge of the range) .. 1 (at the bar), eased so most of the growth happens close in. */
export function edgeDragPull(lane: EdgeDragLane, x: number, y: number): number {
  const { depth, past } = offsets(lane, x, y)
  const t = Math.min(1, Math.max(0, 1 - Math.hypot(depth, past) / DRAG_PULL_RANGE_PX))
  return t * t * (3 - 2 * t)
}

/** True when the drag is at the bar, close enough to open the shelf for it. */
export function inEdgeDragCatch(lane: EdgeDragLane, x: number, y: number): boolean {
  const { depth, past } = offsets(lane, x, y)
  const maxDepth = lane.stickPosition === 'top' ? DRAG_CATCH_DEPTH_TOP_PX : DRAG_CATCH_DEPTH_PX
  return depth <= maxDepth && past <= DRAG_CATCH_SLACK_PX
}

// The pull changes with every cursor update while a drag approaches, but the
// bar only moves in three steps (ready -> nearer -> close): each step is one
// short eased swell, instead of a 60 fps animation for as long as the drag
// moves (a moving bar cost ~25% of a core; three swells cost a few frames).
// The step is written straight onto the cue element as a CSS variable (one
// element restyled, no React render). A margin around each step's edge keeps
// a drag hovering on a boundary from flickering between two steps.
export const DRAG_PULL_STEPS = 3
/** Pull where each step starts: about 240px, 160px and 90px from the bar. */
export const DRAG_PULL_STEP_AT = [0.25, 0.55, 0.82]
const STEP_MARGIN = 0.04

let cueEl: HTMLElement | null = null
let step = 0

function applyPull(): void {
  cueEl?.style.setProperty('--pull', String(step / DRAG_PULL_STEPS))
}

/** The cue element registers itself while it is mounted (null on unmount). */
export function registerEdgeDragCue(el: HTMLElement | null): void {
  cueEl = el
  applyPull()
}

/** Step (0..DRAG_PULL_STEPS) for a pull; within STEP_MARGIN of an edge it stays on `current`. */
export function pullStep(t: number, current: number): number {
  let next = 0
  for (const at of DRAG_PULL_STEP_AT) if (t >= at) next++
  if (next === current) return current
  // only cross an edge once clearly past it
  const edge = next > current ? DRAG_PULL_STEP_AT[next - 1] : DRAG_PULL_STEP_AT[next]
  return Math.abs(t - edge) < STEP_MARGIN && Math.abs(next - current) === 1 ? current : next
}

export function setEdgeDragPull(t: number): void {
  const next = t <= 0 ? 0 : pullStep(t, step)
  if (next === step) return
  step = next
  applyPull()
}
