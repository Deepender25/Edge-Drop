import { describe, expect, it } from 'vitest'
import { itemMatchesTypeFilter } from '../src/hooks/useFilteredItems'
import type { ClipboardItemDto } from '../shared/types'

function dto(data: ClipboardItemDto['data']): ClipboardItemDto {
  return { id: 'x', data, capturedAt: 1, hitCount: 1, pinned: false }
}

describe('type filters: image files live in Images only', () => {
  const screenshot = dto({
    kind: 'image',
    imageId: 'a',
    width: 10,
    height: 10,
    bytes: 100,
    preview: 'data:image/png;base64,xx',
    source: 'screenshot'
  })
  const collection = dto({
    kind: 'image-collection',
    images: [{ imageId: 'a', width: 10, height: 10, bytes: 100, preview: 'data:image/png;base64,xx' }]
  })
  const pngFile = dto({ kind: 'files', paths: ['C:\\Users\\me\\photo.png'] })
  const jpgFile = dto({ kind: 'files', paths: ['C:\\Users\\me\\vacation.JPG'] })
  const twoPhotos = dto({ kind: 'files', paths: ['a.png', 'b.webp'] })
  const pdf = dto({ kind: 'files', paths: ['C:\\Users\\me\\doc.pdf'] })
  const mixed = dto({ kind: 'files', paths: ['photo.png', 'doc.pdf'] })
  const folder = dto({
    kind: 'files',
    paths: ['C:\\Users\\me\\Pictures'],
    entries: [{ name: 'Pictures', ext: '', size: 0, isImage: false, isDirectory: true }]
  })
  const note = dto({ kind: 'text', text: 'hello', isUrl: false })
  const link = dto({ kind: 'text', text: 'https://example.com', isUrl: true })

  it('All still shows every kind', () => {
    for (const item of [screenshot, collection, pngFile, pdf, mixed, folder, note, link]) {
      expect(itemMatchesTypeFilter(item, 'all')).toBe(true)
    }
  })

  it('Images: screenshots, collections, and image-only file cards', () => {
    expect(itemMatchesTypeFilter(screenshot, 'images')).toBe(true)
    expect(itemMatchesTypeFilter(collection, 'images')).toBe(true)
    expect(itemMatchesTypeFilter(pngFile, 'images')).toBe(true)
    expect(itemMatchesTypeFilter(jpgFile, 'images')).toBe(true)
    expect(itemMatchesTypeFilter(twoPhotos, 'images')).toBe(true)
    expect(itemMatchesTypeFilter(pdf, 'images')).toBe(false)
    expect(itemMatchesTypeFilter(mixed, 'images')).toBe(false)
    expect(itemMatchesTypeFilter(folder, 'images')).toBe(false)
    expect(itemMatchesTypeFilter(note, 'images')).toBe(false)
    expect(itemMatchesTypeFilter(link, 'images')).toBe(false)
  })

  it('Files: documents, mixed stacks, folders — not image-only cards', () => {
    expect(itemMatchesTypeFilter(pngFile, 'files')).toBe(false)
    expect(itemMatchesTypeFilter(jpgFile, 'files')).toBe(false)
    expect(itemMatchesTypeFilter(twoPhotos, 'files')).toBe(false)
    expect(itemMatchesTypeFilter(pdf, 'files')).toBe(true)
    expect(itemMatchesTypeFilter(mixed, 'files')).toBe(true)
    expect(itemMatchesTypeFilter(folder, 'files')).toBe(true)
    expect(itemMatchesTypeFilter(screenshot, 'files')).toBe(false)
    expect(itemMatchesTypeFilter(collection, 'files')).toBe(false)
    expect(itemMatchesTypeFilter(note, 'files')).toBe(false)
  })

  it('text and links are unchanged', () => {
    expect(itemMatchesTypeFilter(note, 'text')).toBe(true)
    expect(itemMatchesTypeFilter(link, 'text')).toBe(false)
    expect(itemMatchesTypeFilter(link, 'links')).toBe(true)
    expect(itemMatchesTypeFilter(note, 'links')).toBe(false)
    expect(itemMatchesTypeFilter(pngFile, 'text')).toBe(false)
  })

  it('colors: matches color codes and separates them from text', () => {
    const colorHex = dto({ kind: 'text', text: '#ebd5ad', isUrl: false, isColor: true })
    const colorRgb = dto({ kind: 'text', text: 'rgb(235, 213, 173)', isUrl: false })
    const plainText = dto({ kind: 'text', text: 'just normal notes', isUrl: false })

    expect(itemMatchesTypeFilter(colorHex, 'colors')).toBe(true)
    expect(itemMatchesTypeFilter(colorRgb, 'colors')).toBe(true)
    expect(itemMatchesTypeFilter(plainText, 'colors')).toBe(false)
    expect(itemMatchesTypeFilter(screenshot, 'colors')).toBe(false)
    expect(itemMatchesTypeFilter(pngFile, 'colors')).toBe(false)

    // Text filter excludes colors so color codes do not clutter text notes
    expect(itemMatchesTypeFilter(plainText, 'text')).toBe(true)
    expect(itemMatchesTypeFilter(colorHex, 'text')).toBe(false)
    expect(itemMatchesTypeFilter(colorRgb, 'text')).toBe(false)

    // All filter still shows colors
    expect(itemMatchesTypeFilter(colorHex, 'all')).toBe(true)
    expect(itemMatchesTypeFilter(colorRgb, 'all')).toBe(true)
  })
})
