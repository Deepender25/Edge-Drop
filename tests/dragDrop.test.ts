import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatScreenshotFilename, stageDragFile } from '../electron/main/drag'
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
