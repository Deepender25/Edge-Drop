import { buildCatalog, type EmojiCatalog, type EmojiSourceEntry } from './catalog'

let pending: Promise<EmojiCatalog> | null = null

export function loadEmojiCatalog(): Promise<EmojiCatalog> {
  if (!pending) {
    pending = import('emoji-datasource-twitter/emoji.json').then((mod) => {
      const raw = (mod as { default?: EmojiSourceEntry[] }).default ?? (mod as unknown as EmojiSourceEntry[])
      return buildCatalog(Array.isArray(raw) ? raw : [])
    })
  }
  return pending
}
