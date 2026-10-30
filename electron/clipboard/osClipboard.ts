/**
 * The system clipboard for the main process.
 *
 * Electron 44 replaced the synchronous clipboard API (readBuffer, readHTML,
 * readImage, availableFormats, writeImage, writeBuffer ...) with an async,
 * ClipboardItem-based one. The watcher cannot simply await it: it reads one
 * format at a time between sequence-number checks, because every extra read
 * of a delay-rendered format restarts Explorer's rendering (ClipboardWatcher).
 *
 * So the reads the watcher makes inside a tick (plain text, raw formats such
 * as FileNameW and the privacy flags, the list of formats) stay synchronous
 * here: the same OpenClipboard / GetClipboardData calls Chromium made for the
 * old API, through koffi. HTML and images, which need Chromium's CF_HTML and
 * DIB/PNG handling, and every write go through Electron's async API. Measured
 * against Electron 34 on the same clipboard content: identical text, raw
 * bytes, HTML and image pixels, and writes that put the same Windows formats
 * on the clipboard.
 */
import { clipboard, ClipboardItem, nativeImage, type NativeImage } from 'electron'
import koffi from 'koffi'

const CF_BITMAP = 2
const CF_DIB = 8
const CF_UNICODETEXT = 13
const CF_HDROP = 15

interface Win32Clipboard {
  open: (hWndNewOwner: number) => boolean
  close: () => boolean
  register: (name: string) => number
  isAvailable: (format: number) => boolean
  getData: (format: number) => unknown
  size: (hMem: unknown) => number | bigint
  lock: (hMem: unknown) => unknown
  unlock: (hMem: unknown) => boolean
  copy: (dest: Buffer, src: unknown, len: number) => void
  sleep: (ms: number) => void
}
let win32: Win32Clipboard | null = null

if (process.platform === 'win32') {
  try {
    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')
    win32 = {
      open: user32.func('bool OpenClipboard(uintptr_t hWndNewOwner)'),
      close: user32.func('bool CloseClipboard()'),
      register: user32.func('uint32 RegisterClipboardFormatW(str16 lpszFormat)'),
      isAvailable: user32.func('bool IsClipboardFormatAvailable(uint32 format)'),
      getData: user32.func('void *GetClipboardData(uint32 uFormat)'),
      size: kernel32.func('size_t GlobalSize(void *hMem)'),
      lock: kernel32.func('void *GlobalLock(void *hMem)'),
      unlock: kernel32.func('bool GlobalUnlock(void *hMem)'),
      // A copy into a Node Buffer: Electron's V8 sandbox does not allow an
      // ArrayBuffer over native memory (koffi.view aborts the process).
      copy: kernel32.func('void RtlMoveMemory(_Out_ uint8_t *dest, void *src, size_t len)'),
      sleep: kernel32.func('void Sleep(uint32 dwMilliseconds)')
    }
  } catch (err) {
    console.error('[osClipboard] Failed to load the Win32 clipboard functions:', err)
  }
}

/** Registered format ids by name (RegisterClipboardFormat is stable for the session). */
const formatIds = new Map<string, number>()
function formatId(api: Win32Clipboard, name: string): number {
  let id = formatIds.get(name)
  if (id === undefined) {
    id = api.register(name)
    formatIds.set(name, id)
  }
  return id
}

/**
 * Copy one format's data off the clipboard, or null when it is absent.
 * Opening retries like Chromium's own clipboard lock (5 tries, 5ms apart):
 * another process may hold the clipboard for a moment, often Explorer
 * finishing a delayed render.
 */
function readFormat(format: number): Buffer | null {
  const api = win32
  if (!api || !format) return null
  for (let attempt = 0; attempt < 5; attempt++) {
    if (api.open(0)) {
      try {
        const handle = api.getData(format)
        if (!handle) return null
        const size = Number(api.size(handle))
        const data = api.lock(handle)
        if (!data) return null
        try {
          const out = Buffer.alloc(size)
          if (size > 0) api.copy(out, data, size)
          return out
        } finally {
          api.unlock(handle)
        }
      } finally {
        api.close()
      }
    }
    if (attempt < 4) api.sleep(5)
  }
  return null
}

/** The raw bytes of a named clipboard format (empty when absent), as `readBuffer` returned them. */
export function readBuffer(format: string): Buffer {
  if (!win32) return Buffer.alloc(0)
  return readFormat(formatId(win32, format)) ?? Buffer.alloc(0)
}

/** The clipboard's plain text (CF_UNICODETEXT, cut at its terminator), or ''. */
export function readText(): string {
  const buf = readFormat(CF_UNICODETEXT)
  if (!buf) return ''
  const text = buf.toString('utf16le', 0, buf.length - (buf.length % 2))
  const end = text.indexOf('\0')
  return end < 0 ? text : text.slice(0, end)
}

/**
 * The kinds of data on the clipboard, as the old `availableFormats()` named
 * them on Windows: Chromium's MIME types only, never raw format names (it
 * never reported FileNameW or a privacy flag; those are read by name).
 * Asks Windows per format, without opening the clipboard.
 */
export function availableFormats(): string[] {
  const api = win32
  if (!api) return []
  const has = (format: number) => {
    try {
      return api.isAvailable(format)
    } catch {
      return false
    }
  }
  const formats: string[] = []
  if (has(CF_UNICODETEXT)) formats.push('text/plain')
  if (has(formatId(api, 'HTML Format'))) formats.push('text/html')
  if (has(formatId(api, 'Rich Text Format'))) formats.push('text/rtf')
  if (has(formatId(api, 'PNG')) || has(CF_DIB) || has(CF_BITMAP)) formats.push('image/png')
  if (has(CF_HDROP)) formats.push('text/uri-list')
  return formats
}

async function clipboardEntry(type: string): Promise<Blob | null> {
  const [item] = await clipboard.read()
  if (!item || !item.types.includes(type)) return null
  const data = await item.getType(type)
  return data instanceof Blob ? data : null
}

/** The clipboard's HTML markup (what the old `readHTML` returned), or ''. */
export async function readHTML(): Promise<string> {
  try {
    const html = await clipboardEntry('text/html')
    return html ? await html.text() : ''
  } catch {
    return ''
  }
}

/** The clipboard's image (empty when there is none), as the old `readImage` returned it. */
export async function readImage(): Promise<NativeImage> {
  try {
    const png = await clipboardEntry('image/png')
    if (png) return nativeImage.createFromBuffer(Buffer.from(await png.arrayBuffer()))
  } catch {
    /* no image */
  }
  return nativeImage.createEmpty()
}

export function clear(): void {
  clipboard.clear()
}

export async function writeText(text: string): Promise<void> {
  await clipboard.writeText(text)
}

/** Text, with its HTML when given, in one write (the old `write({ text, html })`). */
export async function write(data: { text: string; html?: string }): Promise<void> {
  const entry: Record<string, string> = { 'text/plain': data.text }
  if (data.html) entry['text/html'] = data.html
  await clipboard.write([new ClipboardItem(entry)])
}

/** An image, as the old `writeImage` put it on the clipboard (a bitmap and a PNG). */
export async function writeImage(image: NativeImage): Promise<void> {
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([image.toPNG()], { type: 'image/png' }) })])
}
