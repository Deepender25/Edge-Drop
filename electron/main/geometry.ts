export type StickPosition = 'left' | 'right'

export interface DisplayInfo {
  id: number
  workArea: { x: number; y: number; width: number; height: number }
  scaleFactor?: number
  /** True when this is the OS-designated primary display. */
  isPrimary?: boolean
}

export interface StickBoundsParams {
  position: StickPosition
  displays: DisplayInfo[]
  displayId?: number
  /**
   * Persisted workArea geometry from the previous session.
   * Used as Tier-2 fuzzy match when the OS re-assigns numeric IDs on reboot.
   */
  savedWorkArea?: { x: number; y: number; width: number; height: number }
  /** Persisted scale factor — secondary discriminator for identical-geometry monitors. */
  savedScaleFactor?: number
  windowWidth: number
  currentBounds?: { x: number; y: number }
}

export interface StickBoundsResult {
  x: number
  y: number
  width: number
  height: number
  displayId: number
  /** The resolved display, exposed so callers can persist fresh geometry. */
  resolvedDisplay: DisplayInfo
}

/**
 * Tolerance (pixels) for workArea fuzzy-match.
 *
 * Windows sometimes shifts a display's workArea origin by a few pixels after
 * a DWM restart, a driver update, or the taskbar repositioning — so exact
 * equality would miss the right monitor. 8px is well within the margin of
 * error while still being strict enough to disambiguate normal multi-monitor
 * layouts (monitors are separated by at least their own width).
 */
const BOUNDS_TOLERANCE = 8

function boundsMatch(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    Math.abs(a.x - b.x) <= BOUNDS_TOLERANCE &&
    Math.abs(a.y - b.y) <= BOUNDS_TOLERANCE &&
    Math.abs(a.width - b.width) <= BOUNDS_TOLERANCE &&
    Math.abs(a.height - b.height) <= BOUNDS_TOLERANCE
  )
}

export function computeStickBounds(params: StickBoundsParams): StickBoundsResult {
  const { position, displays, displayId, savedWorkArea, savedScaleFactor, windowWidth, currentBounds } = params

  let display: DisplayInfo | undefined

  // ── Tier 1: exact session-local numeric ID match (fast path within same session) ──
  if (displayId !== undefined) {
    display = displays.find(d => d.id === displayId)
  }

  // ── Tier 2: cross-reboot fuzzy workArea match ──────────────────────────────────
  // The OS re-assigns numeric display IDs on every Windows boot, so the saved ID
  // will never match after a restart.  Instead we match on the persisted workArea
  // geometry (within BOUNDS_TOLERANCE) and optionally the DPI scale factor as a
  // secondary discriminator when two monitors share the same resolution.
  if (!display && savedWorkArea) {
    let candidates = displays.filter(d => boundsMatch(d.workArea, savedWorkArea))
    if (candidates.length > 1 && savedScaleFactor !== undefined) {
      const byScale = candidates.filter(d => d.scaleFactor === savedScaleFactor)
      if (byScale.length) candidates = byScale
    }
    if (candidates.length > 1) {
      // Identical twins (same geometry AND scale): geometry is exhausted as a
      // discriminator by definition, so anchor on the OS-designated primary -
      // deterministic across reboots, independent of array order.
      const primaryCandidate = candidates.find(d => d.isPrimary)
      if (primaryCandidate) candidates = [primaryCandidate]
    }
    if (candidates.length >= 1) {
      // Only one unambiguous match, or the best-ranked twin.
      display = candidates[0]
    }
    // If candidates.length === 0 the saved display is genuinely gone; fall through.
  }

  // ── Tier 3: nearest-by-current-window-position (session continuity, no saved data) ──
  if (!display && displayId === undefined && currentBounds) {
    const nearest = findNearestDisplay(displays, currentBounds)
    if (nearest) display = nearest
  }

  // ── Tier 4: primary display fallback ──────────────────────────────────────────
  if (!display) {
    display = displays.find(d => d.isPrimary) ?? displays[0]
  }

  const wa = display.workArea

  let x: number
  let y: number
  const width = windowWidth
  // Use the resolved display's own height — NOT always the primary's.
  const height = wa.height

  switch (position) {
    case 'left':
      x = wa.x
      y = wa.y
      break
    case 'right':
      x = wa.x + wa.width - windowWidth
      y = wa.y
      break
  }

  return { x, y, width, height, displayId: display.id, resolvedDisplay: display }
}

function findNearestDisplay(displays: DisplayInfo[], point: { x: number; y: number }): DisplayInfo | undefined {
  let nearest: DisplayInfo | undefined
  let minDist = Infinity
  for (const d of displays) {
    const dist = centerDistSq(d, point)
    if (dist < minDist) {
      minDist = dist
      nearest = d
    }
  }
  return nearest
}

/** Squared distance from a display's center to a point (avoids sqrt). */
function centerDistSq(d: DisplayInfo, point: { x: number; y: number }): number {
  const cx = d.workArea.x + d.workArea.width / 2
  const cy = d.workArea.y + d.workArea.height / 2
  const dx = cx - point.x
  const dy = cy - point.y
  return dx * dx + dy * dy
}
