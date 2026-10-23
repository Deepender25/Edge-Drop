import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ClipboardItemDto } from '../shared/types'
import { fileStackEntries, imageCollectionEntries, stackOpenWidth, stackTotalSize } from '../src/components/StackItems'
import { getFileKind } from '../src/lib/fileType'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const t = (k: string) => ({ 'filters.images': 'Images', 'item.copyFilePath': 'Copy file path', 'item.copy': 'Copy' } as Record<string, string>)[k] ?? k

const files = {
  id: 'f1',
  capturedAt: Date.now(),
  hitCount: 1,
  pinned: false,
  data: {
    kind: 'files',
    paths: ['C:/Docs/Report.pdf', 'C:/Pics/Beach day.png', 'C:/Work/Projects'],
    entries: [
      { name: 'Report.pdf', ext: 'pdf', size: 2_000_000, isImage: false },
      { name: 'Beach day.png', ext: 'png', size: 820_000, isImage: true, preview: 'data:image/png;base64,AA' },
      { name: 'Projects', ext: '', size: 0, isImage: false, isDirectory: true }
    ]
  }
} as unknown as ClipboardItemDto

const images = {
  id: 'c1',
  capturedAt: Date.now(),
  hitCount: 1,
  pinned: false,
  data: {
    kind: 'image-collection',
    images: [
      { imageId: 'a', width: 1920, height: 1080, bytes: 480_000, preview: 'data:a' },
      { imageId: 'b', width: 800, height: 600, bytes: 20_000, fileName: 'logo.png', preview: 'data:b' }
    ]
  }
} as unknown as ClipboardItemDto

describe('open stack entries', () => {
  it('every file entry acts on its own real path', () => {
    const e = fileStackEntries(files, t)
    expect(e.map((x) => x.req)).toEqual([
      { id: 'f1', paths: ['C:/Docs/Report.pdf'] },
      { id: 'f1', paths: ['C:/Pics/Beach day.png'] },
      { id: 'f1', paths: ['C:/Work/Projects'] }
    ])
  })

  it('files show an icon and "kind · size"; pictures a thumbnail; folders no size', () => {
    const [pdf, photo, folder] = fileStackEntries(files, t)
    expect(pdf.icon).toEqual({ path: 'C:/Docs/Report.pdf', isDirectory: undefined })
    expect(pdf.thumb).toBeUndefined()
    expect(pdf.kindLabel).toBe(getFileKind('C:/Docs/Report.pdf').label.toLowerCase())
    expect(pdf.detail).toBe('1.9 MB')
    expect(photo.thumb?.src).toBe('data:image/png;base64,AA')
    expect(photo.thumb?.fallbackSrc).toBe('edgelocal://file/C%3A%2FPics%2FBeach%20day.png')
    expect(photo.kindLabel).toBe('png') // the real extension, not the family
    expect(folder.icon?.isDirectory).toBe(true)
    expect(folder.detail).toBe('')
  })

  it('clipboard images act by image id and are named by file name, else size in pixels', () => {
    const [a, b] = imageCollectionEntries(images, t)
    expect(a.req).toEqual({ id: 'c1', imageId: 'a' })
    expect(a.name).toBe('1920×1080')
    expect(b.name).toBe('logo.png')
    expect(b.detail).toBe('800×600 · 19.5 KB')
    expect(a.thumb?.src).toBe('data:a')
  })

  it('the header shows the total size', () => {
    expect(stackTotalSize(files)).toBe('2.7 MB')
    expect(stackTotalSize(images)).toBe('488.3 KB')
  })
})

describe('open stack layout', () => {
  const css = read('src/styles/stack.css')
  const view = read('src/components/StackItems.tsx')

  it('pictures only -> photo grid, anything else -> list', () => {
    expect(view).toContain('const gallery = entries.length > 0 && entries.every((e) => e.thumb)')
    expect(view).toContain("className={`stack-items ${gallery ? 'is-gallery' : 'is-list'}`}")
  })

  it('top dock width matches the CSS: 128px photo tiles, 232px file columns two rows tall', () => {
    expect(stackOpenWidth(6, true)).toBe(6 * 128 + 5 * 6 + 8 + 22)
    expect(stackOpenWidth(9, false)).toBe(5 * 232 + 4 * 6 + 22)
    expect(stackOpenWidth(4, false)).toBe(2 * 232 + 6 + 22)
    expect(stackOpenWidth(2, false)).toBe(232 + 22)
    expect(stackOpenWidth(1, true)).toBe(240) // never narrower than the header needs
    expect(css).toContain('width: 128px; /* stackOpenWidth() */')
    expect(css).toContain('grid-auto-columns: minmax(232px, 1fr); /* stackOpenWidth() */')
    expect(css).toMatch(/\.list\.horizontal \.stack-items\.is-list \{[^}]*grid-template-rows: repeat\(2, 46px\);[^}]*grid-auto-flow: column;/)
    expect(read('src/components/ClipboardItem.tsx')).toContain('? stackOpenWidth(bundleCount, isImageStack)')
  })

  it('one left edge: header, list icons and photo grid all start 4px in', () => {
    expect(css).not.toContain(':has(> .stack-items.is-list) > .image-folder-expanded-top-bar')
    expect(css).toMatch(/\n\.stack-row \{[^}]*padding: 6px 8px 6px 4px;/)
    expect(css).toMatch(/\n\.stack-items\.is-gallery \{[^}]*padding: 0 4px;/)
    expect(read('src/styles/item.css')).toMatch(/\n\.image-folder-expanded-top-bar \{[^}]*padding: 0 0 0 4px;/)
  })

  it('side dock: names get two lines; an odd photo count lets the first photo span the row', () => {
    expect(css).toMatch(/\.stack-row-name \{[^}]*-webkit-line-clamp: 2;/)
    expect(css).toContain('.stack-items.is-gallery > .stack-tile:first-child:nth-last-child(odd) {\n  grid-column: 1 / -1;')
  })

  it('7+ photos use three columns and the grid always ends flush', () => {
    expect(css).toContain('.stack-items.is-gallery:is([data-count="7"], [data-count="8"], [data-count="9"], [data-count="10"]) {\n  grid-template-columns: repeat(3, 1fr);')
    expect(css).toContain('.stack-items.is-gallery[data-count="10"] > .stack-tile:first-child {\n  grid-column: 1 / -1;')
    expect(css).toContain('.stack-items.is-gallery[data-count="8"] > .stack-tile:first-child {\n  grid-column: span 2;')
    expect(css).toContain('.stack-items.is-gallery[data-count="9"] > .stack-tile:first-child {\n  grid-column: auto;')
  })

  it('hovered rows fade their text before the pill instead of cutting it', () => {
    expect(css).toMatch(/\.stack-row:is\(:hover, :focus-within\) \.stack-row-text \{[^}]*mask-image: linear-gradient\(to left, transparent 58px, #000 82px\);/)
  })

  it('the mini cards are gone', () => {
    const card = read('src/components/ClipboardItem.tsx')
    expect(card).not.toMatch(/MiniImageFolderCard|MiniFileFolderCard|mini-image-folder/)
    expect(read('src/styles/item.css')).not.toContain('mini-image-folder')
    expect(card.match(/<StackHeader/g)?.length).toBe(2)
    expect(card.match(/<StackItems /g)?.length).toBe(2)
  })
})
