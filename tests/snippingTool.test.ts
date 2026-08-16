import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readClipboard, clipboardSignature } from '../electron/clipboard/formats'
import { clipboard } from 'electron'

// Mock Electron clipboard
vi.mock('electron', () => {
  let mockFormats: string[] = []
  let mockText = ''
  let mockHtml = ''
  let mockImage = {
    isEmpty: () => true,
    getSize: () => ({ width: 0, height: 0 }),
    toBitmap: () => Buffer.alloc(0),
    toPNG: () => Buffer.alloc(0)
  }

  return {
    clipboard: {
      availableFormats: vi.fn(() => mockFormats),
      readText: vi.fn(() => mockText),
      readHTML: vi.fn(() => mockHtml),
      readImage: vi.fn(() => mockImage),
      readBuffer: vi.fn(() => Buffer.alloc(0)),
      __setMockState: (state: {
        formats?: string[]
        text?: string
        html?: string
        image?: { isEmpty: () => boolean; getSize: () => { width: number; height: number }; toBitmap: () => Buffer; toPNG: () => Buffer }
      }) => {
        mockFormats = state.formats ?? []
        mockText = state.text ?? ''
        mockHtml = state.html ?? ''
        mockImage = state.image ?? {
          isEmpty: () => true,
          getSize: () => ({ width: 0, height: 0 }),
          toBitmap: () => Buffer.alloc(0),
          toPNG: () => Buffer.alloc(0)
        }
      }
    }
  }
})

describe('Windows Snipping Tool & Clipboard Image Detection (#41)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('captures Windows Snipping Tool "Window" mode (DIB Bitmap + Window Title Text)', async () => {
    // Windows 11 Snipping Tool writes the captured window bitmap along with window title text metadata
    const mockBgra = Buffer.alloc(1920 * 1080 * 4, 128)
    const mockImage = {
      isEmpty: () => false,
      getSize: () => ({ width: 1920, height: 1080 }),
      toBitmap: () => mockBgra,
      toPNG: () => Buffer.from('mock-png-bytes')
    }

    ;(clipboard as any).__setMockState({
      formats: ['CF_DIBV5', 'CF_BITMAP', 'CF_UNICODETEXT'],
      text: 'Visual Studio Code - Edge-Drop',
      html: '',
      image: mockImage
    })

    const result = await readClipboard()
    expect(result).not.toBeNull()
    expect(result?.kind).toBe('image')
    if (result?.kind === 'image') {
      expect(result.width).toBe(1920)
      expect(result.height).toBe(1080)
    }

    const sig = clipboardSignature()
    expect(sig).toContain('image:1920x1080:')
  })

  it('captures Rectangular / Fullscreen screenshots with pure image payload', async () => {
    const mockBgra = Buffer.alloc(800 * 600 * 4, 255)
    const mockImage = {
      isEmpty: () => false,
      getSize: () => ({ width: 800, height: 600 }),
      toBitmap: () => mockBgra,
      toPNG: () => Buffer.from('mock-png-bytes')
    }

    ;(clipboard as any).__setMockState({
      formats: ['CF_DIBV5', 'PNG'],
      text: '',
      html: '',
      image: mockImage
    })

    const result = await readClipboard()
    expect(result).not.toBeNull()
    expect(result?.kind).toBe('image')
    if (result?.kind === 'image') {
      expect(result.width).toBe(800)
      expect(result.height).toBe(600)
    }

    const sig = clipboardSignature()
    expect(sig).toContain('image:800x600:')
  })

  it('captures Browser "Copy Image" with fallback image URL', async () => {
    const mockBgra = Buffer.alloc(400 * 300 * 4, 100)
    const mockImage = {
      isEmpty: () => false,
      getSize: () => ({ width: 400, height: 300 }),
      toBitmap: () => mockBgra,
      toPNG: () => Buffer.from('mock-png-bytes')
    }

    ;(clipboard as any).__setMockState({
      formats: ['image/png', 'text/html', 'text/plain'],
      text: 'https://example.com/photo.png',
      html: '<img src="https://example.com/photo.png">',
      image: mockImage
    })

    const result = await readClipboard()
    expect(result).not.toBeNull()
    expect(result?.kind).toBe('image')

    const sig = clipboardSignature()
    expect(sig).toContain('image:400x300:')
  })

  it('captures regular text copy in text editors without image confusion', async () => {
    ;(clipboard as any).__setMockState({
      formats: ['CF_UNICODETEXT', 'text/plain'],
      text: 'const greeting = "Hello World!"',
      html: '',
      image: {
        isEmpty: () => true,
        getSize: () => ({ width: 0, height: 0 }),
        toBitmap: () => Buffer.alloc(0),
        toPNG: () => Buffer.alloc(0)
      }
    })

    const result = await readClipboard()
    expect(result).not.toBeNull()
    expect(result?.kind).toBe('text')
    if (result?.kind === 'text') {
      expect(result.text).toBe('const greeting = "Hello World!"')
    }

    const sig = clipboardSignature()
    expect(sig).toContain('text:const greeting = "Hello World!"')
  })

  it('captures rich document selections from Word/Office as text', async () => {
    const longDocumentText = 'Chapter 1: The Beginning\n\nThis is a rich formatted document paragraph copied from Word containing tables and formatted text with inline preview graphics.'
    const richHtml = '<html><body><p>Chapter 1: The Beginning</p><p>This is a rich formatted document...</p><table><tr><td>Data</td></tr></table></body></html>'

    const mockBgra = Buffer.alloc(100 * 100 * 4, 50)
    const mockImage = {
      isEmpty: () => false,
      getSize: () => ({ width: 100, height: 100 }),
      toBitmap: () => mockBgra,
      toPNG: () => Buffer.from('mock-png-bytes')
    }

    ;(clipboard as any).__setMockState({
      formats: ['text/html', 'CF_UNICODETEXT', 'CF_DIB'],
      text: longDocumentText,
      html: richHtml,
      image: mockImage
    })

    const result = await readClipboard()
    expect(result).not.toBeNull()
    expect(result?.kind).toBe('text')
    if (result?.kind === 'text') {
      expect(result.text).toBe(longDocumentText)
      expect(result.html).toBe(richHtml)
    }
  })
})
