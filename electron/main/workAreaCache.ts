/**
 * Versioned cache for the stick display's work area.
 *
 * WHY THIS EXISTS
 * ---------------
 * The cursor poll reads this cache ~60x/sec. Historically the cache was a
 * bare rectangle refreshed by (a) a fragile "equals exactly 1920x1080"
 * sentinel each tick and (b) OS display events - but NOT when the user
 * switched the stick display in Settings or the tray. Result: the window
 * moved to the new monitor while edge detection kept measuring against the
 * OLD monitor's origin, producing the classic report "hovering my second
 * screen does nothing; hovering the PRIMARY screen opens the panel on the
 * secondary".
 *
 * Contract of this cache:
 *  - Versioned by stick display id: `get(id)` rebuilds automatically when
 *    the value was built for a different id (fixes the stale-frame bug).
 *  - Last-known-good retention: a failed enumeration NEVER wipes a working
 *    rectangle (the poll keeps flying), but the failure is logged loudly
 *    instead of being swallowed.
 *  - Returns null only when no successful lookup has EVER happened.
 *  - O(1) per call; rebuilds happen only on identity change or explicit
 *    refresh() - zero recurring cost, zero retained growth.
 */

export interface WorkAreaRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ResolvedWorkArea {
  displayId: number
  workArea: WorkAreaRect
}

export class WorkAreaCache {
  private entry: { id: number | undefined; workArea: WorkAreaRect } | null = null

  constructor(
    /**
     * Resolves the CURRENT work area for the given stick display id
     * (undefined means "no explicit preference -> primary"). Return null
     * when nothing resolvable exists; throw freely - failures are captured.
     */
    private readonly lookup: (displayId: number | undefined) => ResolvedWorkArea | null
  ) {}

  /**
   * Cached read for the given stick id. Rebuilds automatically when the
   * cache is empty or versioned for a different id.
   */
  get(displayId: number | undefined): WorkAreaRect | null {
    if (!this.entry || this.entry.id !== displayId) {
      this.refresh(displayId)
    }
    return this.entry ? this.entry.workArea : null
  }

  /** Force a re-read (display topology events, stick re-resolution). */
  refresh(displayId: number | undefined): void {
    try {
      const resolved = this.lookup(displayId)
      if (resolved && resolved.workArea) {
        this.entry = { id: displayId, workArea: { ...resolved.workArea } }
      }
    } catch (err) {
      console.error('[WorkAreaCache] refresh failed; retaining last-known-good:', err)
    }
  }

  /** Test/diagnostic introspection. */
  get versionedFor(): number | undefined {
    return this.entry?.id
  }
}
