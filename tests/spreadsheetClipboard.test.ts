import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatTabularDataForClipboard, readClipboard } from '../electron/clipboard/formats'
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

describe('Spreadsheet Tabular Clipboard Formatting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('formats TSV spreadsheet cells into Windows CRLF text and standard HTML table', () => {
    const rawTsv = 'Name\tAge\tCity\nAlice\t28\tSeattle\nBob\t34\tNew York'
    const result = formatTabularDataForClipboard(rawTsv)

    expect(result.text).toBe('Name\tAge\tCity\r\nAlice\t28\tSeattle\r\nBob\t34\tNew York')
    expect(result.html).toBe(
      '<table border="0" cellpadding="0" cellspacing="0"><tbody>' +
      '<tr><td>Name</td><td>Age</td><td>City</td></tr>' +
      '<tr><td>Alice</td><td>28</td><td>Seattle</td></tr>' +
      '<tr><td>Bob</td><td>34</td><td>New York</td></tr>' +
      '</tbody></table>'
    )
  })

  it('preserves existing HTML table if rawHtml already contains a valid table', () => {
    const rawTsv = 'A\tB\r\nC\td'
    const existingTableHtml = '<table class="excel-table"><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>d</td></tr></table>'
    const result = formatTabularDataForClipboard(rawTsv, existingTableHtml)

    expect(result.text).toBe('A\tB\r\nC\td')
    expect(result.html).toBe(existingTableHtml)
  })

  it('replaces non-table HTML wrappers (e.g. Google Sheets origin divs) with standard table', () => {
    const rawTsv = 'Col1\tCol2\r\nVal1\tVal2'
    const googleSheetsDivHtml = '<google-sheets-html-origin><style></style><div id="test"><span>Val1</span></div></google-sheets-html-origin>'
    const result = formatTabularDataForClipboard(rawTsv, googleSheetsDivHtml)

    expect(result.text).toBe('Col1\tCol2\r\nVal1\tVal2')
    expect(result.html).toBe(
      '<table border="0" cellpadding="0" cellspacing="0"><tbody>' +
      '<tr><td>Col1</td><td>Col2</td></tr>' +
      '<tr><td>Val1</td><td>Val2</td></tr>' +
      '</tbody></table>'
    )
  })

  it('handles empty cells and escapes HTML characters properly', () => {
    const rawTsv = '\t<Tom & Jerry>\r\n100\t'
    const result = formatTabularDataForClipboard(rawTsv)

    expect(result.text).toBe('\t<Tom & Jerry>\r\n100\t')
    expect(result.html).toBe(
      '<table border="0" cellpadding="0" cellspacing="0"><tbody>' +
      '<tr><td></td><td>&lt;Tom &amp; Jerry&gt;</td></tr>' +
      '<tr><td>100</td><td></td></tr>' +
      '</tbody></table>'
    )
  })

  it('normalizes plain multiline text to CRLF without creating unnecessary HTML tables', () => {
    const multilineText = 'Line 1\nLine 2\nLine 3'
    const result = formatTabularDataForClipboard(multilineText)

    expect(result.text).toBe('Line 1\r\nLine 2\r\nLine 3')
    expect(result.html).toBeUndefined()
  })

  it('captures spreadsheet data in readClipboard preserving leading and internal tabs', async () => {
    ;(clipboard as any).__setMockState({
      formats: ['CF_UNICODETEXT', 'HTML Format'],
      text: '\tValueB\r\nValueC\tValueD\r\n',
      html: '<table><tr><td></td><td>ValueB</td></tr><tr><td>ValueC</td><td>ValueD</td></tr></table>'
    })

    const item = await readClipboard()
    expect(item).not.toBeNull()
    expect(item?.kind).toBe('text')
    if (item?.kind === 'text') {
      expect(item.text).toBe('\tValueB\r\nValueC\tValueD')
      expect(item.html).toContain('<table>')
    }
  })
})
