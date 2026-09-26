/**
 * Search-focus bookkeeping shared by the search input and the store.
 *
 * While the user types in search, the shelf is temporarily OS-focusable and
 * the global toggle hotkey is paused. If the panel closes through a path
 * that skips the input's blur handler (tray toggle, cursor leave), the
 * store's setOpen(false) uses this flag to restore focusability + hotkey
 * exactly once. No imports — safe from both component and store modules.
 */

let searchEngaged = false

export function noteSearchEngaged(engaged: boolean): void {
  searchEngaged = engaged
}

export function takeSearchEngaged(): boolean {
  const was = searchEngaged
  searchEngaged = false
  return was
}
