import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileIconLayers, ICON_LAYER_PARTS } from '../shared/fileIconLayers'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const KINDS = ['pdf', 'word', 'excel', 'powerpoint', 'archive', 'text', 'code', 'audio', 'video', 'image', 'executable', 'folder', 'file']

describe('folder icon layers (shared/fileIconLayers)', () => {
  it('every icon splits into back, three papers and the front pocket', () => {
    for (const kind of KINDS) {
      const svg = read(`resources/file-icons/${kind}.svg`)
      const layers = fileIconLayers(svg)
      expect(layers, kind).not.toBeNull()
      const defs = svg.slice(svg.indexOf('<defs>'), svg.indexOf('</defs>') + 7)
      for (const part of ICON_LAYER_PARTS) {
        const l = layers![part]
        expect(l.startsWith(svg.slice(0, svg.indexOf('<defs>'))), `${kind} ${part} keeps the root`).toBe(true)
        expect(l, `${kind} ${part} keeps every def`).toContain(defs)
        expect(l.trim().endsWith('</svg>'), `${kind} ${part}`).toBe(true)
        // balanced groups
        expect((l.match(/<g\b/g) ?? []).length, `${kind} ${part}`).toBe((l.match(/<\/g>/g) ?? []).length)
      }
      // each paper is one rotated sheet; nothing else is drawn with it
      for (const part of ['paper1', 'paper2', 'paper3'] as const) {
        const body = layers![part].slice(layers![part].indexOf('</defs>'))
        expect(body.match(/<g transform="rotate\(/g)?.length, `${kind} ${part}`).toBe(1)
        expect(body, `${kind} ${part}`).not.toMatch(/mask=|ellipse/)
      }
      expect(layers!.back).toMatch(/<use href="#[a-z]+-panel"/)
      expect(layers!.back.slice(layers!.back.indexOf('</defs>'))).not.toMatch(/mask=|rotate\(/)
      // the pocket keeps the papers defined (it frosts them through <use>) but does not draw them
      expect(layers!.front).toMatch(/<defs><g id="[a-z]+-contents">/)
      expect(layers!.front).toMatch(/<g mask="url\(#[a-z]+-mask\)">/)
      // together the five draw what the icon draws: same papers, once each
      const papers = (svg.match(/<g transform="rotate\(/g) ?? []).length
      expect(papers).toBe(3)
    }
  })

  it('an icon without that structure does not split', () => {
    expect(fileIconLayers('<svg><defs></defs><rect/></svg>')).toBeNull()
    expect(fileIconLayers('')).toBeNull()
  })
})

describe('folder icons open on hover', () => {
  const css = read('src/styles/item.css').replace(/\/\*[\s\S]*?\*\//g, '')
  const icon = read('src/components/CustomFileIcon.tsx')
  const layersLib = read('src/lib/iconLayers.ts')

  it('the opening rules only apply once the layers are armed, and only move them', () => {
    const open = [...css.matchAll(/([^{}]*:hover[^{}]*\.file-kind-opening[^{}]*)\{([^}]*)\}/g)]
    expect(open.length).toBeGreaterThanOrEqual(6)
    for (const [, sel, body] of open) {
      for (const s of sel.split(',')) expect(s.trim(), s).toContain('.file-kind-opening.is-armed')
      expect(body, sel).not.toMatch(/filter|opacity|width|height/)
    }
  })

  it('papers move in whole --open-u steps; the pocket tips on its bottom edge', () => {
    expect(css).toMatch(/\.fil-paper1 \{\n  translate: var\(--open-u\) calc\(var\(--open-u\) \* -1\);/)
    expect(css).toMatch(/\.fil-paper2 \{\n  translate: 0 calc\(var\(--open-u\) \* -2\);/)
    expect(css).toMatch(/\.fil-paper3 \{\n  translate: calc\(var\(--open-u\) \* -1\) calc\(var\(--open-u\) \* -1\);/)
    expect(css).toContain('.fil-front {\n  transform: translateY(var(--open-u)) perspective(calc(var(--open-u) * 90)) rotateX(-26deg);')
    expect(css).toMatch(/\.fko-layers > \.fil-front \{\n  transform-origin: 50% 83%;/)
    expect(css).toMatch(/\.file-kind-opening \{\n  --open-u: 4px;/)
  })

  it('at rest the layers are hidden, and they hand back to the plain icon only after closing', () => {
    expect(css).toMatch(/\.fko-layers \{[^}]*visibility: hidden;[^}]*transition: visibility 0s linear var\(--open-time\);/)
    expect(css).toMatch(/\.file-kind-opening > \.fko-plain \{[^}]*transition: visibility 0s linear var\(--open-time\);/)
  })

  it('cheap to show and move: pre-rastered layers, no filter or transform on the wrapper', () => {
    expect(css).toMatch(/\.file-kind-opening > \.fko-plain,\n\.fko-layers > \.fil \{\n  will-change: transform;/)
    expect(css).toMatch(/\.file-kind-opening \{[^}]*filter: none !important;[^}]*transform: none !important;/)
    expect(css).toContain("html[data-motion='reduce'] .fko-layers > .fil {\n  transition: none;")
  })

  it('layers are built on the first hover of the card, armed before opening', () => {
    expect(icon).toContain("card.addEventListener('pointerenter', onEnter, { once: true })")
    expect(icon).toContain('useIconLayers(kind, cssSize, wanted)')
    expect(icon).toMatch(/getComputedStyle\(el\)\.visibility\s+setArmed\(true\)/)
    expect(layersLib).toContain('if (!build) return')
    // bitmaps drawn by this window at the exact device size
    expect(layersLib).toContain('new OffscreenCanvas(px, px)')
    expect(layersLib).toMatch(/Math\.round\(cssSize \* r\)/)
  })

  it('hover buttons stay a horizontal pill, docked off the opening folder', () => {
    // never turned into a column: same pill as every other card
    expect(css).not.toMatch(/actions[^{]*\{[^}]*flex-direction: column/)
    // every folder-style card (files, folders, photos, stacks): on the flap's shoulder, in each dock
    for (const [sel, bottom] of [
      ['.item.is-image-folder-card .item-main > .actions', '37px'],
      ['.list.horizontal .item.is-image-folder-card .item-main > .actions', '28px'],
    ]) {
      expect(css, sel).toContain(`\n${sel} {\n  top: auto;\n  bottom: ${bottom};`)
    }
    // ...so photos and photo stacks sit above it, like file art
    expect(css).toContain('.image-folder-viewport:has(> .image-folder-thumb) {\n  padding-bottom: 36px;')
    expect(css).toContain('.list.horizontal .image-folder-viewport:has(> .image-folder-thumb) {\n  padding-bottom: 34px;')
    expect(css).toContain('.image-folder-viewport .image-folder-stack-deck:not(.is-file-deck) {\n  margin-top: 0;\n  padding-bottom: 32px;')
    expect(css).toContain('.list.horizontal .image-folder-viewport .image-folder-stack-deck:not(.is-file-deck) {\n  margin-top: 0;\n  padding-bottom: 30px;')
    expect(css).not.toContain(':has(.file-kind-opening) > .actions')
    // the preview keeps the pill in the corner and lowers its grid folders instead
    expect(css).toContain('.flyout-subitem:not(.single-hero-card) .item-content:has(.file-kind-opening) {\n  padding-top: 28px;')
  })

  it('the window gets icon sources only for the 13 known names', () => {
    const ipc = read('electron/main/ipc.ts')
    expect(ipc).toMatch(/handle\('icon:svg', async \(kind\) => \{[\s\S]*?resolveIconAsset\(join\(app\.getAppPath\(\), 'resources', 'file-icons'\), `\$\{kind\}\.svg`\)/)
  })
})
