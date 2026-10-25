/**
 * What counts as a copied link, and the page title a browser may copy with it.
 *
 * Shared by main (capture), the preload (drag-in) and the renderer, so a link
 * is recognized the same way wherever it comes from. Pure string work: no
 * network, no DOM.
 */

/** Links with a scheme or www.: anything without spaces. */
const SCHEME_LINK = /^(?:https?:\/\/|www\.)[^\s]+$/i
const MAILTO = /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i
const TEL = /^tel:\+?[\d\s().-]{5,}$/i

/**
 * Real top-level domains a bare "example.com/page" may end in. Kept to common
 * ones so ordinary text ("Node.js", "e.g.", "v1.2") never becomes a link.
 */
const TLDS = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'io', 'co', 'ai', 'app', 'dev', 'me', 'tv',
  'in', 'uk', 'us', 'ca', 'au', 'de', 'fr', 'jp', 'cn', 'ru', 'br', 'it', 'es', 'nl', 'se', 'no', 'fi', 'dk', 'pl',
  'ch', 'at', 'be', 'ie', 'nz', 'za', 'sg', 'hk', 'tw', 'kr', 'id', 'my', 'ph', 'vn', 'th', 'tr', 'ae', 'sa', 'il',
  'eg', 'ng', 'ke', 'pk', 'bd', 'lk', 'np', 'mx', 'ar', 'cl', 'pe', 'eu', 'asia', 'xyz', 'online', 'site', 'tech',
  'store', 'shop', 'blog', 'news', 'live', 'link', 'page', 'cloud', 'email', 'so', 'gg', 'ly', 'to', 'fm', 'sh',
  'md', 'py', 'rs', 'cc', 'ws', 'one', 'zip', 'mov', 'design', 'studio', 'art', 'wiki', 'top', 'icu', 'pro', 'gl', 'gd', 'is'
])
/** TLDs that are also common file extensions ("notes.md", "logo.ai"): need a path to count. */
const NEEDS_PATH = new Set(['md', 'py', 'rs', 'sh', 'pl', 'cc', 'zip', 'mov', 'ai', 'so', 'app', 'is', 'to', 'gd'])
const BARE_LINK = /^((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+)([a-z]{2,24})(:\d{2,5})?([/?#][^\s]*)?$/i

/** True when the whole text is one link (scheme, www., mailto:, tel:, or a bare domain). */
export function isLinkText(text: string): boolean {
  const t = typeof text === 'string' ? text.trim() : ''
  if (!t || t.length > 8192) return false
  if (SCHEME_LINK.test(t) || MAILTO.test(t) || TEL.test(t)) return true
  const m = BARE_LINK.exec(t)
  if (!m) return false
  const tld = m[2].toLowerCase()
  if (!TLDS.has(tld)) return false
  if (NEEDS_PATH.has(tld) && !m[4]) return false
  return true
}

/* ------------------------------------------------------------------ */
/* Page title copied with the link                                     */
/* ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (all, name: string) => {
    const n = name.toLowerCase()
    if (n.startsWith('#x')) {
      const code = parseInt(n.slice(2), 16)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all
    }
    if (n.startsWith('#')) {
      const code = parseInt(n.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all
    }
    return ENTITIES[n] ?? all
  })
}

/** Scheme, www., case of the host and a trailing slash don't make two links different. */
function sameLink(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^www\./i, '').replace(/\/+(?=$|[?#])/, '').toLowerCase()
  return norm(a) === norm(b)
}

const TITLE_MAX = 200

/**
 * The page title a browser put on the clipboard next to the link (Edge
 * "friendly links" and other apps copy `<a href="link">Page title</a>`).
 * Only an anchor pointing at this same link counts, and only text that isn't
 * itself a link. Undefined when there is none.
 */
export function linkTitleFromHtml(html: string | undefined, link: string): string | undefined {
  if (!html || typeof html !== 'string' || html.length > 200000 || !link) return undefined
  const re = /<a\b[^>]*?\bhref\s*=\s*(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi
  let m: RegExpExecArray | null
  let guard = 0
  while ((m = re.exec(html)) && guard++ < 50) {
    const href = decodeEntities(m[2])
    if (!sameLink(href, link)) continue
    const text = decodeEntities(m[3].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
    if (!text || sameLink(text, link) || isLinkText(text)) continue
    const chars = Array.from(text)
    return chars.length > TITLE_MAX ? chars.slice(0, TITLE_MAX - 1).join('').trimEnd() + '…' : text
  }
  return undefined
}
