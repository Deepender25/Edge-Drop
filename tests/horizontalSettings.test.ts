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

  it('Panel.tsx renders horizontal curved connector arcs (flares) for top position', () => {
    const panelSrc = read('src/components/Panel.tsx')
    expect(panelSrc).toContain('flare-horizontal flare-top-left')
    expect(panelSrc).toContain('flare-horizontal flare-top-right')
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
    expect(src).toContain("settings.stickPosition === 'top'")
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
    const idx = headerSrc.indexOf('settings-header-pills')
    const pillsSection = headerSrc.slice(idx, idx + 400)
    expect(pillsSection).not.toContain("'all'")
    expect(pillsSection).toContain("id: 'behaviour'")
    expect(pillsSection).toContain("id: 'position'")
    expect(pillsSection).toContain("id: 'appearance'")
  })

  it('Trigger bar card renders length presets and thickness slider in horizontal settings', () => {
    const src = read('src/components/Settings.tsx')
    expect(src).toContain("t('position.hoverAreaSizeTitle')")
    expect(src).toContain("t('position.edgeTriggerThicknessTitle')")
    expect(src).toContain('settings.hotZoneHeight')
    expect(src).toContain('settings.hotZoneWidth')
    const panelSrc = read('src/components/Panel.tsx')
    expect(panelSrc).toContain('settings.hotZoneHeight >= 0.55 ? 575 : settings.hotZoneHeight >= 0.35 ? 400 : 275')
  })

  it('Appearance card triggers popup indicator style selector matching left/right alignment', () => {
    const src = read('src/components/Settings.tsx')
    expect(src).toContain('style-preview-toggle-btn')
    expect(src).toContain('handleToggleFlyout')
    expect(src).toContain('copyIndicatorStyle')

    const flyoutSrc = read('src/components/IndicatorStyleFlyout.tsx')
    expect(flyoutSrc).toContain("patch({ copyIndicatorStyle: 'logo' })")
    expect(flyoutSrc).toContain("patch({ copyIndicatorStyle: 'check' })")
    expect(flyoutSrc).toContain("patch({ copyIndicatorStyle: 'copy' })")
    expect(flyoutSrc).toContain("patch({ copyIndicatorStyle: 'sparkle' })")
    expect(flyoutSrc).toContain("stickPosition === 'top'")
    // Borderless like every other settings control; selection reads from the fill.
    expect(flyoutSrc).toContain("border: '2px solid transparent'")
    expect(flyoutSrc).toContain("background: active ? '#262626' : '#141414'")
    expect(flyoutSrc).not.toContain("outline: active ? '2px solid #ffffff' : 'none'")
  })

  it('Appearance lists the Copy Indicator toggle first, then the Indicator Style flyout trigger (both docks)', () => {
    const src = read('src/components/Settings.tsx')
    const appearance = src.slice(src.indexOf('// appearance'))
    const toggleIdx = appearance.indexOf("id: 'copy-indicator',\n            title")
    const styleIdx = appearance.indexOf("id: 'indicator-style'")
    expect(toggleIdx).toBeGreaterThan(-1)
    expect(styleIdx).toBeGreaterThan(toggleIdx)
    // the style row only exists while the indicator is on
    expect(appearance).toContain('...(indicatorOn ? [{')
    expect(appearance).toContain('className={`icon-btn style-preview-toggle-btn ${isFlyoutActive ? \'active\' : \'\'}`}')
    expect(appearance).toContain('{isFlyoutActive ? <CloseIcon /> : <ChevronRightIcon />}')
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
    // grouped cards in the top dock, and the support card pinned beside them
    expect(css).toContain('.set-group.is-h {')
    // columns of one width; toggle-only settings stack two to a column
    expect(css).toMatch(/\n\.set-col \{[^}]*width: 252px;/)
    expect(css).toMatch(/\.set-col\.is-pair > \.set-row \+ \.set-row \{[^}]*border-top: 1px solid/)
    expect(css).toMatch(/\.set-group\.is-h \.set-row-below \{[^}]*margin-top: auto;/)
    expect(css).toContain('.settings-support.is-h {')
  })

  it('getHorizontalDockMetrics scales trigger bar length based on hotZoneHeight (+25% increase)', async () => {
    const { getHorizontalDockMetrics } = await import('../src/hooks/useEdgeHover')
    const small = getHorizontalDockMetrics(1920, 0.5, 0.25)
    expect(small.triggerWidth).toBe(275)

    const medium = getHorizontalDockMetrics(1920, 0.5, 0.4)
    expect(medium.triggerWidth).toBe(400)

    const large = getHorizontalDockMetrics(1920, 0.5, 0.6)
    expect(large.triggerWidth).toBe(575)
  })

  it('getHorizontalDockMetrics accurately positions triggerLeft and triggerRight based on triggerAlignment', async () => {
    const { getHorizontalDockMetrics } = await import('../src/hooks/useEdgeHover')
    const dispW = 1920

    // Center alignment
    const centerMetrics = getHorizontalDockMetrics(dispW, 0.5, 0.25, 'center')
    expect(centerMetrics.triggerLeft).toBe(centerMetrics.dockCenterX - centerMetrics.triggerWidth / 2)
    expect(centerMetrics.triggerRight).toBe(centerMetrics.dockCenterX + centerMetrics.triggerWidth / 2)

    // Left alignment ('left' and legacy 'top')
    const leftMetrics = getHorizontalDockMetrics(dispW, 0.5, 0.25, 'left')
    expect(leftMetrics.triggerLeft).toBe(leftMetrics.dockX)
    expect(leftMetrics.triggerRight).toBe(leftMetrics.dockX + leftMetrics.triggerWidth)

    const topMetrics = getHorizontalDockMetrics(dispW, 0.5, 0.25, 'top')
    expect(topMetrics.triggerLeft).toBe(topMetrics.dockX)
    expect(topMetrics.triggerRight).toBe(topMetrics.dockX + topMetrics.triggerWidth)

    // Right alignment ('right' and legacy 'bottom')
    const rightMetrics = getHorizontalDockMetrics(dispW, 0.5, 0.25, 'right')
    expect(rightMetrics.triggerLeft).toBe(rightMetrics.dockX + rightMetrics.dockWidth - rightMetrics.triggerWidth)
    expect(rightMetrics.triggerRight).toBe(rightMetrics.dockX + rightMetrics.dockWidth)

    const bottomMetrics = getHorizontalDockMetrics(dispW, 0.5, 0.25, 'bottom')
    expect(bottomMetrics.triggerLeft).toBe(bottomMetrics.dockX + bottomMetrics.dockWidth - bottomMetrics.triggerWidth)
    expect(bottomMetrics.triggerRight).toBe(bottomMetrics.dockX + bottomMetrics.dockWidth)
  })

  it('Panel.tsx calculates insetLeft and insetRight dynamically matching trigger alignment', () => {
    const panelSrc = read('src/components/Panel.tsx')
    expect(panelSrc).toContain("if (alignment === 'top' || alignment === 'left')")
    expect(panelSrc).toContain("insetLeft = '0px'")
    expect(panelSrc).toContain('insetRight = `calc(100% - ${triggerWidthPx}px)`')
    expect(panelSrc).toContain("else if (alignment === 'bottom' || alignment === 'right')")
    expect(panelSrc).toContain('insetLeft = `calc(100% - ${triggerWidthPx}px)`')
    expect(panelSrc).toContain("insetRight = '0px'")
  })

  it('One definition serves both docks; side-dock-only rows are left out of the top dock', () => {
    const src = read('src/components/Settings.tsx')
    const groups = src.slice(src.indexOf('const groupsFor = (tab: SettingsTab)'), src.indexOf('const layout: '))
    // sliding along a vertical edge, panel height, the trigger's spot and text size: side docks only
    for (const id of ['offset', 'panel-height', 'trigger-position']) {
      expect(groups, id).toMatch(new RegExp(`\\.\\.\\.\\(!isHorizontal \\? \\[\\{\\n\\s+id: '${id}'`))
    }
    expect(groups).toMatch(/\.\.\.\(!isHorizontal \? \[\{\n\s+id: 'typography'/)
    expect(groups).toContain('verticalPositionTitle')
    expect(groups).toContain('panelHeightTitle')
    expect(groups).toContain('edgeTriggerPositionTitle')
    // in both docks: thickness, the 3-mode updater, clean-up, hover area presets
    expect(groups).toContain("id: 'trigger-thickness'")
    expect(groups).toContain('handleThicknessRelease')
    expect(groups).toContain('(v) => patch({ updateMode: v })')
    expect(groups).toContain('clearUnpinnedOnRestart')
    expect(groups).toContain("t('appearance.small')")
    expect(groups).toContain("t('position.medium')")
    expect(groups).toContain('`${thicknessPx}px`')
    // both layouts render the same groups
    expect(src.match(/renderGroups\((horizontalTab|activeTab)\)/g)).toEqual(['renderGroups(horizontalTab)', 'renderGroups(activeTab)'])
  })

  it('Edge placement is a 3-way control in both docks (the top dock adds its shelf variant)', () => {
    const src = read('src/components/Settings.tsx')
    expect(src).toContain("className={`placement-3way-wrap${isHorizontal ? ' shelf-placement-3way' : ''}`}")
    const css = read('src/styles/settings.css')
    expect(css).toContain('.placement-3way-wrap')
    expect(css).toContain('.placement-3way-wrap .pill')
  })

  it('After the settings come two cards: Community & Support, then About Edge-Drop', () => {
    const src = read('src/components/Settings.tsx')
    const cards = src.slice(src.indexOf('const renderClosingCards = () =>'), src.indexOf('const handleOpenChangelog'))
    const support = cards.slice(0, cards.indexOf('data-card="about"'))
    const about = cards.slice(cards.indexOf('data-card="about"'))
    expect(support).toContain("t('footer.supportTagline')")
    expect(support).toContain("<span>{t('footer.supportOnKofi')}</span>")
    expect(support).not.toContain("t('footer.supportDev')")
    expect(support).toContain("<span>{t('footer.starOnGithub')}</span>")
    expect(about).toContain("t('groups.aboutEdgeDrop')")
    expect(about).toContain("t('footer.submitFeedback')")
    expect(about).toContain('window.edge.quitApp()')
    // they end every tab and scroll with it: inside the top-dock track, after the groups
    expect(src).toMatch(/\{renderGroups\(horizontalTab\)\}\n\s+\{renderClosingCards\(\)\}\n\s+<\/div>/)
    expect(src).toMatch(/\{renderGroups\(activeTab\)\}\n\s+\{renderClosingCards\(\)\}/)
    expect(src).not.toContain('PersistentFooter')
  })

  it('Top dock pairs toggle-only settings into one column; wide controls get their own', () => {
    const src = read('src/components/Settings.tsx')
    expect(src).toContain('if (!row.below && last && last.length === 1 && !last[0].below) last.push(row)')
    // hover settings sit together (and pair up in the top dock)
    expect(src.indexOf("id: 'fullscreen'")).toBe(src.indexOf("id: 'hover-activation'") + src.slice(src.indexOf("id: 'hover-activation'")).indexOf("id: 'fullscreen'"))
    expect(src.indexOf("id: 'fullscreen'")).toBeLessThan(src.indexOf("id: 'hover-delay'"))
  })

  it('settings.css contains tab-view full-width obsidian rules', () => {
    const css = read('src/styles/settings.css')
    expect(css).toContain('.settings-shelf-track.tab-view')
    expect(css).toContain('.settings-shelf-track.tab-view .settings-shelf-card')
  })

  it('useEdgeHover maintains identical invisible hover window for settings menu and clipboard without 480px expansion', () => {
    const hoverSrc = read('src/hooks/useEdgeHover.ts')
    expect(hoverSrc).not.toContain('state.settingsOpen && y <= 480')
    expect(hoverSrc).not.toContain('state.settingsOpen && distFromBottom <= 480')
    expect(hoverSrc).not.toContain('distFromTop <= 480 + BUFFER_PX')
    expect(hoverSrc).not.toContain('distFromBottom <= 480 + BUFFER_PX')
    expect(hoverSrc).not.toContain('inSettings')
  })

  it('Horizontal settings maintains independent scroll positions per section and resets to behaviour tab on open/close', () => {
    const storeSrc = read('src/store/appStore.ts')
    // setSettingsOpen should reset settingsTab to behaviour so reopening starts on first tab
    expect(storeSrc).toContain("settingsTab: 'behaviour'")

    const settingsSrc = read('src/components/Settings.tsx')
    // Independent scroll memory per tab
    expect(settingsSrc).toContain('horizontalTabScrollPositions')
    expect(settingsSrc).toContain('handleShelfScroll')
    expect(settingsSrc).toContain('onScroll={handleShelfScroll}')
    // Reset to behaviour tab on mount
    expect(settingsSrc).toContain("useStore.getState().setSettingsTab('behaviour')")
  })
it('Settings rows are monochrome: no icon tiles or accent colours', () => {
    const src = read('src/components/Settings.tsx')
    expect(src).not.toMatch(/\btone: '(blue|green|indigo|purple|orange|yellow|pink|red|cyan|teal|gray)'/)
    expect(src).not.toMatch(/set-row-icon(?!-btn)/)
    const css = read('src/styles/settings.css')
    expect(css).not.toMatch(/\.tone-[a-z]+ \{/)
    expect(css).not.toContain('.set-row-icon {')
    // the style button still opens the flyout from the row
    expect(src).toContain('handleToggleFlyout(e.currentTarget)')
  })

  it('IndicatorStyleFlyout anchors horizontally relative to styleFlyoutAnchorRect', () => {
    const flyoutSrc = read('src/components/IndicatorStyleFlyout.tsx')
    expect(flyoutSrc).toContain('styleFlyoutAnchorRect')
    expect(flyoutSrc).toContain('styleFlyoutAnchorRect.x')
    expect(flyoutSrc).toContain('anchorCenterX - flyoutWidth / 2')
  })

  it('LanguageFlyout anchors horizontally relative to languageFlyoutAnchorRect in top/bottom dock', () => {
    const flyoutSrc = read('src/components/LanguageFlyout.tsx')
    expect(flyoutSrc).toContain('languageFlyoutAnchorRect')
    expect(flyoutSrc).toContain('languageFlyoutAnchorRect.x')
    expect(flyoutSrc).toContain('anchorCenterX - flyoutWidth / 2')

    const panelSrc = read('src/components/Panel.tsx')
    expect(panelSrc).toContain('<LanguageFlyout isRight={isRight} />')

    const settingsSrc = read('src/components/Settings.tsx')
    expect(settingsSrc).toContain('language-toggle-btn')
    expect(settingsSrc).toContain('setLanguageFlyoutOpen(!languageFlyoutOpen, rect)')
  })

  it('ItemList renders scroll-to-start arrow button with directional left chevron in horizontal dock mode', () => {
    const itemListSrc = read('src/components/ItemList.tsx')
    expect(itemListSrc).toContain('showScrollTop && (')
    expect(itemListSrc).toContain('className={`scroll-top-btn${isHorizontal ? \' horizontal\' : \'\'}`}')
    expect(itemListSrc).toContain('points="15 18 9 12 15 6"') // Left chevron in horizontal
    expect(itemListSrc).toContain('points="18 15 12 9 6 15"') // Up chevron in vertical
    expect(itemListSrc).toContain('playButtonClickSound()')

    const itemCss = read('src/styles/item.css')
    expect(itemCss).toContain('.scroll-top-btn.horizontal')
    expect(itemCss).toContain('right: 44px')
    expect(itemCss).toContain('bottom: 16px')
    // Crisp solid fill instead of backdrop blur (4K sharpness, zero raster cost).
    expect(itemCss).toMatch(/\.scroll-top-btn \{[^}]*background: var\(--act-surface\);/)
    expect(itemCss).not.toContain('backdrop-filter')
  })

  it('ItemList applies horizontal pinned accordion and floating capsule pill', () => {
    const itemListSrc = read('src/components/ItemList.tsx')
    expect(itemListSrc).toContain('pinned-accordion')
    expect(itemListSrc).toContain('pinned-floating-pill')
    expect(itemListSrc).toContain('--pinned-target-width')

    const panelCss = read('src/styles/panel.css')
    expect(panelCss).toContain('.pinned-accordion.horizontal')
    expect(panelCss).toContain('.pinned-floating-pill.horizontal')
    expect(panelCss).toContain('var(--pinned-target-width')
  })
});


