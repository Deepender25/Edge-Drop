/**
 * Shared module-level paste guard across ALL item instances and preview flyouts.
 * Tracks the timestamp of the last paste so that any subsequent click
 * (including the second click of a double-click) within PASTE_COOLDOWN ms
 * is silently dropped. This synchronous, stateless guard prevents double-paste
 * across renderers and avoids async IPC races.
 */
let _lastPasteAt = 0
const PASTE_COOLDOWN = 600 // ms

export function tryPaste(fn: () => void): void {
  const now = Date.now()
  if (now - _lastPasteAt < PASTE_COOLDOWN) return
  _lastPasteAt = now
  fn()
}
