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
      expect(result.source).toBe('screenshot')
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
      expect(result.source).toBe('screenshot')
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
    if (result?.kind === 'image') {
      expect(result.source).toBe('image')
      expect(result.fileName).toBe('photo.png')
    }

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

  it('captures Excel / Spreadsheet Ctrl+A copy (tab-separated rows with DIB bitmap) as text', async () => {
    const spreadsheetText = 'Product\tQuantity\tPrice\nApple\t50\t$1.20\nBanana\t120\t$0.50\nOrange\t80\t$0.80'
    const spreadsheetHtml = '<style><!--table{}--></style><table border=0 cellpadding=0 cellspacing=0 width=200><tr height=20><td class=xl65>Product</td><td class=xl65>Quantity</td><td class=xl65>Price</td></tr></table>'

    const mockBgra = Buffer.alloc(400 * 200 * 4, 200)
    const mockImage = {
      isEmpty: () => false,
      getSize: () => ({ width: 400, height: 200 }),
      toBitmap: () => mockBgra,
      toPNG: () => Buffer.from('mock-excel-table-png')
    }

    ;(clipboard as any).__setMockState({
      formats: ['XML Spreadsheet', 'HTML Format', 'CF_DIBV5', 'CF_BITMAP', 'CF_UNICODETEXT'],
      text: spreadsheetText,
      html: spreadsheetHtml,
      image: mockImage
    })

    const result = await readClipboard()
    expect(result).not.toBeNull()
    expect(result?.kind).toBe('text')
    if (result?.kind === 'text') {
      expect(result.text).toBe(spreadsheetText)
    }

    const sig = clipboardSignature()
    expect(sig).toContain('text:Product\tQuantity\tPrice')
  })

  it('captures Google Sheets Ctrl+A copy with google-sheets-html-origin and DIB bitmap as text', async () => {
    const sheetsText = 'Name\tScore\nAlice\t95\nBob\t88'
    const sheetsHtml = '<google-sheets-html-origin><style type="text/css">td {border: 1px solid #ccc;}</style><table><tr><td>Name</td><td>Score</td></tr></table>'

    const mockBgra = Buffer.alloc(300 * 150 * 4, 180)
    const mockImage = {
      isEmpty: () => false,
      getSize: () => ({ width: 300, height: 150 }),
      toBitmap: () => mockBgra,
      toPNG: () => Buffer.from('mock-sheets-table-png')
    }

    ;(clipboard as any).__setMockState({
      formats: ['text/html', 'CF_DIB', 'CF_UNICODETEXT'],
      text: sheetsText,
      html: sheetsHtml,
      image: mockImage
    })

    const result = await readClipboard()
    expect(result).not.toBeNull()
    expect(result?.kind).toBe('text')
    if (result?.kind === 'text') {
      expect(result.text).toBe(sheetsText)
    }

    const sig = clipboardSignature()
    expect(sig).toContain('text:Name\tScore')
  })

  it('does not treat an Explorer file copy as an image while FileNameW is advertised but unread', async () => {
    const mockBgra = Buffer.alloc(64 * 64 * 4, 32)
    const mockImage = {
      isEmpty: () => false,
      getSize: () => ({ width: 64, height: 64 }),
      toBitmap: () => mockBgra,
      toPNG: () => Buffer.from('mock-png-bytes')
    }

    ;(clipboard as any).__setMockState({
      formats: ['FileNameW', 'CF_HDROP', 'CF_DIB', 'CF_BITMAP'],
      text: '',
      html: '',
      image: mockImage
    })

    const result = await readClipboard()
    expect(result).toBeNull()
  })
})
