/**
 * Small display helpers for clipboard item previews.
 */
import { t, getResolvedLanguage } from '../i18n'

/** Truncate long text for list previews. */
export function previewText(text: string, max = 160): string {
  const single = text.replace(/\s+/g, ' ').trim()
  if (single.length <= max) return single
  return single.slice(0, max - 1) + '…'
}

/** Human-readable byte size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Relative time formatted with native Intl locale rules (e.g. "2 дня назад", "3 hours ago"). */
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.max(0, Math.round(diff / 1000))
  if (s < 5) return t('item.justNow')

  const lang = getResolvedLanguage()

  try {
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'always', style: 'long' })
    if (s < 60) return rtf.format(-s, 'second')
    const m = Math.round(s / 60)
    if (m < 60) return rtf.format(-m, 'minute')
    const h = Math.round(m / 60)
    if (h < 24) return rtf.format(-h, 'hour')
    const d = Math.round(h / 24)
    if (d < 7) return rtf.format(-d, 'day')
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

/** Formats a path into a clean display title (converts internal hash IDs to human screenshot titles). */
export function formatImageDisplayName(path: string, capturedAt?: number): string {
  const name = basename(path)
  const isInternalHash = /^[a-z0-9]{6,12}-[a-z0-9]{6,12}\.[a-z0-9]+$/i.test(name) || path.includes('edge-drop/images') || path.includes('edge-drop\\images') || path.includes('edge-drop/temp') || path.includes('edge-drop\\temp')
  
  if (isInternalHash) {
    const screenshotLabel = t('item.screenshot')
    if (capturedAt) {
      const d = new Date(capturedAt)
      const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      return `${screenshotLabel} ${dateStr}, ${timeStr}`
    }
    return screenshotLabel
  }
  return name
}

/** Is this a path to an image (by extension)? */
const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?|jfif|pjpeg|pjp)$/i
export function isImagePath(p: string): boolean {
  return IMG_EXT.test(p)
}
