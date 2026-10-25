import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(__dirname, '..', 'src/styles/item.css'), 'utf8')

describe('hover pill on text, link, code and color cards', () => {
  it('docks at the bottom right in both docks, on shelf cards only (not the preview flyout)', () => {
    expect(css).toContain('.list-stack .item:not(.is-image-folder-card) .item-main > .actions {\n  top: auto;\n  bottom: 6px;\n  transform-origin: bottom right;')
    // top dock: the free band just above the bottom row
    expect(css).toContain('.list.horizontal .list-stack .item:not(.is-image-folder-card) .item-main > .actions {\n  bottom: 27px;')
    // top dock color values sit above that band
    expect(css).toMatch(/\.list\.horizontal \.item\.is-color-card \.item-content \{[^}]*padding-bottom: 28px;/)
  })

  it('side dock: room for the pill in the bottom row, without changing card height on hover', () => {
    expect(css).toContain('.list:not(.horizontal) .list-stack .item:not(.is-image-folder-card) .item-footer {\n  padding-bottom: 14px;')
    // extras step aside with visibility (keeps their size), type and "copied" stay
    const hide = css.match(/\.list:not\(\.horizontal\) \.list-stack \.item:not\(\.is-image-folder-card\) \.item-main:is\(:hover, :focus-within, \.force-actions\) \.item-footer :is\(\.meta > :not\(\.kind-badge, \.meta-copied\), \.meta-time\) \{([^}]*)\}/)
    expect(hide?.[1]).toContain('visibility: hidden;')
    expect(hide?.[1]).not.toContain('display: none')
    // they come back only after the pill (0.12s fade) is gone
    expect(css).toMatch(/\.item-footer :is\(\.meta > :not\(\.kind-badge, \.meta-copied\), \.meta-time\) \{\n  transition: visibility 0s linear 0\.12s, order 0s linear 0\.12s;/)
    expect(css).toMatch(/opacity 0\.12s ease,\n    scale 0\.18s/)
  })
})
