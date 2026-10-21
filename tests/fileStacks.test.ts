import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const css = read('src/styles/item.css')
const card = read('src/components/ClipboardItem.tsx')

const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Every rule whose selector mentions `needle`, as [selector, body]. */
const rules = (needle: string) =>
  [...cssNoComments.matchAll(/(^|\n)([^{}\n][^{}]*)\{([^}]*)\}/g)]
    .map((m) => [m[2].trim(), m[3]] as const)
    .filter(([sel]) => sel.includes(needle))

describe('file icon stacks and hover', () => {
  it('file items in a stack use the cascade class; photo cards keep theirs', () => {
    expect(card).toContain("className={`${isImg ? 'image-folder-stack-item' : 'file-stack-folder'} pos-${idx}`}")
    expect(card).toContain('<div className="image-folder-stack-deck is-file-deck" data-count={Math.min(count, 4)}>')
    expect(css).not.toContain('file-stack-item')
  })

  it('hovering a file icon or stack only moves it: no filter or shadow changes', () => {
    const hover = [...rules('.file-stack-folder'), ...rules('.single-file-hero')].filter(([sel]) => sel.includes(':hover'))
    expect(hover.length).toBeGreaterThan(8)
    for (const [sel, body] of hover) {
      // the flyout's own hover rules are separate and already transform-only
      expect(body, sel).not.toMatch(/filter|box-shadow|opacity/)
      expect(body, sel).toMatch(/transform:/)
    }
  })

  it('only transform is transitioned, and each folder is its own layer', () => {
    const base = rules('.file-stack-folder').find(([sel]) => sel === '.file-stack-folder')![1]
    // one property only: the curve's commas are inside cubic-bezier( )
    const onlyTransform = /transition: transform [\d.]+s cubic-bezier\([^)]*\);/
    expect(base).toMatch(onlyTransform)
    expect(base).toContain('will-change: transform')
    const hero = rules('.single-file-hero img.file-kind-img').find(([sel]) => sel.startsWith('.single-file-hero svg'))![1]
    expect(hero).toMatch(onlyTransform)
    expect(hero).toContain('will-change: transform')
  })

  it('every stack size has a rest and a hover position for each folder', () => {
    for (const [count, positions] of [[2, 2], [3, 3], [4, 4]] as const) {
      for (let p = 0; p < positions; p++) {
        const sel = `.image-folder-stack-deck[data-count="${count}"] .file-stack-folder.pos-${p}`
        expect(css, sel).toContain(`${sel} {`)
        expect(css, `hover ${sel}`).toContain(`.item-main:hover ${sel} {`)
      }
    }
  })

  it('file art is centered above the label flap in cards and mini cards', () => {
    expect(css).toMatch(/\.image-folder-viewport > \.single-file-hero \{[^}]*padding-bottom: 26px/)
    expect(css).toMatch(/\.list\.horizontal \.image-folder-viewport > \.single-file-hero \{[^}]*padding-bottom: 24px/)
    expect(css).toMatch(/\.mini-image-folder-viewport > \.single-file-hero \{[^}]*padding-bottom: 16px/)
    expect(css).toMatch(/\.image-folder-viewport \.image-folder-stack-deck\.is-file-deck \{[^}]*padding: 8px 0 26px/)
  })

  it('reduced motion turns the stack and hero motion off', () => {
    expect(css).toContain("html[data-motion='reduce'] .file-stack-folder {\n  transition: none;")
    expect(css).toContain("html[data-motion='reduce'] .single-file-hero img.file-kind-img {\n  transition: none;")
  })
})
