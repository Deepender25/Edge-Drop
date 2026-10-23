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
      expect(body, sel).not.toMatch(/filter|box-shadow|opacity/)
      expect(body, sel).toMatch(/transform:|translate:/)
    }
  })

  it('pixel-sharp on every screen: layered icons never resize or tilt, and move in whole 4px steps', () => {
    // hover states only translate: no scale or rotate on a pre-rastered layer
    const layered = [...rules('.file-stack-folder'), ...rules('.single-file-hero img'), ...rules('.single-file-hero svg')]
    for (const [sel, body] of layered.filter(([s]) => s.includes(':hover'))) {
      expect(body, sel).not.toMatch(/scale|rotate/)
    }
    for (const [sel, body] of rules('.file-stack-folder')) expect(body, sel).not.toMatch(/rotate/)
    // every length used to move them is a multiple of 4px
    const moves = [...rules('.file-stack-folder'), ...rules('.is-file-deck'), ...rules('.single-file-hero')]
      .flatMap(([, body]) => [...body.matchAll(/(?:translate(?:Y)?\(|translate:|--[a-z-]+:)\s*([^;]*)/g)].map((m) => m[1]))
    const lengths = moves.flatMap((v) => [...v.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])))
    expect(lengths.length).toBeGreaterThan(20)
    for (const n of lengths) expect(Math.abs(n % 4), `${n}px`).toBe(0)
    // no percentages (they land between pixels)
    for (const v of moves) expect(v, v).not.toMatch(/%/)
  })

  it('only one property is transitioned, and each folder is its own layer', () => {
    const base = rules('.file-stack-folder').find(([sel]) => sel === '.file-stack-folder')![1]
    // one property only: the curve's commas are inside cubic-bezier( )
    expect(base).toMatch(/transition: translate [\d.]+s cubic-bezier\([^)]*\);/)
    expect(base).toContain('will-change: transform')
    const hero = rules('.single-file-hero img.file-kind-img').find(([sel]) => sel.startsWith('.single-file-hero svg'))![1]
    expect(hero).toMatch(/transition: transform [\d.]+s cubic-bezier\([^)]*\);/)
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

  it('file art sits above the flap, leaving the shoulder band for the hover pill', () => {
    expect(css).toMatch(/\.image-folder-viewport > \.single-file-hero \{[^}]*padding-bottom: 26px/)
    expect(css).toMatch(/\.list\.horizontal \.image-folder-viewport > \.single-file-hero \{[^}]*padding-bottom: 34px/)
    expect(css).toMatch(/\.image-folder-viewport \.image-folder-stack-deck\.is-file-deck \{[^}]*padding: 0 0 36px/)
    expect(css).toMatch(/\.list\.horizontal \.image-folder-viewport \.image-folder-stack-deck\.is-file-deck \{[^}]*padding: 0 0 34px/)
  })

  it('file and image cards carry a neutral grain + light on their own pre-rastered layer', () => {
    const base = rules('.is-textured').find(([sel]) => sel === '.image-folder-viewport.is-textured')!
    expect(base[1]).toContain('isolation: isolate')
    const layer = rules('.is-textured::before').find(([sel]) => sel === '.is-textured::before')![1]
    expect(layer).toContain("url('../assets/grain.png')")
    expect(layer).toContain('radial-gradient(')
    expect(layer).toContain('will-change: transform')
    expect(layer).toContain('z-index: -1')
    expect(layer).toContain('pointer-events: none')
    expect(layer).not.toMatch(/filter|animation|transition/)
    // neutral: only white / black light, never a color
    for (const m of layer.matchAll(/rgba\((\d+), (\d+), (\d+)/g)) {
      expect(m[1] === m[2] && m[2] === m[3], m[0]).toBe(true)
    }
    expect(css).not.toMatch(/--tint|is-photo|is-mixed/)
    expect(card.match(/ is-textured/g)?.length).toBe(2)
  })

  it('hovering a textured card never repaints its texture', () => {
    // card, inner and flap colors switch in one step (a fade redrew the card every frame)
    for (const sel of ['.item.is-image-folder-card', '.image-folder-card-inner', '.image-folder-flap-svg path']) {
      const body = rules(sel).find(([s]) => s === sel)?.[1]
      expect(body, sel).toBeDefined()
      expect(body, sel).not.toMatch(/transition/)
    }
    // the viewport keeps its base color on hover, and never uses the shorthand
    expect(css).toContain('.item:not(.is-expanded) .item-main:hover .image-folder-viewport.is-textured {\n  background-color: #1b1b1b;')
    for (const [sel, body] of rules('.image-folder-viewport')) {
      if (sel.includes(':hover')) expect(body, sel).not.toMatch(/(^|\s)background:/)
    }
  })

  it('the grain tile is a small seamless 128px PNG', () => {
    const png = readFileSync(join(__dirname, '..', 'src', 'assets', 'grain.png'))
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(128) // width
    expect(png.readUInt32BE(20)).toBe(128) // height
    expect(png.length).toBeLessThan(32 * 1024)
  })

  it('reduced motion turns the stack and hero motion off', () => {
    expect(css).toContain("html[data-motion='reduce'] .file-stack-folder {\n  transition: none;")
    expect(css).toContain("html[data-motion='reduce'] .single-file-hero img.file-kind-img {\n  transition: none;")
  })
})
