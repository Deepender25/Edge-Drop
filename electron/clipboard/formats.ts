/**
 * Reading & categorizing the system clipboard.
 *
 * Electron's `clipboard` API doesn't emit native change events, so we poll and
 * need to detect *what kind* of thing is on the clipboard each tick. The
 * priority is: files > image > html(rich) > text. We also pull a few "rich"
 * variants out of raw Windows formats (copied files arrive as FileNameW).
 */
import { clipboard } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import koffi from 'koffi'
import type { ClipboardImageSource, ItemData } from '../../shared/types'

let getSeqNum: (() => number) | null = null
if (process.platform === 'win32') {
  try {
    const user32 = koffi.load('user32.dll')
    getSeqNum = user32.func('uint32 GetClipboardSequenceNumber()')
  } catch (err) {
    console.error('[formats] Failed to load GetClipboardSequenceNumber from user32.dll:', err)
  }
}

export function getClipboardSequenceNumber(): number {
  if (getSeqNum) {
    try {
      return getSeqNum()
    } catch {
      return 0
    }
  }
  return 0
}
import { getSystemPowerShellPath, getWritableCwd } from '../main/powershell'
import { filterValidPaths } from '../main/pathValidation'
import { isStoreBuild } from '../main/config'

const execFileAsync = promisify(execFile)

/** Windows clipboard format name for a copied-file list. */
export const CF_FILE_LIST = 'FileNameW'

/**
 * Async version: reads the full list of copied file paths via PowerShell
 * GetFileDropList(), which is the only reliable way to retrieve ALL selected
 * files from a multi-file Explorer copy (CF_HDROP / FileNameW only carries
 * the first file as a legacy single-path fallback).
 *
 * Falls back to parsing the FileNameW UTF-16LE buffer directly if PowerShell
 * is unavailable or times out.
 */
async function readFileListAsync(): Promise<string[] | null> {
  try {
    // First, confirm there is actually a file list on the clipboard before
    // spawning a process.  FileNameW being present is sufficient signal.
    const buf = clipboard.readBuffer(CF_FILE_LIST)
    if (!buf || buf.length < 4) return null

    if (process.platform === 'win32') {
      try {
        const psPath = getSystemPowerShellPath()
        // Await the result so we actually get all paths — the previous
        // implementation fired execFile with a callback that returned from
        // the closure, not from readFileList(), so the result was dropped.
        const { stdout } = await execFileAsync(
          psPath,
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetFileDropList()'
          ],
          { encoding: 'utf8', timeout: 2000, windowsHide: true, ...(isStoreBuild() ? { cwd: getWritableCwd() } : {}) }
        )
        if (stdout) {
          const paths = filterValidPaths(stdout.split(/\r?\n/).map((l) => l.trim()))
          if (paths.length > 0) return paths
        }
      } catch {
        // PowerShell timeout or locked clipboard fallback — parse buffer directly
      }
    }

    // Non-Windows or PowerShell fallback: parse the FileNameW buffer directly.
    // On Windows this will typically only return the first file, but it is
    // better than nothing when PowerShell is unavailable.
    const wide = buf.toString('utf16le')
    const parts = filterValidPaths(wide.split('\u0000').map((s) => s.trim()))
    return parts.length ? parts : null
  } catch {
    return null
  }
}

/** Fast, non-blocking check of FileNameW contents for clipboard signatures. */
function readFileListFast(): string[] | null {
  try {
    const buf = clipboard.readBuffer(CF_FILE_LIST)
    if (!buf || buf.length < 4) return null
    const wide = buf.toString('utf16le')
    const parts = wide.split('\u0000').map((s) => s.trim()).filter(Boolean)
    return parts.length ? parts : null
  } catch {
    return null
  }
}

/**
 * Build a `FileNameW` buffer suitable for `clipboard.writeBuffer()`.
 *
 * This is the reverse of `readFileList()`: UTF-16LE paths separated by NUL
 * chars, terminated with a double NUL. Writing this format lets the Windows
 * clipboard hold actual file *references* so that pasting into Explorer, Word,
 * etc. operates on the real files instead of pasting literal path strings.
 */
export function buildFileListBuffer(paths: string[]): Buffer {
  // Each path separated by NUL, then two trailing NULs to terminate the list.
  const joined = paths.join('\0') + '\0\0'
  return Buffer.from(joined, 'utf16le')
}

const URL_RE = /^(https?:\/\/|www\.)[^\s]+$/i
const COLOR_HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FILE_URL_RE = /file:\/\/\/?([^\s"'<>]+)/i

/** Turn a clipboard file:// URL into a local path if that file exists. */
export function localPathFromClipboardFileUrl(raw: string): string | null {
  const m = raw.match(FILE_URL_RE)
  if (!m) return null
  try {
    let decoded = decodeURIComponent(m[1].replace(/"/g, ''))
    if (/^[a-zA-Z]:[\\/]/.test(decoded) || decoded.startsWith('\\\\')) {
      decoded = decoded.replace(/\//g, '\\')
    } else if (/^[a-zA-Z]\//.test(decoded)) {
      decoded = decoded.replace(/^([a-zA-Z])\//, '$1:\\').replace(/\//g, '\\')
    }
    return existsSync(decoded) ? decoded : null
  } catch {
    return null
  }
}

export function extractClipboardImageFileName(text: string, html: string): string | undefined {
  const fromHtml = localPathFromClipboardFileUrl(html)
  if (fromHtml) {
    const base = fromHtml.replace(/^.*[\\/]/, '')
    if (base) return base
  }
  const fromText = localPathFromClipboardFileUrl(text)
  if (fromText) {
    const base = fromText.replace(/^.*[\\/]/, '')
    if (base) return base
  }
  const http = text.match(/^(https?:\/\/.+)\/([^/?#]+)$/i)
  if (http && /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(http[2])) {
    try {
      return decodeURIComponent(http[2])
    } catch {
      return http[2]
    }
  }
  return undefined
}

export function detectClipboardImageSource(text: string, html: string): ClipboardImageSource {
  try {
    const formats = clipboard.availableFormats().map((f) => f.toLowerCase())
    if (formats.some((f) => /screenshot|snipping|screen\s*clip|screenclip/.test(f))) {
      return 'screenshot'
    }
    if (formats.some((f) => /filegroupdescriptor|filecontents|filenamew|shell idlist/.test(f))) {
      return 'image'
    }
  } catch {
    /* ignore */
  }

  if (localPathFromClipboardFileUrl(html) || localPathFromClipboardFileUrl(text)) return 'image'
  if (/^<img\b/i.test(html.trim()) || URL_RE.test(text.trim())) return 'image'

  const trimmed = text.trim()
  if (
    trimmed &&
    !URL_RE.test(trimmed) &&
    !trimmed.includes('\t') &&
    trimmed.split(/\r?\n/).filter(Boolean).length === 1 &&
    trimmed.length <= 200
  ) {
    return 'screenshot'
  }

  if (!trimmed && !html.trim()) return 'screenshot'
  return 'image'
}

/** Sensitive clipboard formats used by password managers and transient scripts. */
const IGNORED_FORMATS = [
  'ClipboardViewerIgnore',
  'Clipboard Viewer Ignore',
  'ExcludeClipboardContentFromMonitorProcessing',
  'org.nspasteboard.ConcealedType',
  'org.nspasteboard.AutoGeneratedType',
  'com.agilebits.onepassword',
  'com.apple.is-sensitive',
  'com.apple.pasteboard.concealed',
  'KeePassClipFormat',
  'com.bitwarden.concealed'
]

/** Read a DWORD (32-bit uint) from a clipboard format, if present. */
export function _getClipboardDword(format: string): number | undefined {
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
 * Checks whether the current clipboard content is marked as sensitive, confidential,
 * or transient (e.g. by password managers, dictation tools, or macro scripts)
 * and should be ignored by clipboard monitors.
 */
export function isClipboardExcluded(): boolean {
  const formats = clipboard.availableFormats()

  if (formats.some((f) => isIgnoredFormat(f))) {
    return true
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
    return true
  }

  // CanUploadToCloudClipboard: 0 means DO NOT include
  if (checkExplicitExclusion('CanUploadToCloudClipboard', (buf) => buf.length >= 4 && buf.readUInt32LE(0) === 0)) {
    return true
  }

  // ExcludeClipboardContentFromMonitorProcessing: non-zero means EXCLUDE
  if (checkExplicitExclusion('ExcludeClipboardContentFromMonitorProcessing', (buf) => buf.length >= 4 && buf.readUInt32LE(0) !== 0)) {
    return true
  }

  // Clipboard Viewer Ignore: presence of format with data means EXCLUDE
  if (checkExplicitExclusion('Clipboard Viewer Ignore', () => true)) {
    return true
  }

  return false
}

/**
 * Async snapshot of the current clipboard into a single ItemData, or null.
 *
 * Order matters: a file copy should win over its text fallback, an image wins
/**
 * Helper to determine whether a clipboard payload containing an image and text
 * is intended as an image (e.g. Snipping Tool window capture, browser "Copy Image",
 * or screenshot tool) or as text (e.g. Excel/Google Sheets tabular data, rich text,
 * multiline documents, code).
 */
export function isScreenshotOrImageIntent(hasImage: boolean, rawText: string, rawHtml: string): boolean {
  if (!hasImage) return false
  if (!rawText) return true

  // Single bare image tag from browser "Copy Image" (e.g. <img src="...">)
  if (/^<img\b[^>]*>$/i.test(rawText) || /^<img\b[^>]*\/?>$/i.test(rawHtml)) return true

  // Single URL without any other text (browser "Copy Image" often sets image URL as text)
  if (URL_RE.test(rawText) && rawText.length < 500) return true

  // Spreadsheets (Excel, Google Sheets, Calc) & tabular text:
  // 1. Tab characters (\t) indicate column separators
  if (rawText.includes('\t')) return false

  // 2. Multiline text (multiple rows) indicates real tabular data, document paragraphs, or code
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length > 1) return false

  // 3. Spreadsheet HTML markup tags & rich office metadata
  const lowerHtml = rawHtml.toLowerCase()
  if (
    lowerHtml.includes('<table') ||
    lowerHtml.includes('<tr') ||
    lowerHtml.includes('<td') ||
    lowerHtml.includes('<th') ||
    lowerHtml.includes('google-sheets') ||
    lowerHtml.includes('data-sheets') ||
    lowerHtml.includes('urn:schemas-microsoft-com:office:spreadsheet') ||
    lowerHtml.includes('excel') ||
    lowerHtml.includes('<html') ||
    lowerHtml.includes('<body') ||
    lowerHtml.includes('<p') ||
    lowerHtml.includes('<pre') ||
    lowerHtml.includes('<code') ||
    lowerHtml.includes('<ul') ||
    lowerHtml.includes('<ol') ||
    lowerHtml.includes('<li')
  ) {
    return false
  }

  // 4. If text is long (> 200 chars), it is a text document, not a window title
  if (rawText.length > 200) return false

  // Snipping tool window mode: single-line window title text <= 200 chars without tabs or HTML structure
  return true
}

/**
 * Format text and HTML data for clipboard write back.
 *
 * 1. Normalizes line breaks to Windows CRLF (\r\n). On Windows, Microsoft Excel and
 *    other spreadsheet applications use \r\n to separate table rows. If bare \n (LF)
 *    is used, Excel interprets the newline as an in-cell line feed (Alt+Enter) and
 *    pastes the entire multiline table into a SINGLE cell!
 *
 * 2. If the text contains tab characters (\t), it represents spreadsheet tabular cells.
 *    If no valid <table> HTML is provided (or if only non-table wrappers like
 *    <google-sheets-html-origin> <div> exist), we synthesize a standard HTML <table>
 *    so that spreadsheet apps (Excel, Google Sheets, Calc) and office apps (Word, Outlook)
 *    distribute rows and columns across the cell grid rather than dumping text into one cell.
 */
export function formatTabularDataForClipboard(text: string, rawHtml?: string): { text: string; html?: string } {
  if (!text) return { text: '', html: rawHtml }

  // Normalize all line breaks to CRLF (\r\n) for Windows
  const crlfText = text.replace(/\r?\n/g, '\r\n')

  // Check if content has tab characters indicating column separators
  if (text.includes('\t')) {
    // If rawHtml already contains a standard table tag, use it
    if (rawHtml && /<table\b[^>]*>/i.test(rawHtml)) {
      return { text: crlfText, html: rawHtml }
    }

    // Otherwise, generate a clean, standard HTML table from the TSV content
    const rows = text.split(/\r?\n/)
    const htmlRows = rows.map((row) => {
      const cells = row.split('\t').map((cell) => {
        const escaped = cell
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
        return `<td>${escaped}</td>`
      }).join('')
      return `<tr>${cells}</tr>`
    }).join('')

    const htmlTable = `<table border="0" cellpadding="0" cellspacing="0"><tbody>${htmlRows}</tbody></table>`
    return { text: crlfText, html: htmlTable }
  }

  return { text: crlfText, html: rawHtml }
}

/**
 * Async snapshot of the current clipboard into a single ItemData, or null.
 *
 * Order matters: a file copy should win over its text fallback, an image wins
 * over nothing, otherwise we keep text (preferring HTML if it carries rich text).
 *
 * This is async because reading the full multi-file list from a Windows
 * Explorer copy requires a PowerShell round-trip (GetFileDropList).
 */
export async function readClipboard(): Promise<ItemData | null> {
  if (isClipboardExcluded()) {
    return null
  }

  // Files first — a file copy also places text on the clipboard, which we ignore.
  const files = await readFileListAsync()
  if (files && files.length) return { kind: 'files', paths: files }

  const img = clipboard.readImage()
  const hasImage = !img.isEmpty()
  const rawText = clipboard.readText()
  const rawHtml = clipboard.readHTML()
  const trimmedText = rawText.trim()
  const trimmedHtml = rawHtml.trim()

  const localFromHtml = localPathFromClipboardFileUrl(trimmedHtml) || localPathFromClipboardFileUrl(trimmedText)
  if (localFromHtml) return { kind: 'files', paths: [localFromHtml] }

  // Snipping Tool (Window mode, Freeform, Rectangular) or browser images:
  if (isScreenshotOrImageIntent(hasImage, trimmedText, trimmedHtml)) {
    const size = img.getSize()
    return {
      kind: 'image',
      imageId: '',
      width: size.width,
      height: size.height,
      bytes: 0,  // placeholder — ClipboardWatcher overwrites this with the actual PNG buffer length
      source: detectClipboardImageSource(trimmedText, trimmedHtml),
      fileName: extractClipboardImageFileName(trimmedText, trimmedHtml)
    }
  }

  // Text intent (Notepad, Word, VS Code text copy, Excel/Google Sheets tabular copy, rich HTML copy)
  if (trimmedText) {
    let html: string | undefined
    if (trimmedHtml && trimmedHtml !== trimmedText) html = rawHtml

    // When text contains tabs (\t), preserve the exact TSV representation (including leading/trailing tabs for empty columns)
    const textToStore = rawText.includes('\t') ? rawText.replace(/\r?\n+$/, '') : trimmedText

    const isUrl = URL_RE.test(trimmedText)
    const isColor = COLOR_HEX_RE.test(trimmedText)

    return { kind: 'text', text: textToStore, html, isUrl, isColor }
  }

  // Fallback to image if no text
  if (hasImage) {
    const size = img.getSize()
    return {
      kind: 'image',
      imageId: '',
      width: size.width,
      height: size.height,
      bytes: 0,
      source: detectClipboardImageSource(trimmedText, trimmedHtml),
      fileName: extractClipboardImageFileName(trimmedText, trimmedHtml)
    }
  }

  return null
}

/**
 * A cheap signature string used to detect that the clipboard *changed* without
 * having to construct a full ItemData or encode images.
 *
 * Strategy:
 *  - Files   → the list of paths (totally stable, always unique per copy)
 *  - Images  → dimensions + a sampled FNV-1a hash of raw pixel bytes
 *  - Text    → the text content itself
 *
 * For images we use `nativeImage.toBitmap()` (raw BGRA, no codec) and walk
 * ~400 evenly-spaced bytes through it.  This is:
 *   - Fast:   no PNG encoding, O(400) byte reads regardless of image size
 *   - Stable: same clipboard content → same pixels → same hash on every poll
 *   - Unique: different images with the same resolution produce different pixel
 *             values in practice, so collisions are astronomically unlikely
 */
export function clipboardSignature(): string {
  const seq = getClipboardSequenceNumber()
  const seqPrefix = seq > 0 ? `seq:${seq}:` : ''

  if (isClipboardExcluded()) {
    return `${seqPrefix}excluded`
  }

  // If files are on the clipboard, their paths are the most stable fingerprint.
  // Use fast, non-blocking read to avoid spawning a child process during polling.
  const files = readFileListFast()
  if (files && files.length) {
    return `${seqPrefix}files:${files.join('\n')}`
  }

  const img = clipboard.readImage()
  const hasImage = !img.isEmpty()
  const rawText = clipboard.readText().trim()
  const rawHtml = clipboard.readHTML().trim()

  if (isScreenshotOrImageIntent(hasImage, rawText, rawHtml)) {
    const size = img.getSize()
    const bitmap = img.toBitmap()  // raw BGRA — no encoding, just a memory copy

    // FNV-1a over ~400 evenly-spaced bytes.
    const step = Math.max(1, Math.floor(bitmap.length / 400))
    let hash = 0x811c9dc5 // FNV offset basis
    for (let i = 0; i < bitmap.length; i += step) {
      hash ^= bitmap[i]
      hash = Math.imul(hash, 0x01000193) >>> 0 // FNV prime, keep as uint32
    }

    return `${seqPrefix}image:${size.width}x${size.height}:${hash.toString(36)}`
  }

  // Text — the content itself is the fingerprint.
  if (rawText) {
    return `${seqPrefix}text:${rawText}`
  }

  // Fallback to image if no text
  if (hasImage) {
    const size = img.getSize()
    const bitmap = img.toBitmap()
    const step = Math.max(1, Math.floor(bitmap.length / 400))
    let hash = 0x811c9dc5
    for (let i = 0; i < bitmap.length; i += step) {
      hash ^= bitmap[i]
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return `${seqPrefix}image:${size.width}x${size.height}:${hash.toString(36)}`
  }

  return `${seqPrefix}empty`
}

/** True if the text payload looks like a single URL. */
export function isUrlText(s: string): boolean {
  return URL_RE.test(s)
}

/**
 * Pure matcher: does a clipboard signature (as produced by
 * `clipboardSignature()`) represent exactly this item's content?
 *
 * CRITICAL: signatures carry a Win32 `seq:<n>:` prefix whenever
 * GetClipboardSequenceNumber() > 0 (i.e., virtually always on Windows). The
 * comparison MUST strip that prefix first — comparing the raw string against
 * a bare `text:<content>` made every text/link ownership check silently fail,
 * so deleting an item whose content still sat on the system clipboard never
 * cleared it (and the content could then be re-captured later, appearing to
 * "come back").
 *
 * Image matching keeps the dimension-prefix heuristic (avoids a full pixel
 * read); over-clearing when two same-dimension images are involved is the
 * documented, acceptable trade-off.
 */
export function signatureMatchesItem(sig: string, data: ItemData, fullText?: string): boolean {
  const bare = sig.replace(/^seq:\d+:/, '')
  switch (data.kind) {
    case 'text': {
      const body = fullText && fullText.length > 0 ? fullText : data.text
      if (bare === `text:${body}`) return true
      // Long items store only a 300-char preview; the OS clipboard still has the full string.
      if (data.hasFullPayload && data.text && bare.startsWith(`text:${data.text}`)) return true
      return false
    }
    case 'files':
      return bare === `files:${data.paths.join('\n')}`
    case 'image':
      return bare.startsWith(`image:${data.width}x${data.height}:`)
    case 'image-collection':
      return bare.startsWith('image:')
  }
}
