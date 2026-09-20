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
    expect(flyoutSrc).toContain("border: active ? '2px solid #ffffff' : '2px solid rgba(255, 255, 255, 0.08)'")
    expect(flyoutSrc).not.toContain("outline: active ? '2px solid #ffffff' : 'none'")
  })

  it('Appearance shelf renders Show Copy Indicator toggle card first, followed by Indicator Style card matching Left/Right', () => {
    const src = read('src/components/Settings.tsx')
    const appearanceSection = src.slice(src.indexOf("horizontalTab === 'appearance'"), src.indexOf("horizontalTab === 'appearance'") + 4000)
    const toggleCardIdx = appearanceSection.indexOf('beacon-toggle-card')
    const styleCardIdx = appearanceSection.indexOf('copy-card')

    expect(toggleCardIdx).toBeGreaterThan(-1)
    expect(styleCardIdx).toBeGreaterThan(-1)
    // Card 1 (beacon-toggle-card) must appear BEFORE Card 2 (copy-card)
    expect(toggleCardIdx).toBeLessThan(styleCardIdx)
    // Indicator style card is only shown when showCopyIndicator is enabled
    expect(appearanceSection).toContain('{(settings.showCopyIndicator ?? true) && (')
    // Indicator style card uses standard style-preview-toggle-btn with Close/Chevron icons, matching Left/Right
    expect(appearanceSection).toContain('className={`icon-btn style-preview-toggle-btn ${isFlyoutActive ? \'active\' : \'\'}`}')
    expect(appearanceSection).toContain('{isFlyoutActive ? <CloseIcon /> : <ChevronRightIcon />}')
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

  it('Horizontal shelf includes trigger thickness and auto-updates, without panel height, horizontal position, or edge trigger position', () => {
    const src = read('src/components/Settings.tsx')
    // Find the isHorizontal branch
    const horizontalBlock = src.slice(src.indexOf('if (isHorizontal) {'), src.indexOf('const maxTabLen ='))
    // Should NOT contain horizontal position offset slider or panel height pills
    expect(horizontalBlock).not.toContain('horizontalPositionTitle')
    expect(horizontalBlock).not.toContain('panelHeightTitle')
    // Should NOT contain trigger alignment pills in horizontal shelf
    expect(horizontalBlock).not.toContain('edgeTriggerPositionTitle')
    expect(horizontalBlock).not.toContain('triggerAlignment: opt.val')
    // Should contain trigger thickness
    expect(horizontalBlock).toContain('trigger-thickness-card')
    expect(horizontalBlock).toContain('handleThicknessRelease')
    // Should contain auto-updates toggle
    expect(horizontalBlock).toContain('autoUpdatesTitle')
    expect(horizontalBlock).toContain('autoUpdates: v')
    // Should contain clearUnpinnedOnRestart
    expect(horizontalBlock).toContain('clearUnpinnedTitle')
    expect(horizontalBlock).toContain('clearUnpinnedOnRestart')
    // Should contain support links
    expect(horizontalBlock).toContain('supportOnKofi')
    expect(horizontalBlock).toContain('starOnGithub')
  })

  it('Vertical left/right settings remain untouched with position slider and vertical controls intact', () => {
    const src = read('src/components/Settings.tsx')
    const verticalBlock = src.slice(src.indexOf('const maxTabLen ='))
    expect(verticalBlock).toContain('verticalPositionTitle')
    expect(verticalBlock).toContain('edgeTriggerPositionTitle')
    expect(verticalBlock).toContain('panelHeightTitle')
  })

  it('Vertical settings arranges edge placement buttons in 3-way layout (left, top, right)', () => {
    const src = read('src/components/Settings.tsx')
    const verticalBlock = src.slice(src.indexOf('const maxTabLen ='))
    expect(verticalBlock).toContain('placement-3way-wrap')

    const css = read('src/styles/settings.css')
    expect(css).toContain('.placement-3way-wrap')
    expect(css).toContain('.placement-3way-wrap .pill')
  })

  it('Horizontal dashboard uses correct translations, multi-column classes, and explicit pixel values', () => {
    const src = read('src/components/Settings.tsx')
    const horizontalBlock = src.slice(src.indexOf('if (isHorizontal) {'), src.indexOf('const maxTabLen ='))

    // Translation fix: supportOnKofi instead of supportDev
    expect(horizontalBlock).toContain("t('footer.supportOnKofi')")
    expect(horizontalBlock).not.toContain("t('footer.supportDev')")

    // Multi-column dashboard structure
    expect(horizontalBlock).toContain('tab-view')
    expect(horizontalBlock).toContain('behaviour-col')
    expect(horizontalBlock).toContain('position-col')
    expect(horizontalBlock).toContain('appearance-col')

    // Edge placement 3-way layout for horizontal card shelf
    expect(horizontalBlock).toContain('placement-3way-wrap')
    expect(horizontalBlock).toContain('shelf-placement-3way')

    // Clean names on length presets & live thickness badge without pixel strings
    expect(horizontalBlock).toContain("t('appearance.small')")
    expect(horizontalBlock).toContain("t('position.medium')")
    expect(horizontalBlock).toContain("t('appearance.large')")
    expect(horizontalBlock).not.toContain('(220px)')
    expect(horizontalBlock).not.toContain('(320px)')
    expect(horizontalBlock).not.toContain('(460px)')
    expect(horizontalBlock).toContain('${settings.hotZoneWidth ?? 3}px')
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
it('Appearance shelf renders Card 1 Copy Indicator toggle first, then Card 2 Indicator Style flyout trigger second', () => {
    const src = read('src/components/Settings.tsx')
    const appearanceIndex = src.indexOf("horizontalTab === 'appearance'")
    expect(appearanceIndex).toBeGreaterThan(-1)
    const appearanceBlock = src.slice(appearanceIndex)

    const toggleCardIndex = appearanceBlock.indexOf('beacon-toggle-card')
    const styleCardIndex = appearanceBlock.indexOf('copy-card')

    expect(toggleCardIndex).toBeGreaterThan(-1)
    expect(styleCardIndex).toBeGreaterThan(-1)
    // Toggle card must come before Indicator style card
    expect(toggleCardIndex).toBeLessThan(styleCardIndex)

    // Indicator style button uses style-preview-toggle-btn with Chevron/Close
    expect(appearanceBlock).toContain('style-preview-toggle-btn')
    expect(appearanceBlock).toContain('handleToggleFlyout(e.currentTarget)')
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
    expect(itemCss).toContain('backdrop-filter: blur(12px)')
  })

  it('ItemList applies dynamic vertical font scaling and panel.css bounds for horizontal pinned pill', () => {
    const itemListSrc = read('src/components/ItemList.tsx')
    expect(itemListSrc).toContain('getVerticalPinnedLabelStyle')
    expect(itemListSrc).toContain('getVerticalPinnedLabelStyle(t(\'item.pinned\'))')
    expect(itemListSrc).toContain('pinned-label-group')

    const panelCss = read('src/styles/panel.css')
    expect(panelCss).toContain('.list.horizontal .pinned-header-interactive')
    expect(panelCss).toContain('max-height: 68px')
    expect(panelCss).toContain('text-overflow: ellipsis')
    expect(panelCss).toContain('margin: auto 0')
  })
});

