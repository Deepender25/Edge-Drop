/**
 * Shelf search: every word typed must appear somewhere in the item, in any
 * order, across what it holds (text, file names) and the user's note.
 *
 *   "acme invoice"  finds a note "Invoice for Acme, March"
 *   "wifi office"   finds "Office Wi-Fi password"
 *
 * Matching ignores case and accents ("resume" finds "Résumé"), and a word
 * also matches with punctuation and spaces taken out on both sides, so
 * "wifi" finds "Wi-Fi" and "e-mail" finds "email".
 */

/** Lowercase, accents removed. */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
}

/** Only the letters and digits of a folded string. */
function packText(s: string): string {
  return s.replace(/[^\p{L}\p{N}]+/gu, '')
}

export interface SearchWord {
  /** The word folded. */
  word: string
  /** Its letters and digits only ('' for a word that is all punctuation). */
  packed: string
}

/** The words of a query ([] for an empty one). */
export function queryWords(query: string): SearchWord[] {
  return foldText(query)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({ word, packed: packText(word) }))
}

export interface SearchText {
  folded: string
  packed: string
}

/** An item's searchable text, folded once. */
export function searchText(parts: ReadonlyArray<string | undefined>): SearchText {
  const folded = foldText(parts.filter(Boolean).join('\n'))
  return { folded, packed: packText(folded) }
}

/** True when every word is found in the text. */
export function matchesWords(text: SearchText, words: readonly SearchWord[]): boolean {
  for (const w of words) {
    if (text.folded.includes(w.word)) continue
    if (w.packed && text.packed.includes(w.packed)) continue
    return false
  }
  return true
}
