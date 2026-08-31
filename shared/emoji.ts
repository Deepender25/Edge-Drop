/** Shared emoji-paste guards used by main (IPC) and renderer tests. */

export function isPasteableEmoji(text: string): boolean {
  if (typeof text !== 'string') return false
  const s = text.trim()
  if (s.length < 1 || s.length > 64) return false
  if (/[\n\r\t]/.test(s)) return false
  return true
}
