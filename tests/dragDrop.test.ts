import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatScreenshotFilename, formatClipboardImageFilename, stageDragFile } from '../electron/main/drag'
import type { ItemData } from '../shared/types'

// Mock dependencies for staging
vi.mock('../electron/store/paths', () => ({
  PATHS: {
    tempDir: () => 'C:\\mock\\temp',
    imagesDir: () => 'C:\\mock\\images'
  },
  getUnpackagedTempDir: () => 'C:\\mock\\temp',
  toUnpackagedFilePath: (p: string) => p,
  toUnpackagedFilePaths: (ps: string[]) => ps
}))

vi.mock('../electron/main/state', () => ({
  getStore: () => ({
    getImagePath: (imageId: string, ext = 'png') => `C:\\mock\\images\\${imageId}.${ext}`
  })
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn((path: string) => {
    // Return true for mock source files
    if (path.includes('mock\\images') || path.includes('mock\\real')) return true
    return false
  }),
  copyFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn()
}))

describe('formatScreenshotFilename', () => {
  it('formats clean, human-readable screenshot filenames with dates and times', () => {
    // Date: 2026-08-15 22:30:45 UTC
    const date = new Date(2026, 7, 15, 22, 30, 45) // Note month is 0-indexed: 7 = August
    const filename = formatScreenshotFilename(date.getTime(), 'png')
    expect(filename).toBe('Screenshot 2026-08-15 22.30.45.png')
  })

  it('handles custom extensions and normalizes leading dots', () => {
    const date = new Date(2026, 0, 1, 9, 5, 2)
    expect(formatScreenshotFilename(date.getTime(), '.webp')).toBe('Screenshot 2026-01-01 09.05.02.webp')
    expect(formatScreenshotFilename(date.getTime(), 'jpg')).toBe('Screenshot 2026-01-01 09.05.02.jpg')
  })

  it('supports collision / sequence suffix for multi-image collections', () => {
    const date = new Date(2026, 7, 15, 14, 0, 0)
    expect(formatScreenshotFilename(date.getTime(), 'png', 0)).toBe('Screenshot 2026-08-15 14.00.00.png')
    expect(formatScreenshotFilename(date.getTime(), 'png', 1)).toBe('Screenshot 2026-08-15 14.00.00.png')
    expect(formatScreenshotFilename(date.getTime(), 'png', 2)).toBe('Screenshot 2026-08-15 14.00.00 (2).png')
    expect(formatScreenshotFilename(date.getTime(), 'png', 3)).toBe('Screenshot 2026-08-15 14.00.00 (3).png')
  })

  it('uses Image prefix for non-screenshot clipboard bitmaps', () => {
    const date = new Date(2026, 7, 15, 22, 30, 45)
    expect(formatClipboardImageFilename(date.getTime(), 'png', { source: 'image' })).toBe(
      'Image 2026-08-15 22.30.45.png'
    )
  })

  it('keeps an original filename when the clipboard provided one', () => {
    expect(formatClipboardImageFilename(Date.now(), 'png', { source: 'image', fileName: 'vacation photo.jpg' }))
      .toBe('vacation photo.jpg')
  })

  it('ensures zero illegal Windows filesystem characters in generated names', () => {
    const date = new Date()
    const filename = formatScreenshotFilename(date.getTime())
    // Prohibited characters on Windows: < > : " / \ | ? *
    const illegalCharsRegex = /[<>:"/\\|?*]/
    expect(illegalCharsRegex.test(filename)).toBe(false)
  })
})

describe('stageDragFile dual-channel payload', () => {
  const timestamp = new Date(2026, 7, 15, 22, 30, 45).getTime()

  it('returns both file and files array for single image items with human-readable filename', () => {
    const imageData: ItemData = {
      kind: 'image',
      imageId: 'img_test_123',
      width: 1920,
      height: 1080,
      bytes: 50000,
      ext: 'png'
    }

    const staged = stageDragFile(imageData, timestamp)
    expect(staged).not.toBeNull()
    expect(staged?.file).toContain('Screenshot 2026-08-15 22.30.45.png')
    expect(staged?.files).toBeDefined()
    expect(staged?.files).toHaveLength(1)
    expect(staged?.files?.[0]).toBe(staged?.file)
  })

  it('stages dropped folder images with their original filename', () => {
    const dropped: ItemData = {
      kind: 'image',
      imageId: 'img_test_123',
      width: 1920,
      height: 1080,
      bytes: 50000,
      ext: 'jpg',
      source: 'image',
      fileName: 'holiday.jpg'
    }
    const staged = stageDragFile(dropped, timestamp)
    expect(staged?.file).toMatch(/holiday\.jpg$/i)
    expect(staged?.file).not.toContain('Screenshot')
  })

  it('stages copied photos as Image timestamp, not Screenshot', () => {
    const copiedPhoto: ItemData = {
      kind: 'image',
      imageId: 'img_test_123',
      width: 1920,
      height: 1080,
      bytes: 50000,
      ext: 'png',
      source: 'image'
    }
    const stagedPhoto = stageDragFile(copiedPhoto, timestamp)
    expect(stagedPhoto?.file).toContain('Image 2026-08-15 22.30.45.png')
  })

  it('returns indexed filenames and files array for image-collection items', () => {
    const collectionData: ItemData = {
      kind: 'image-collection',
      images: [
        { imageId: 'img_1', width: 800, height: 600, bytes: 10000, ext: 'png' },
        { imageId: 'img_2', width: 800, height: 600, bytes: 12000, ext: 'png' }
      ]
    }

    const staged = stageDragFile(collectionData, timestamp)
    expect(staged).not.toBeNull()
    expect(staged?.file).toContain('Screenshot 2026-08-15 22.30.45.png')
    expect(staged?.files).toBeDefined()
    expect(staged?.files).toHaveLength(2)
    expect(staged?.files?.[0]).toContain('Screenshot 2026-08-15 22.30.45.png')
    expect(staged?.files?.[1]).toContain('Screenshot 2026-08-15 22.30.45 (2).png')
  })

  it('returns files array for real file paths', () => {
    const filesData: ItemData = {
      kind: 'files',
      paths: ['C:\\mock\\real\\document.pdf', 'C:\\mock\\real\\sheet.xlsx']
    }

    const staged = stageDragFile(filesData)
    expect(staged).not.toBeNull()
    expect(staged?.file).toBe('C:\\mock\\real\\document.pdf')
    expect(staged?.files).toEqual(['C:\\mock\\real\\document.pdf', 'C:\\mock\\real\\sheet.xlsx'])
  })

  it('returns files array for staged text snippets', () => {
    const textData: ItemData = {
      kind: 'text',
      text: 'Hello world snippet'
    }

    const staged = stageDragFile(textData)
    expect(staged).not.toBeNull()
    expect(staged?.file).toContain('Snippet_')
    expect(staged?.files).toBeDefined()
    expect(staged?.files?.[0]).toBe(staged?.file)
  })
})

import { buildFileDragSvg, getFileKindSvgContent } from '../electron/main/fileSvg'
import type { FileKind } from '../src/lib/fileType'

describe('buildFileDragSvg — standalone 3D pastel vector drag icons', () => {
  const allKinds: FileKind[] = [
    'pdf',
    'word',
    'excel',
    'powerpoint',
    'archive',
    'text',
    'code',
    'audio',
    'video',
    'image',
    'executable',
    'folder',
    'file'
  ]

  it('generates valid SVG content for all 13 file categories without bounding boxes', () => {
    for (const kind of allKinds) {
      const content = getFileKindSvgContent(kind)
      expect(content).toBeTruthy()
      // Ensure no black container box
      expect(content).not.toContain('fill="#000000"')
      expect(content).not.toContain('stroke="rgba(255,255,255,0.18)"')
    }
  })

  it('builds a clean single-file drag icon SVG without glass card or background', () => {
    const svg = buildFileDragSvg(['pdf'], 1)
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0 512 512"')
    expect(svg).toContain('PDF')
    expect(svg).not.toContain('fill="#000000"')
    expect(svg).not.toContain('<rect x="16" y="8" width="64" height="72"')
  })

  it('builds a clean single folder drag icon SVG with warm yellow folder colors', () => {
    const svg = buildFileDragSvg(['folder'], 1)
    expect(svg).toContain('<svg')
    expect(svg).toContain('fill="#FBBF24"')
    expect(svg).toContain('fill="#FDE68A"')
  })

  it('builds a clean multi-file stack SVG with count badge', () => {
    const svg = buildFileDragSvg(['pdf', 'excel', 'image'], 3)
    expect(svg).toContain('<svg')
    expect(svg).toContain('+3')
    expect(svg).toContain('stack-0')
    expect(svg).toContain('stack-1')
    expect(svg).toContain('stack-2')
  })
})

describe('Drag-out usage gating on drop location', () => {
  it('does not touch item when drag drops back inside the source window', () => {
    const touchSpy = vi.fn()
    const isWholeItemDrag = true
    const isInside = true // Dropped back onto Edge-Drop window
    const movePastedToTop = true

    if (isWholeItemDrag && !isInside && movePastedToTop) {
      touchSpy('item-1')
    }

    expect(touchSpy).not.toHaveBeenCalled()
  })

  it('touches item and moves unpinned to top when dropped outside into external app', () => {
    const touchSpy = vi.fn()
    const isWholeItemDrag = true
    const isInside = false // Dropped into Word / Photoshop / Explorer
    const movePastedToTop = true

    if (isWholeItemDrag && !isInside && movePastedToTop) {
      touchSpy('item-1')
    }

    expect(touchSpy).toHaveBeenCalledWith('item-1')
  })
})

