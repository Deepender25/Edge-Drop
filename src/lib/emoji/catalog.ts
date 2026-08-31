/**
 * Compact Unicode emoji catalog.
 *
 * Artwork in the picker is Twemoji (CC-BY 4.0, Twitter/X and contributors).
 * Paste is always the Unicode character — the receiving app draws it with
 * its own font. See https://github.com/twitter/twemoji
 */

export interface EmojiSourceSkin {
  unified: string
  image?: string
  has_img_twitter?: boolean
}

export interface EmojiSourceEntry {
  unified: string
  name?: string
  short_name?: string
  image?: string
  category: string
  sort_order?: number
  has_img_twitter?: boolean
  obsoleted_by?: string
  skin_variations?: Record<string, EmojiSourceSkin>
}

export interface EmojiSkin {
  unified: string
  file: string
}

export interface EmojiEntry {
  unified: string
  name?: string
  shortName?: string
  file: string
  category: string
  sort: number
  skins?: Record<string, EmojiSkin>
}

export interface EmojiCatalog {
  byCategory: Record<string, EmojiEntry[]>
  byUnified: Map<string, EmojiEntry>
  all: EmojiEntry[]
}

export const SKIN_TONE_KEYS = ['1F3FB', '1F3FC', '1F3FD', '1F3FE', '1F3FF'] as const
export type SkinToneKey = (typeof SKIN_TONE_KEYS)[number]

export const SKIN_TONES: ReadonlyArray<{ id: number; key: SkinToneKey | null; color: string; label: string }> = [
  { id: 0, key: null, color: '#FFCC4D', label: 'Default' },
  { id: 1, key: '1F3FB', color: '#F7D7C4', label: 'Light' },
  { id: 2, key: '1F3FC', color: '#E0BB95', label: 'Medium-light' },
  { id: 3, key: '1F3FD', color: '#BF8F68', label: 'Medium' },
  { id: 4, key: '1F3FE', color: '#9B643D', label: 'Medium-dark' },
  { id: 5, key: '1F3FF', color: '#5A4637', label: 'Dark' }
]

export const CATEGORY_ORDER = [
  { id: 'recents', sources: [] as const, labelKey: 'emoji.recents' },
  { id: 'smileys', sources: ['Smileys & Emotion', 'People & Body'] as const, labelKey: 'emoji.smileys' },
  { id: 'animals', sources: ['Animals & Nature'] as const, labelKey: 'emoji.animals' },
  { id: 'food', sources: ['Food & Drink'] as const, labelKey: 'emoji.food' },
  { id: 'travel', sources: ['Travel & Places'] as const, labelKey: 'emoji.travel' },
  { id: 'activities', sources: ['Activities'] as const, labelKey: 'emoji.activities' },
  { id: 'objects', sources: ['Objects'] as const, labelKey: 'emoji.objects' },
  { id: 'symbols', sources: ['Symbols', 'Flags'] as const, labelKey: 'emoji.symbols' }
] as const

export type EmojiCategoryId = (typeof CATEGORY_ORDER)[number]['id']

const SKIP_CATEGORIES = new Set(['Component'])

export { isPasteableEmoji } from '../../../shared/emoji'

export function unifiedToNative(unified: string): string {
  return unified
    .split('-')
    .filter(Boolean)
    .map((h) => String.fromCodePoint(parseInt(h, 16)))
    .join('')
}

export function emojiGlyphUrl(file: string): string {
  return `edgelocal://emoji/${file.toLowerCase()}`
}

function fileOf(image: string | undefined, unified: string): string {
  if (image && image.toLowerCase().endsWith('.png')) return image.toLowerCase()
  return `${unified.toLowerCase()}.png`
}

function cleanEmojiName(rawName?: string, rawShort?: string): string | undefined {
  if (!rawName) return rawShort ? `:${rawShort}:` : undefined
  let name = rawName.split(':')[0].trim()
  name = name.replace(/^flag for\s+/i, '').replace(/^flag:\s+/i, '')
  return name.toLowerCase().replace(/(^|\s)\S/g, (t) => t.toUpperCase())
}

export function buildCatalog(raw: readonly EmojiSourceEntry[]): EmojiCatalog {
  const all: EmojiEntry[] = []
  const byCategory: Record<string, EmojiEntry[]> = {}
  const byUnified = new Map<string, EmojiEntry>()

  for (const src of raw) {
    if (!src || src.has_img_twitter === false) continue
    if (SKIP_CATEGORIES.has(src.category)) continue
    if (src.obsoleted_by) continue
    if (!src.unified || !src.category) continue

    const skins: Record<string, EmojiSkin> = {}
    if (src.skin_variations) {
      for (const key of SKIN_TONE_KEYS) {
        const v = src.skin_variations[key]
        if (!v || v.has_img_twitter === false || !v.unified) continue
        skins[key] = { unified: v.unified, file: fileOf(v.image, v.unified) }
      }
    }

    const entry: EmojiEntry = {
      unified: src.unified,
      name: cleanEmojiName(src.name, src.short_name),
      shortName: src.short_name ? `:${src.short_name}:` : undefined,
      file: fileOf(src.image, src.unified),
      category: src.category,
      sort: typeof src.sort_order === 'number' ? src.sort_order : 9999,
      skins: Object.keys(skins).length > 0 ? skins : undefined
    }
    all.push(entry)
    byUnified.set(entry.unified, entry)
    if (entry.skins) {
      for (const skin of Object.values(entry.skins)) {
        byUnified.set(skin.unified, entry)
      }
    }
    const bucket = byCategory[entry.category] ?? (byCategory[entry.category] = [])
    bucket.push(entry)
  }

  for (const list of Object.values(byCategory)) {
    list.sort((a, b) => a.sort - b.sort || a.unified.localeCompare(b.unified))
  }
  all.sort((a, b) => a.sort - b.sort || a.unified.localeCompare(b.unified))

  return { byCategory, byUnified, all }
}

export function applySkin(entry: EmojiEntry, toneKey: SkinToneKey | null): { unified: string; file: string } {
  if (!toneKey || !entry.skins?.[toneKey]) {
    return { unified: entry.unified, file: entry.file }
  }
  return entry.skins[toneKey]
}

export function hasSkinTones(entry: EmojiEntry): boolean {
  return !!entry.skins && Object.keys(entry.skins).length > 0
}

/** Default glyph plus every available Fitzpatrick variant for the popup. */
export function skinChoices(entry: EmojiEntry): Array<{ unified: string; file: string; key: SkinToneKey | null }> {
  const base = { unified: entry.unified, file: entry.file, key: null as SkinToneKey | null }
  if (!entry.skins) return [base]
  const variants = SKIN_TONE_KEYS.flatMap((key) => {
    const skin = entry.skins?.[key]
    return skin ? [{ unified: skin.unified, file: skin.file, key }] : []
  })
  return [base, ...variants]
}

/** Resolve a base or skin-tone unified code to its parent entry and PNG. */
export function resolveGlyph(
  catalog: EmojiCatalog,
  unified: string
): { entry: EmojiEntry; unified: string; file: string } | null {
  const entry = catalog.byUnified.get(unified)
  if (!entry) return null
  if (entry.unified === unified) return { entry, unified, file: entry.file }
  const skin = entry.skins ? Object.values(entry.skins).find((s) => s.unified === unified) : undefined
  if (skin) return { entry, unified: skin.unified, file: skin.file }
  return { entry, unified: entry.unified, file: entry.file }
}

export const MAX_RECENTS = 7 * 11 // 77 items (exactly 11 full rows in the 7-column grid)

export function pushRecent(recents: readonly string[], unified: string): string[] {
  const next = [unified, ...recents.filter((u) => u !== unified)]
  return next.slice(0, MAX_RECENTS)
}
