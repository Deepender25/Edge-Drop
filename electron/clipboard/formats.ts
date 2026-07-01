/**
 * Reading & categorizing the system clipboard.
 *
 * Electron's `clipboard` API doesn't emit native change events, so we poll and
 * need to detect *what kind* of thing is on the clipboard each tick. The
 * priority is: files > image > html(rich) > text. We also pull a few "rich"
 * variants out of raw Windows formats (copied files arrive as FileNameW).
 */
import { clipboard } from 'electron'
import type { ItemData } from '../../shared/types'

/** Windows clipboard format name for a copied-file list. */
const CF_FILE_LIST = 'FileNameW'

/** Read the list of copied file paths (Windows), or null if none. */
function readFileList(): string[] | null {
  try {
    const buf = clipboard.readBuffer(CF_FILE_LIST)
    if (!buf || buf.length < 4) return null
    // FileNameW is a null-terminated UTF-16LE wide string. Multiple files are
    // separated by NUL chars; the whole blob ends with a double NUL.
    const wide = buf.toString('utf16le')
    const parts = wide.split('\u0000').map((s) => s.trim()).filter(Boolean)
    return parts.length ? parts : null
  } catch {
    return null
  }
}

const URL_RE = /^(https?:\/\/|www\.)[^\s]+$/i
const COLOR_HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** Sensitive clipboard formats used by password managers and transient scripts. */
const IGNORED_FORMATS = [
  'ClipboardViewerIgnore',
  'org.nspasteboard.ConcealedType',
  'com.agilebits.onepassword'
]

/** Read a DWORD (32-bit uint) from a clipboard format, if present. */
function getClipboardDword(format: string): number | undefined {
  try {
    const buf = clipboard.readBuffer(format)
    if (buf && buf.length >= 4) {
      return buf.readUInt32LE(0)
    }
    // If present but empty buffer, we can't return a number, return null to indicate presence without value
    if (buf && buf.length === 0) {
      return -1
    }
  } catch {
    // ignore
  }
  return undefined
}

/**
 * Windows registered clipboard format names are compared case-insensitively by
 * the OS, but `availableFormats()` returns whatever casing the registering app
 * used. So a privacy flag like `ExcludeClipboardContentFromMonitorProcessing`
 * may arrive in any casing — we must match it case-insensitively, otherwise
 * content a password manager / dictation tool explicitly marked "do not record"
 * still leaks into our history (and out of Windows' own Win+V history).
 */
function isIgnoredFormat(format: string): boolean {
  const lower = format.toLowerCase()
  return IGNORED_FORMATS.some((f) => f.toLowerCase() === lower)
}

/**
 * Snapshot the current clipboard into a single ItemData, or null if it's empty.
 * Order matters: a file copy should win over its text fallback, an image wins
 * over nothing, otherwise we keep text (preferring HTML if it carries rich text).
 */
export function readClipboard(): ItemData | null {
  const formats = clipboard.availableFormats()

  // Skip content that password managers / secret managers explicitly mark as
  // sensitive.
  if (formats.some((f) => isIgnoredFormat(f))) {
    return null
  }
  // Explicitly check known privacy formats because Chromium often hides them from availableFormats()
  const checkExplicitExclusion = (format: string, isExcluded: (buf: Buffer) => boolean) => {
    try {
      const buf = clipboard.readBuffer(format)
      if (!buf || buf.length === 0) return false
      return isExcluded(buf)
    } catch {
      return false
    }
  }

  // CanIncludeInClipboardHistory: 0 means DO NOT include
  if (checkExplicitExclusion('CanIncludeInClipboardHistory', (buf) => buf.length >= 4 && buf.readUInt32LE(0) === 0)) {
    return null
  }

  // CanUploadToCloudClipboard: 0 means DO NOT include
  if (checkExplicitExclusion('CanUploadToCloudClipboard', (buf) => buf.length >= 4 && buf.readUInt32LE(0) === 0)) {
    return null
  }

  // ExcludeClipboardContentFromMonitorProcessing: non-zero means EXCLUDE
  if (checkExplicitExclusion('ExcludeClipboardContentFromMonitorProcessing', (buf) => buf.length >= 4 && buf.readUInt32LE(0) !== 0)) {
    return null
  }

  // Clipboard Viewer Ignore: presence of format with data means EXCLUDE
  if (checkExplicitExclusion('Clipboard Viewer Ignore', () => true)) {
    return null
  }

  // Files first — a file copy also places text on the clipboard, which we ignore.
  const files = readFileList()
  if (files && files.length) return { kind: 'files', paths: files }

  // Text vs Image priority heuristic based on available formats.
  // When copying from Office apps, both rich text and images are placed on the clipboard.
  // When copying an image from a browser, both image and a small text fallback are placed.
  const hasText = formats.includes('text/plain')
  const hasHtml = formats.includes('text/html')
  const hasRtf = formats.includes('text/rtf')
  const hasImage = formats.includes('image/png') || formats.includes('image/jpeg')

  const rawText = clipboard.readText().trim()

  // Determine primary intent based on formatting metadata
  let isTextIntent = false
  if (rawText) {
    if (hasRtf) {
      // RTF is almost exclusively used by word processors / rich text editors.
      isTextIntent = true
    } else if (hasHtml && !hasImage) {
      // HTML without an image is definitely text.
      isTextIntent = true
    } else if (hasText && !hasImage) {
      // Plain text without an image is definitely text.
      isTextIntent = true
    } else if (hasImage) {
      // Both text and image exist.
      // If the text is very short and matches a URL, it's likely a fallback for an image copied from a browser.
      const isUrl = URL_RE.test(rawText)
      if (isUrl && rawText.length < 500) {
        isTextIntent = false
      } else {
        // If the HTML contains more than just a single img tag, it's likely rich text containing an image.
        const rawHtml = clipboard.readHTML().trim()
        if (rawHtml) {
          // A simple heuristic: if it has significant text content outside tags, it's text.
          const stripped = rawHtml.replace(/<[^>]*>?/gm, '').trim()
          if (stripped.length > 0 && stripped !== rawText && rawText.length > 10) {
            isTextIntent = true
          }
        }
      }
    }
  }

  if (isTextIntent) {
    let html: string | undefined
    const rawHtml = clipboard.readHTML().trim()
    if (rawHtml && rawHtml !== rawText) html = rawHtml

    const isUrl = URL_RE.test(rawText)
    const isColor = COLOR_HEX_RE.test(rawText)

    return { kind: 'text', text: rawText, html, isUrl, isColor }
  }

  // If it wasn't determined to be text intent, but we have an image, prioritize the image.
  const img = clipboard.readImage()
  if (!img.isEmpty()) {
    const size = img.getSize()
    return {
      kind: 'image',
      imageId: '',
      width: size.width,
      height: size.height,
      bytes: img.toPNG().length
    }
  }

  // Fallback to text if it's the only thing left
  if (rawText) {
    let html: string | undefined
    const rawHtml = clipboard.readHTML().trim()
    if (rawHtml && rawHtml !== rawText) html = rawHtml

    const isUrl = URL_RE.test(rawText)
    const isColor = COLOR_HEX_RE.test(rawText)

    return { kind: 'text', text: rawText, html, isUrl, isColor }
  }

  return null
}

/**
 * A cheap signature string used to detect that the clipboard *changed* without
 * having to construct a full ItemData or encode images to base64.
 *
 * Strategy: combine the list of available format names with quick fingerprints
 * for each content type. For images this uses the byte *length* of the PNG
 * buffer rather than encoding the whole image to a data URL (which was the
 * previous approach and was very expensive on a 600ms poll).
 */
export function clipboardSignature(): string {
  const formats = clipboard.availableFormats()
  // A cheap fingerprint of *what* is on the clipboard.
  // Sorting makes the format-key stable regardless of OS ordering.
  const fmtKey = formats.slice().sort().join('\x1f')

  // If files are on the clipboard, their paths are the most stable fingerprint.
  const files = readFileList()
  if (files && files.length) {
    return `files:${files.join('\n')}`
  }

  // Text — hash the content itself.
  const text = clipboard.readText().trim()
  if (text) {
    return `text:${text}`
  }

  // If there's an image, use available formats + byte length (no data URL).
  const img = clipboard.readImage()
  if (!img.isEmpty()) {
    const pngLen = img.toPNG().length
    return `image:${fmtKey}:${pngLen}`
  }

  return 'empty'
}

/** True if the text payload looks like a single URL. */
export function isUrlText(s: string): boolean {
  return URL_RE.test(s)
}
