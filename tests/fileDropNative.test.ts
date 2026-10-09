import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * Explorer file copies: the CF_HDROP list is read in-process; PowerShell is
 * only the fallback. Win32 calls are simulated through a koffi mock.
 */
const win = vi.hoisted(() => ({
  paths: [] as string[],
  hasHdrop: true,
  openFails: 0,
  opens: 0,
  closes: 0,
  psStdout: '',
  psCalls: 0
}))

vi.mock('koffi', () => {
  const impl: Record<string, (...args: any[]) => unknown> = {
    GetClipboardSequenceNumber: () => 1,
    OpenClipboard: () => {
      win.opens++
      if (win.openFails > 0) {
        win.openFails--
        return false
      }
      return true
    },
    CloseClipboard: () => {
      win.closes++
      return true
    },
    IsClipboardFormatAvailable: (format: number) => format === 15 && win.hasHdrop,
    GetClipboardData: () => (win.hasHdrop ? { hdrop: true } : null),
    DragQueryFileW: (_h: unknown, index: number, buf: Buffer | null, cch: number) => {
      if (index === 0xffffffff) return win.paths.length
      const p = win.paths[index]
      if (!buf) return p.length
      buf.write(p.slice(0, cch - 1), 0, 'utf16le')
      return Math.min(p.length, cch - 1)
    }
  }
  const lib = { func: (sig: string) => impl[sig.match(/(\w+)\(/)![1]] }
  return { default: { load: () => lib } }
})

vi.mock('node:child_process', () => ({
  execFile: (_file: string, _args: string[], _opts: unknown, cb: (err: unknown, out: unknown) => void) => {
    win.psCalls++
    cb(null, { stdout: win.psStdout, stderr: '' })
  }
}))

vi.mock('electron', () => ({
  clipboard: {
    availableFormats: () => ['FileNameW', 'CF_HDROP'],
    readBuffer: (format: string) =>
      format === 'FileNameW' && win.paths.length ? Buffer.from(`${win.paths[0]}\0`, 'utf16le') : Buffer.alloc(0),
    readText: () => '',
    readHTML: () => '',
    readImage: () => ({ isEmpty: () => true, getSize: () => ({ width: 0, height: 0 }) })
  },
  app: { isPackaged: false, getAppPath: () => 'C:\\mock', getPath: () => 'C:\\mock' }
}))

import { readClipboard } from '../electron/clipboard/formats'

describe.skipIf(process.platform !== 'win32')('Explorer file copy — native CF_HDROP read', () => {
  let dir: string
  let files: string[]

  beforeEach(() => {
    dir = join(tmpdir(), `ed-hdrop-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(dir, { recursive: true })
    files = ['a b.jpg', 'Ünïcödé 报告.pdf', 'c.docx', 'd.png', 'e.zip'].map((n) => {
      const p = join(dir, n)
      writeFileSync(p, 'x')
      return p
    })
    Object.assign(win, { paths: files, hasHdrop: true, openFails: 0, opens: 0, closes: 0, psStdout: '', psCalls: 0 })
  })

  afterEach(() => {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('returns every selected file without spawning PowerShell', async () => {
    const item = await readClipboard()
    expect(item).toEqual({ kind: 'files', paths: files })
    expect(win.psCalls).toBe(0)
    expect(win.closes).toBe(win.opens)
  })

  it('retries when another process holds the clipboard, still without PowerShell', async () => {
    win.openFails = 2
    const item = await readClipboard()
    expect(item).toEqual({ kind: 'files', paths: files })
    expect(win.psCalls).toBe(0)
    expect(win.closes).toBe(1)
  })

  it('falls back to PowerShell when the clipboard stays locked', async () => {
    win.openFails = 99
    win.psStdout = files.join('\r\n')
    const item = await readClipboard()
    expect(item).toEqual({ kind: 'files', paths: files })
    expect(win.psCalls).toBe(1)
    expect(win.closes).toBe(0)
  })

  it('falls back to PowerShell when CF_HDROP is absent', async () => {
    win.hasHdrop = false
    win.psStdout = files.join('\r\n')
    const item = await readClipboard()
    expect(item).toEqual({ kind: 'files', paths: files })
    expect(win.psCalls).toBe(1)
    expect(win.closes).toBe(win.opens)
  })

  it('drops paths that no longer exist, exactly like the PowerShell path', async () => {
    win.paths = [...files, join(dir, 'gone.txt')]
    const item = await readClipboard()
    expect(item).toEqual({ kind: 'files', paths: files })
    expect(win.psCalls).toBe(0)
  })
})
