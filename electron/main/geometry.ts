export type StickPosition = 'left' | 'right'

export interface DisplayInfo {
  id: number
  workArea: { x: number; y: number; width: number; height: number }
  /** Full display bounds (unlike workArea, not reduced by any taskbar). */
  bounds?: { x: number; y: number; width: number; height: number }
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
  windowHeight: number
  currentBounds?: { x: number; y: number }
  /** When true, offset past a detected vertical taskbar to the true screen edge. */
  ignoreVerticalTaskbar?: boolean
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
  const { position, displays, displayId, savedWorkArea, savedScaleFactor, windowWidth, currentBounds, ignoreVerticalTaskbar } = params

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
    const candidates = displays.filter(d => boundsMatch(d.workArea, savedWorkArea))
    if (candidates.length === 1) {
      // Only one display matches the stored geometry — unambiguous.
      display = candidates[0]
    } else if (candidates.length > 1 && savedScaleFactor !== undefined) {
      // Multiple displays with the same geometry (e.g. dual same-res). Use
      // scale factor as a tiebreaker.
      const byScale = candidates.find(d => d.scaleFactor === savedScaleFactor)
      display = byScale ?? candidates[0]
    } else if (candidates.length > 1) {
      // Tie with no scale discriminator — take the first candidate.
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
  // Fall back to workArea if bounds wasn't supplied by the caller, so this
  // stays backwards-compatible with any other call site.
  const bounds = display.bounds ?? wa

  let x: number
  let y: number
  const width = windowWidth
  // Use the resolved display's own height — NOT always the primary's.
  const height = wa.height

  switch (position) {
    case 'left': {
      // A vertical taskbar docked left insets workArea.x rightward from
      // bounds.x. A top/bottom taskbar never touches x, so this check
      // naturally ignores horizontal taskbars.
      const hasVerticalTaskbar = bounds.x < wa.x
      x = (ignoreVerticalTaskbar && hasVerticalTaskbar) ? bounds.x : wa.x
      y = wa.y
      break
    }
    case 'right': {
      const hasVerticalTaskbar = (bounds.x + bounds.width) > (wa.x + wa.width)
      x = (ignoreVerticalTaskbar && hasVerticalTaskbar)
        ? bounds.x + bounds.width - windowWidth
        : wa.x + wa.width - windowWidth
      y = wa.y
      break
    }
  }

  return { x, y, width, height, displayId: display.id, resolvedDisplay: display }
}

function findNearestDisplay(displays: DisplayInfo[], point: { x: number; y: number }): DisplayInfo | undefined {
  let nearest: DisplayInfo | undefined
  let minDist = Infinity
  for (const d of displays) {
    const cx = d.workArea.x + d.workArea.width / 2
    const cy = d.workArea.y + d.workArea.height / 2
    const dx = cx - point.x
    const dy = cy - point.y
    const dist = dx * dx + dy * dy
    if (dist < minDist) {
      minDist = dist
      nearest = d
    }
  }
  return nearest
}
