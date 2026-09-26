import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(relPath: string): string {
  return readFileSync(resolve(__dirname, '..', relPath), 'utf8')
}

describe('Stack Features: SVG Folder Silhouette, Sizing, Horizontal Expansion & Detach Zone', () => {
  it('CustomFileIcon.tsx exports FileStackPhoto with SVG folder silhouette mask', () => {
    const src = read('src/components/CustomFileIcon.tsx')
    expect(src).toContain('export function FileStackPhoto')
    expect(src).toContain('FILE_ICON_MASK')
    expect(src).toContain('maskImage: FILE_ICON_MASK')
  })

  it('ClipboardItem.tsx uses FileStackPhoto for image stacks with responsive photoSize', () => {
    const src = read('src/components/ClipboardItem.tsx')
    expect(src).toContain('<FileStackPhoto src={img.preview} width={photoSize} height={photoSize} />')
    expect(src).toContain('photoSize = isHorizontal ? 76 : 124')
    expect(src).toContain('HorizontalBundleExpanded')
  })

  it('ClipboardItem.tsx does not introduce an intrusive merge-target indicator overlay', () => {
    const src = read('src/components/ClipboardItem.tsx')
    expect(src).not.toContain('merge-target-indicator')
    expect(src).not.toContain('item.stack')
    expect(src).not.toContain('isDragOverTarget')
  })

  it('ClipboardItem.tsx provides copy and ungroup hover actions on horizontal subitems with clean header', () => {
    const src = read('src/components/ClipboardItem.tsx')
    expect(src).toContain('horizontal-subitem-actions')
    expect(src).toContain('subitem-copy-btn')
    expect(src).toContain('subitem-delete-btn')
    // Header should be minimal: no collection name label, no capacity badge (e.g. 3 / 10)
    const expandedSection = src.slice(src.indexOf('function HorizontalBundleExpanded'), src.indexOf('function BundleFluidPreview'))
    expect(expandedSection).not.toContain('bundle-actions-label')
    expect(expandedSection).not.toContain('bundle-capacity')
    expect(expandedSection).not.toContain('MAX_STACK')
    // Minus / ungroup button in subitem should not have danger class
    expect(expandedSection).not.toContain('subitem-delete-btn danger')
  })

  it('ClipboardItem.tsx calculates dynamic width for horizontally expanded stacks', () => {
    const src = read('src/components/ClipboardItem.tsx')
    expect(src).toContain('expandedWidth')
    expect(src).toContain('expanded && isHorizontal')
    expect(src).toContain('bundleCount')
  })

  it('Panel.tsx passes stickPosition to SplitDropZone for left/top/right orientations without text pill', () => {
    const src = read('src/components/Panel.tsx')
    expect(src).toContain('SplitDropZone stickPosition={settings.stickPosition')
    expect(src).toContain('pos-${stickPosition}')
    expect(src).toContain("isTop = stickPosition === 'top'")
    expect(src).toContain("isRight = stickPosition === 'right'")
    // Text pill must NOT be introduced into SplitDropZone
    expect(src).not.toContain('split-dropzone-pill')
  })

  it('item.css includes styles for orientation-aware split-dropzone and no split-dropzone-pill', () => {
    const css = read('src/styles/item.css')
    expect(css).toContain('.split-dropzone.pos-top')
    expect(css).toContain('.split-dropzone.pos-bottom')
    expect(css).toContain('.split-dropzone.pos-left')
    expect(css).toContain('.split-dropzone.pos-right')
    expect(css).not.toContain('.split-dropzone-pill')
    expect(css).not.toContain('.merge-target-indicator')
  })

  it('item.css includes clean header without divider and subitem actions without red danger hover', () => {
    const css = read('src/styles/item.css')
    expect(css).toContain('.list.horizontal .item.is-expanded')
    expect(css).toContain('.horizontal-bundle-expanded')
    expect(css).toContain('.horizontal-bundle-header')
    // No divider border on horizontal header
    const headerCss = css.slice(css.indexOf('.horizontal-bundle-header {'), css.indexOf('.horizontal-bundle-header .bundle-collapse-hit'))
    expect(headerCss).not.toContain('border-bottom')
    expect(css).toContain('.horizontal-subitem-track')
    expect(css).toContain('.horizontal-subitem-tile')
    expect(css).toContain('.horizontal-subitem-tile::before')
    expect(css).toContain('.horizontal-subitem-actions')
    // No red hover effect on subitem ungroup / delete button
    expect(css).not.toContain('.horizontal-subitem-actions .subitem-delete-btn:hover')
    expect(css).not.toContain('.horizontal-subitem-actions .act.danger:hover')
    expect(css).toContain('.horizontal-subitem-icon-wrap')
    expect(css).toContain('.horizontal-subitem-meta')
  })

  it('ClipboardItem.tsx uses ChevronLeftIcon pointing to left for horizontal stack collapse', () => {
    const src = read('src/components/ClipboardItem.tsx')
    const expandedSection = src.slice(src.indexOf('function HorizontalBundleExpanded'), src.indexOf('function BundleFluidPreview'))
    expect(expandedSection).toContain('<ChevronLeftIcon />')
    expect(expandedSection).not.toContain('<ChevronUpIcon />')
  })

  it('ItemList.tsx isolates scroll positions per filter page so tabs are not synchronized', () => {
    const src = read('src/components/ItemList.tsx')
    expect(src).toContain('filterScrollMap')
    expect(src).toContain('prevFilterRef')
    expect(src).toContain('filterScrollMap.current[prevFilterRef.current]')
    expect(src).toContain('filterScrollMap.current[typeFilter]')
  })

  it('item.css vertically centers and frames images in horizontal dock mode', () => {
    const css = read('src/styles/item.css')
    expect(css).toContain('.list.horizontal .item.is-image .item-content')
    expect(css).toContain('.list.horizontal .thumb-wrap')
    expect(css).toContain('.list.horizontal .thumb')
    const thumbCss = css.slice(css.indexOf('.list.horizontal .thumb {'), css.indexOf('.list.horizontal .item:hover .thumb'))
    expect(thumbCss).toContain('max-height: 100px')
    expect(thumbCss).toContain('box-shadow')
    expect(thumbCss).toContain('object-fit: contain')
  })
})
