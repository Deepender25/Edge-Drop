/**
 * Keyboard-focus bookkeeping shared by every text field in the shelf (the
 * search box and the label/tag editor) and the store.
 *
 * Typing needs the shelf to be temporarily OS-focusable with the global
 * toggle hotkey paused. Several fields can hold that at once (search still
 * focused while the tag editor opens), so holders are counted by name: the
 * first holder turns focusability on, the last one to let go turns it off.
 * If the panel closes through a path that skips a field's blur (tray toggle,
 * cursor leave), the store's setOpen(false) takes all holders and restores
 * focusability + hotkey exactly once. No imports — safe from both component
 * and store modules.
 */

const holders = new Set<string>()

/**
 * Record that `owner` now holds (or released) keyboard focus. `first` is true
 * when this made the shelf go from no holder to one; `last` when it went from
 * one holder to none. Repeated calls for the same owner are no-ops.
 */
export function noteFocusHolder(owner: string, held: boolean): { first: boolean; last: boolean } {
  if (held) {
    if (holders.has(owner)) return { first: false, last: false }
    const first = holders.size === 0
    holders.add(owner)
    return { first, last: false }
  }
  if (!holders.delete(owner)) return { first: false, last: false }
  return { first: false, last: holders.size === 0 }
}

/** Whether `owner` (or, without an argument, anyone) holds keyboard focus. */
export function holdsFocus(owner?: string): boolean {
  return owner ? holders.has(owner) : holders.size > 0
}

export function noteSearchEngaged(engaged: boolean): void {
  noteFocusHolder('search', engaged)
}

/** Drop every holder; true when there was at least one (so focus must be restored). */
export function takeSearchEngaged(): boolean {
  const was = holders.size > 0
  holders.clear()
  return was
}
