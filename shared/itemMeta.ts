/**
 * User-given metadata on a clipboard item: one short label and a few tags.
 *
 * Both are optional, live at the top level of the item (not inside `data`, so
 * dedup, touch and the DTO keep them unchanged) and are searchable. The main
 * process normalizes every write through these functions, so whatever the
 * renderer sends, only clean values are ever stored.
 */

export const LABEL_MAX = 60
export const TAG_MAX_LEN = 24
export const TAGS_MAX = 5

export interface ItemMetaPatch {
  /** New label; empty / null removes it. Omitted keeps the current one. */
  label?: string | null
  /** New tag list; empty / null removes all. Omitted keeps the current ones. */
  tags?: string[] | null
}

/** Cut a string to `max` characters without splitting a surrogate pair. */
function clip(value: string, max: number): string {
  const chars = Array.from(value)
  return chars.length > max ? chars.slice(0, max).join('') : value
}

/**
 * One line of plain text: control characters and runs of whitespace become a
 * single space, trimmed, at most LABEL_MAX characters. Empty -> undefined.
 */
export function normalizeLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const flat = value.replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim()
  const out = clip(flat, LABEL_MAX).trim()
  return out || undefined
}

/**
 * A tag is one lowercase word: a leading '#' is dropped, spaces become '-',
 * and only letters, marks and numbers (any language) plus - _ . + are kept.
 * At most TAG_MAX_LEN characters. Empty -> undefined.
 */
export function normalizeTag(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  let tag = value.trim().replace(/^#+/, '').toLowerCase()
  tag = tag.replace(/\s+/g, '-').replace(/[^\p{L}\p{M}\p{N}_.+-]/gu, '')
  tag = tag.replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '')
  tag = clip(tag, TAG_MAX_LEN).replace(/[-.]+$/g, '')
  return tag || undefined
}

/** Clean, de-duplicated tags in their given order, at most TAGS_MAX. Empty -> undefined. */
export function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: string[] = []
  for (const raw of value) {
    const tag = normalizeTag(raw)
    if (tag && !out.includes(tag)) out.push(tag)
    if (out.length >= TAGS_MAX) break
  }
  return out.length > 0 ? out : undefined
}

/** Tags of `a` followed by the new ones of `b`, normalized and capped. */
export function combineTags(a: readonly string[] | undefined, b: readonly string[] | undefined): string[] | undefined {
  return normalizeTags([...(a ?? []), ...(b ?? [])])
}

/** True when the item carries a label or at least one tag. */
export function hasItemMeta(item: { label?: string; tags?: readonly string[] }): boolean {
  return !!item.label || (Array.isArray(item.tags) && item.tags.length > 0)
}
