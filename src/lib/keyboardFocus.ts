/**
 * Borrow and return OS keyboard focus for a text field in the shelf.
 *
 * The shelf never takes focus on its own (clicks must paste into the user's
 * app). A field that needs typing calls acquireKeyboard() on pointer-down —
 * a NOACTIVATE window may never fire a focus event from a plain click — and
 * releaseKeyboard() on every exit. Holders are counted (searchFocus.ts), so
 * search and the note editor can hand over to each other.
 *
 * Giving focus back is deferred a moment and cancelled if anyone takes it
 * again meanwhile. Without that, a release immediately followed by an
 * acquire (a hand-over between fields, or React StrictMode running an
 * effect's cleanup + setup back to back in dev) reached the main process as
 * focus(false) + focus(true): the release's verified foreground repair kept
 * retrying in the background and handed the foreground back to the user's
 * app right after the new acquire, so the field lost the keyboard at once.
 */
import { edge } from './edge'
import { holdsFocus, noteFocusHolder, takeSearchEngaged } from './searchFocus'

/** How long the last release waits before focus really goes back. */
export const KEYBOARD_RELEASE_DELAY_MS = 150

let pending: Promise<void> | undefined
/** True from the focus(true) request until the matching focus(false). */
let focusRequested = false
let releaseTimer: ReturnType<typeof setTimeout> | null = null

function cancelPendingRelease(): void {
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer)
    releaseTimer = null
  }
}

function giveFocusBack(): void {
  cancelPendingRelease()
  if (!focusRequested) return
  focusRequested = false
  pending = undefined
  try {
    void edge.focusWindow(false)?.catch?.(() => {})
  } catch { /* ignore */ }
  try {
    void edge.pauseHotkey(false)?.catch?.(() => {})
  } catch { /* ignore */ }
}

/** Make the shelf focusable for `owner`. Resolves once main applied it. */
export function acquireKeyboard(owner: string): Promise<void> {
  noteFocusHolder(owner, true)
  // A release still waiting to happen is simply cancelled: focus never left.
  cancelPendingRelease()
  if (focusRequested) return pending ?? Promise.resolve()
  focusRequested = true
  try {
    // globalThis: this module is also compiled by the DOM-less node config
    // (the store imports it).
    ;(globalThis as { focus?: () => void }).focus?.()
  } catch { /* ignore */ }
  let p: Promise<void> = Promise.resolve()
  try {
    const r = edge.focusWindow(true) as unknown as Promise<void> | undefined
    if (r && typeof r.then === 'function') p = r.catch(() => {})
  } catch { /* ignore */ }
  try {
    void edge.pauseHotkey(true)?.catch?.(() => {})
  } catch { /* ignore */ }
  pending = p
  void p.then(() => {
    if (pending === p) pending = undefined
  })
  return p
}

/** Release `owner`'s hold; when nobody holds focus any more, hand it back shortly. */
export function releaseKeyboard(owner: string): void {
  const { last } = noteFocusHolder(owner, false)
  if (!last || !focusRequested) return
  cancelPendingRelease()
  releaseTimer = setTimeout(() => {
    releaseTimer = null
    if (!holdsFocus()) giveFocusBack()
  }, KEYBOARD_RELEASE_DELAY_MS)
}

/**
 * The panel is closing: drop every holder and hand focus back now (no
 * delay). Returns true when focus had been taken.
 */
export function releaseAllKeyboard(): boolean {
  const held = takeSearchEngaged()
  const wasRequested = focusRequested
  giveFocusBack()
  return held || wasRequested
}
