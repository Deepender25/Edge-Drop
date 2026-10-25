/**
 * The user's note on a clipboard item: one line of plain text that says what
 * it is ("Office Wi-Fi password", "Invoice for Acme, March"), so search finds
 * it later and the card is recognizable.
 *
 * It lives at the top level of the item (not inside `data`, so dedup, touch
 * and the DTO keep it unchanged). The main process normalizes every write
 * through these functions, so whatever the renderer sends, only clean values
 * are ever stored. A note also keeps the item: history limit, auto-delete,
 * clear-on-restart and the Clear button leave it alone (see isKept).
 */

export const NOTE_MAX = 120

export interface ItemMetaPatch {
  /** New note; empty / null removes it. Omitted keeps the current one. */
  note?: string | null
}

/** Cut a string to `max` characters without splitting a surrogate pair. */
function clip(value: string, max: number): string {
  const chars = Array.from(value)
  return chars.length > max ? chars.slice(0, max).join('') : value
}

/**
 * One line of plain text: control characters and runs of whitespace become a
 * single space, trimmed, at most NOTE_MAX characters. Empty -> undefined.
 */
export function normalizeNote(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const flat = value.replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim()
  const out = clip(flat, NOTE_MAX).trim()
  return out || undefined
}

/** Two notes as one (merging cards): both, once each, joined with " · ". */
export function joinNotes(a: string | undefined, b: string | undefined): string | undefined {
  if (!a || !b) return normalizeNote(a ?? b)
  if (a.toLowerCase() === b.toLowerCase()) return normalizeNote(a)
  return normalizeNote(`${a} · ${b}`)
}

/**
 * The note for an item saved before notes replaced labels and tags: the
 * label, then the tags as words ("Wifi password · home network").
 */
export function noteFromLegacy(label: unknown, tags: unknown): string | undefined {
  const words = Array.isArray(tags)
    ? tags.filter((t): t is string => typeof t === 'string').map((t) => t.replace(/^#+/, '').trim()).filter(Boolean).join(' ')
    : ''
  return joinNotes(normalizeNote(label), normalizeNote(words))
}

/** Kept items survive every automatic or bulk removal: pinned, or noted. */
export function isKept(item: { pinned?: boolean; note?: string }): boolean {
  return !!item.pinned || !!item.note
}
