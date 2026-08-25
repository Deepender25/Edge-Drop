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
