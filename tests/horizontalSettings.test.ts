import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(relPath: string): string {
  return readFileSync(resolve(__dirname, '..', relPath), 'utf8')
}

describe('Horizontal Card Shelf Settings Layout', () => {
  it('Panel.tsx retains fixed 210px dock height in horizontal mode without expanding and with 60px gutter', () => {
    const panelSrc = read('src/components/Panel.tsx')
    expect(panelSrc).toContain("style={isHorizontal ? { width: 'min(calc(100vw - 60px), 1080px)', height: 210 } : { height: panelHeightStr }}")
    expect(panelSrc).not.toContain('height: settingsOpen ? 460 : 210')
  })

  it('Panel.tsx renders horizontal curved connector arcs (flares) for top and bottom positions', () => {
    const panelSrc = read('src/components/Panel.tsx')
    expect(panelSrc).toContain('flare-horizontal flare-top-left')
    expect(panelSrc).toContain('flare-horizontal flare-top-right')
    expect(panelSrc).toContain('flare-horizontal flare-bottom-left')
    expect(panelSrc).toContain('flare-horizontal flare-bottom-right')
  })

  it('item.css contains 210px card width, 5-line text clamp, and compact actions toolbar', () => {
    const itemCss = read('src/styles/item.css')
    expect(itemCss).toContain('width: 210px')
    expect(itemCss).toContain('-webkit-line-clamp: 5')
    expect(itemCss).toContain('.list.horizontal .actions')
    expect(itemCss).toContain('.list.horizontal .act')
  })

  it('Settings accepts isHorizontal prop and detects horizontal dock positions', () => {
    const src = read('src/components/Settings.tsx')
    expect(src).toContain('isHorizontal: propIsHorizontal')
    expect(src).toContain("settings.stickPosition === 'top' || settings.stickPosition === 'bottom'")
  })

  it('Settings renders horizontal card shelf with smooth scrolling track and shelf cards', () => {
    const src = read('src/components/Settings.tsx')
    expect(src).toContain('if (isHorizontal)')
    expect(src).toContain('settings-horizontal-shelf')
    expect(src).toContain('settings-shelf-track')
    expect(src).toContain('settings-shelf-card')
    expect(src).toContain('handleShelfWheel')
  })

  it('Header renders category segmented pills for horizontal settings mode', () => {
    const headerSrc = read('src/components/Header.tsx')
    expect(headerSrc).toContain('settings-header-pills')
    expect(headerSrc).toContain('settings-header-pill')
    expect(headerSrc).toContain("id: 'all'")
    expect(headerSrc).toContain("id: 'behaviour'")
    expect(headerSrc).toContain("id: 'position'")
    expect(headerSrc).toContain("id: 'appearance'")
  })

  it('Horizontal Position card renders horizontal alignment slider and presets', () => {
    const src = read('src/components/Settings.tsx')
    expect(src).toContain('horizontalPositionTitle')
    expect(src).toContain('settings.horizontalOffset')
    expect(src).toContain("{ label: 'Left', val: 0 }")
    expect(src).toContain("{ label: 'Center', val: 0.5 }")
    expect(src).toContain("{ label: 'Right', val: 1.0 }")
  })

  it('Appearance card renders 4 interactive indicator style preview tiles', () => {
    const src = read('src/components/Settings.tsx')
    expect(src).toContain('shelf-indicator-grid')
    expect(src).toContain('shelf-indicator-item')
    expect(src).toContain("patch({ copyIndicatorStyle: 'logo' })")
    expect(src).toContain("patch({ copyIndicatorStyle: 'check' })")
    expect(src).toContain("patch({ copyIndicatorStyle: 'copy' })")
    expect(src).toContain("patch({ copyIndicatorStyle: 'sparkle' })")
  })

  it('Panel.tsx passes isHorizontal to Settings component', () => {
    const src = read('src/components/Panel.tsx')
    expect(src).toContain('<Settings isHorizontal={isHorizontal} />')
  })

  it('settings.css contains styles for horizontal shelf, track, and cards', () => {
    const css = read('src/styles/settings.css')
    expect(css).toContain('.settings-horizontal-shelf')
    expect(css).toContain('.settings-shelf-track')
    expect(css).toContain('.settings-shelf-card')
    expect(css).toContain('.settings-header-pills')
    expect(css).toContain('.settings-header-pill')
    expect(css).toContain('.shelf-indicator-grid')
    expect(css).toContain('.shelf-indicator-item')
    expect(css).toContain('.shelf-quit-btn')
  })
})
