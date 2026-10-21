/**
 * Search over labels and tags.
 *
 * A query is split into `#tag` filters and plain text:
 *   "invoice"          -> text match (content, file names, label, tags)
 *   "#work"            -> items with a tag starting with "work"
 *   "#work #client-a"  -> items with both
 *   "#work invoice"    -> tag "work..." AND text "invoice"
 * A query without any `#word` behaves exactly as before: one substring.
 */
import { normalizeTag } from '../../shared/itemMeta'

export interface ParsedQuery {
  /** Lowercased plain-text part ('' when only tags were typed). */
  text: string
  /** Normalized tag prefixes from `#word` tokens. */
  tags: string[]
}

export function parseQuery(raw: string): ParsedQuery {
  const q = raw.trim()
  if (!q.includes('#')) return { text: q.toLowerCase(), tags: [] }
  const tags: string[] = []
  const words: string[] = []
  for (const token of q.split(/\s+/)) {
    if (token.startsWith('#')) {
      const tag = normalizeTag(token)
      if (tag && !tags.includes(tag)) tags.push(tag)
    } else if (token) {
      words.push(token)
    }
  }
  return { text: words.join(' ').toLowerCase(), tags }
}

/** Label/tag part of a text search (the content part lives with the item kinds). */
export function metaMatchesText(item: { label?: string; tags?: readonly string[] }, needle: string): boolean {
  if (!needle) return true
  if (item.label && item.label.toLowerCase().includes(needle)) return true
  const bare = needle.startsWith('#') ? needle.slice(1) : needle
  return !!bare && !!item.tags?.some((tag) => tag.includes(bare))
}

/** Every `#tag` filter must match one of the item's tags by prefix. */
export function matchesTagFilters(item: { tags?: readonly string[] }, filters: readonly string[]): boolean {
  if (filters.length === 0) return true
  const tags = item.tags
  if (!tags || tags.length === 0) return false
  return filters.every((f) => tags.some((tag) => tag.startsWith(f)))
}

/** How many items use each tag. */
export function tagCounts(items: ReadonlyArray<{ tags?: readonly string[] }>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const it of items) {
    if (!it.tags) continue
    for (const tag of it.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return counts
}

/** Most-used tags first (then A-Z) whose name starts with `prefix`. */
export function suggestTags(
  counts: ReadonlyMap<string, number>,
  prefix: string,
  opts: { exclude?: readonly string[]; limit?: number } = {}
): Array<{ tag: string; count: number }> {
  const p = prefix ? normalizeTag(prefix) ?? '' : ''
  const exclude = new Set(opts.exclude ?? [])
  const out: Array<{ tag: string; count: number }> = []
  for (const [tag, count] of counts) {
    if (exclude.has(tag)) continue
    if (p && !tag.startsWith(p)) continue
    out.push({ tag, count })
  }
  out.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  return out.slice(0, opts.limit ?? 8)
}

/**
 * When the last thing typed is a `#word` (or a lone `#`), the part after
 * '#' that tag suggestions should complete; otherwise null.
 */
export function activeTagPrefix(query: string): string | null {
  const m = /(?:^|\s)#([^\s#]*)$/.exec(query)
  return m ? m[1] : null
}

/** Replace the trailing `#word` of the query with `#tag ` (suggestion click). */
export function completeTag(query: string, tag: string): string {
  return query.replace(/(^|\s)#[^\s#]*$/, `$1#${tag} `)
}
