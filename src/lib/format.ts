/**
 * Small display helpers for clipboard item previews.
 */
import { t, getResolvedLanguage } from '../i18n'

/** Truncate long text for list previews. */
export function previewText(text: string, max = 160): string {
  if (!text) return ''
  const head = text.length > max * 4 ? text.slice(0, max * 4) : text
  const single = head.replace(/\s+/g, ' ').trim()
  if (single.length <= max) return single
  return single.slice(0, max - 1) + '…'
}

const sizeFormats = new Map<string, Intl.NumberFormat>()

/** One decimal, in the language's own number style ("402.3", "402,3"). */
function sizeNumber(lang: string, n: number): string {
  let f = sizeFormats.get(lang)
  if (!f) {
    f = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    sizeFormats.set(lang, f)
  }
  return f.format(n)
}

/** Human-readable byte size, with the unit the language's File Explorer uses ("402.3 KB", "402,3 Ko"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return t('units.bytes', { n: bytes })
  const lang = getResolvedLanguage()
  if (bytes < 1024 * 1024) return t('units.kb', { n: sizeNumber(lang, bytes / 1024) })
  return t('units.mb', { n: sizeNumber(lang, bytes / (1024 * 1024)) })
}

// Every card shows a relative time, so the list formats hundreds at once.
// Building an Intl formatter is far costlier than using one; reuse them.
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>()
const dateFormats = new Map<string, Intl.DateTimeFormat>()

function relativeFormat(lang: string, style: 'narrow' | 'short'): Intl.RelativeTimeFormat {
  const key = `${lang}|${style}`
  let f = relativeFormats.get(key)
  if (!f) {
    f = new Intl.RelativeTimeFormat(lang, { numeric: 'always', style })
    relativeFormats.set(key, f)
  }
  return f
}

/** Same output as `date.toLocaleDateString(lang)` (numeric year, month, day). */
function dateFormat(lang: string): Intl.DateTimeFormat {
  let f = dateFormats.get(lang)
  if (!f) {
    f = new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'numeric', day: 'numeric' })
    dateFormats.set(lang, f)
  }
  return f
}

/** Relative time formatted with native Intl locale rules (e.g. "2 дня назад", "3 hours ago"). */
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.max(0, Math.round(diff / 1000))
  if (s < 5) return t('item.justNow')

  const lang = getResolvedLanguage()

  try {
    const rtf = relativeFormat(lang, 'narrow')
    let res: string
    if (s < 60) res = rtf.format(-s, 'second')
    else if (s < 3600) res = rtf.format(-Math.round(s / 60), 'minute')
    else if (s < 86400) res = rtf.format(-Math.round(s / 3600), 'hour')
    else if (s < 604800) res = rtf.format(-Math.round(s / 86400), 'day')
    else return dateFormat(lang).format(new Date(ts))

    // In locales where narrow style outputs leading '-' without past indicator (e.g. French "-30 s", Russian "-30 с"),
    // fallback to short style which provides abbreviated units with proper past tense ("il y a 30 s", "30 сек. назад").
    if (res.startsWith('-')) {
      const rtfShort = relativeFormat(lang, 'short')
      if (s < 60) return rtfShort.format(-s, 'second')
      if (s < 3600) return rtfShort.format(-Math.round(s / 60), 'minute')
      if (s < 86400) return rtfShort.format(-Math.round(s / 3600), 'hour')
      return rtfShort.format(-Math.round(s / 86400), 'day')
    }
    return res
  } catch {
    const agoStr = t('item.ago')
    if (s < 60) return `${s}s ${agoStr}`.trim()
    const m = Math.round(s / 60)
    if (m < 60) return `${m}m ${agoStr}`.trim()
    const h = Math.round(m / 60)
    if (h < 24) return `${h}h ${agoStr}`.trim()
    const d = Math.round(h / 24)
    if (d < 7) return `${d}d ${agoStr}`.trim()
  }

  return new Date(ts).toLocaleDateString(lang)
}

/** Pull a filename out of a path, cross-platform. */
export function basename(p: string): string {
  const norm = p.replace(/\\/g, '/')
  const parts = norm.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? p
}

/** Formats a path into a clean display title (internal hashes become Screenshot or Image + time). */
export function formatImageDisplayName(
  path: string,
  capturedAt?: number,
  source?: 'screenshot' | 'image',
  originalName?: string
): string {
  if (originalName && originalName.trim()) return originalName
  const name = basename(path)
  const isInternalHash = /^[a-z0-9]{6,12}-[a-z0-9]{6,12}\.[a-z0-9]+$/i.test(name) || path.includes('edge-drop/images') || path.includes('edge-drop\\images') || path.includes('edge-drop/temp') || path.includes('edge-drop\\temp')

  if (isInternalHash) {
    const label = source === 'image' ? t('item.imageItem') : t('item.screenshot')
    if (capturedAt) {
      const d = new Date(capturedAt)
      const lang = getResolvedLanguage()
      const date = d.toLocaleDateString(lang, { month: 'short', day: 'numeric' })
      const time = d.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' })
      return t('item.imageNameAt', { label, date, time })
    }
    return label
  }
  return name
}

/** Is this a path to an image (by extension)? */
const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?|jfif|pjpeg|pjp)$/i
export function isImagePath(p: string): boolean {
  return IMG_EXT.test(p)
}
