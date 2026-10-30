import { beforeEach, describe, expect, it, vi } from 'vitest'

// A fake Win32 clipboard: format id -> bytes, plus the calls the module makes.
const win = vi.hoisted(() => ({
  data: new Map<number, Buffer>(),
  registered: new Map<string, number>(),
  openFailures: 0,
  opens: 0,
  sleeps: [] as number[],
  isOpen: false
}))

vi.mock('koffi', () => {
  const handles = new Map<number, Buffer>()
  const impl: Record<string, (...args: any[]) => unknown> = {
    OpenClipboard: () => {
      win.opens++
      if (win.openFailures > 0) {
        win.openFailures--
        return false
      }
      win.isOpen = true
      return true
    },
    CloseClipboard: () => {
      win.isOpen = false
      return true
    },
    RegisterClipboardFormatW: (name: string) => {
      if (!win.registered.has(name)) win.registered.set(name, 0xc000 + win.registered.size)
      return win.registered.get(name)
    },
    IsClipboardFormatAvailable: (format: number) => win.data.has(format),
    GetClipboardData: (format: number) => {
      if (!win.isOpen) throw new Error('clipboard not open')
      const buf = win.data.get(format)
      if (!buf) return null
      handles.set(format, buf)
      return { format }
    },
    GlobalSize: (h: { format: number }) => handles.get(h.format)!.length,
    GlobalLock: (h: { format: number }) => h,
    GlobalUnlock: () => true,
    RtlMoveMemory: (dest: Buffer, src: { format: number }, len: number) => handles.get(src.format)!.copy(dest, 0, 0, len),
    Sleep: (ms: number) => win.sleeps.push(ms)
  }
  const load = () => ({ func: (sig: string) => impl[sig.match(/(\w+)\(/)![1]] })
  return { default: { load } }
})

const electron = vi.hoisted(() => ({
  written: [] as Record<string, unknown>[][],
  items: [] as { types: string[]; getType: (t: string) => Promise<Blob> }[]
}))

vi.mock('electron', () => {
  class ClipboardItem {
    constructor(public entries: Record<string, unknown>) {}
  }
  return {
    ClipboardItem,
    clipboard: {
      clear: vi.fn(),
      read: vi.fn(async () => electron.items),
      writeText: vi.fn(async () => {}),
      write: vi.fn(async (items: { entries: Record<string, unknown> }[]) => {
        electron.written.push(items.map((i) => i.entries))
      })
    },
    nativeImage: {
      createEmpty: () => ({ isEmpty: () => true }),
      createFromBuffer: (b: Buffer) => ({ isEmpty: () => false, png: b })
    }
  }
})

import { availableFormats, readBuffer, readHTML, readImage, readText, write, writeImage } from '../electron/clipboard/osClipboard'

const id = (name: string) => win.registered.get(name) ?? -1

beforeEach(() => {
  win.data.clear()
  win.openFailures = 0
  win.opens = 0
  win.sleeps = []
  win.isOpen = false
  electron.written = []
  electron.items = []
})

describe.skipIf(process.platform !== 'win32')('osClipboard (Electron 44+ removed the sync clipboard API)', () => {
  it('reads plain text from CF_UNICODETEXT, cut at its terminator', () => {
    win.data.set(13, Buffer.concat([Buffer.from('tab\there ✓', 'utf16le'), Buffer.alloc(6)]))
    expect(readText()).toBe('tab\there ✓')
    expect(win.isOpen).toBe(false)
  })

  it('reads a named format byte for byte, and an absent one as empty', () => {
    readBuffer('FileNameW')
    win.data.set(id('FileNameW'), Buffer.from('C:\\a.txt\0', 'utf16le'))
    expect(readBuffer('FileNameW').toString('utf16le')).toBe('C:\\a.txt\0')
    expect(readBuffer('CanIncludeInClipboardHistory').length).toBe(0)
    expect(win.isOpen).toBe(false)
  })

  it('names formats as the old availableFormats did on Windows: MIME types only, without opening the clipboard', () => {
    availableFormats()
    win.data.set(13, Buffer.from('x'))
    win.data.set(id('HTML Format'), Buffer.from('x'))
    win.data.set(8, Buffer.from('x'))
    win.data.set(15, Buffer.from('x'))
    win.data.set(id('FileNameW'), Buffer.from('x'))
    win.data.set(id('ExcludeClipboardContentFromMonitorProcessing'), Buffer.from([1, 0, 0, 0]))
    expect(availableFormats()).toEqual(['text/plain', 'text/html', 'image/png', 'text/uri-list'])
    expect(win.opens).toBe(0)
  })

  it('retries a busy clipboard like Chromium did (5 tries, 5ms apart), then gives up', () => {
    win.data.set(13, Buffer.from('hi\0', 'utf16le'))
    win.openFailures = 2
    expect(readText()).toBe('hi')
    expect(win.sleeps).toEqual([5, 5])
    win.openFailures = 9
    win.sleeps = []
    expect(readText()).toBe('')
    expect(win.sleeps).toEqual([5, 5, 5, 5])
  })

  it('reads HTML and images through the async API, empty when absent', async () => {
    expect(await readHTML()).toBe('')
    expect((await readImage()).isEmpty()).toBe(true)
    electron.items = [{ types: ['text/html', 'image/png'], getType: async (t) => new Blob([t === 'text/html' ? '<b>x</b>' : 'PNGDATA']) }]
    expect(await readHTML()).toBe('<b>x</b>')
    const img = (await readImage()) as unknown as { isEmpty: () => boolean; png: Buffer }
    expect(img.isEmpty()).toBe(false)
    expect(img.png.toString()).toBe('PNGDATA')
  })

  it('writes text with its HTML in one item, and HTML only when given', async () => {
    await write({ text: 'a\r\nb', html: '<p>a</p>' })
    await write({ text: 'plain' })
    expect(electron.written).toEqual([[{ 'text/plain': 'a\r\nb', 'text/html': '<p>a</p>' }], [{ 'text/plain': 'plain' }]])
  })

  it('writes an image as a PNG item', async () => {
    await writeImage({ toPNG: () => Buffer.from('PNG') } as never)
    const entry = electron.written[0][0]['image/png'] as Blob
    expect(entry.type).toBe('image/png')
    expect(Buffer.from(await entry.arrayBuffer()).toString()).toBe('PNG')
  })
})
