/**
 * Search-focus bookkeeping shared by the search input and the store.
 *
 * While the user types in search, the shelf is temporarily OS-focusable and
 * the global toggle hotkey is paused. If the panel closes through a path
 * that skips the input's blur handler (tray toggle, hotkey, cursor leave),
 * `setOpen(false)` uses this flag to restore focusability + hotkey exactly
 * once. No imports — safe to use from both component and store modules.
 */

let searchPausedHotkey = false

export function noteSearchHotkeyPaused(paused: boolean): void {
  searchPausedHotkey = paused
}

export function takeSearchHotkeyPaused(): boolean {
  const was = searchPausedHotkey
  searchPausedHotkey = false
  return was
}
