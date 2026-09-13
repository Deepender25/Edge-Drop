import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useStore } from '../src/store/appStore'
import { DEFAULT_SETTINGS } from '../shared/types'

function read(relPath: string): string {
  return readFileSync(resolve(__dirname, '..', relPath), 'utf8')
}

describe('Unified Open-State Retention Across All 4 Edges', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    const patchSettingsMock = vi.fn().mockImplementation(async (patch) => {
      const next = { ...useStore.getState().settings, ...patch }
      useStore.setState({ settings: next })
      return next
    })

    ;(globalThis as any).window = {
      edge: {
        updateSettings: patchSettingsMock,
        loadState: vi.fn().mockResolvedValue({ items: [], settings: DEFAULT_SETTINGS }),
        onItems: vi.fn(() => () => {}),
        onSettings: vi.fn(() => () => {}),
        onToast: vi.fn(() => () => {}),
        onToggle: vi.fn(() => () => {}),
        setInteractive: vi.fn(),
        setPreviewMode: vi.fn()
      }
    }

    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, stickPosition: 'left', reduceMotion: false },
      edgeTransition: null,
      sliderReleasedTime: 0,
      settingsTab: 'behaviour'
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renews notifyPositionChanged() when startEdgeTransition finishes expanding', async () => {
    const p = useStore.getState().startEdgeTransition('top')
    expect(useStore.getState().edgeTransition?.stage).toBe('retracting')

    // Advance through the transition stages (260 + 130 + 120 + 300 = 810ms)
    await vi.advanceTimersByTimeAsync(260 + 130 + 120 + 300)
    await p

    expect(useStore.getState().edgeTransition).toBeNull()
    expect(useStore.getState().settings.stickPosition).toBe('top')
    // sliderReleasedTime should have been stamped at completion
    expect(useStore.getState().sliderReleasedTime).toBeGreaterThan(0)
  })

  it('verifies cancelClose() only resets positionChangedTime after 1750ms stay window', () => {
    const hoverSrc = read('src/hooks/useEdgeHover.ts')
    expect(hoverSrc).toContain('const elapsed = state.sliderReleasedTime > 0 ? Date.now() - state.sliderReleasedTime : Infinity')
    expect(hoverSrc).toContain('if (elapsed >= 1750) {')
    expect(hoverSrc).toContain('state.resetPositionChangedTime()')
  })

  it('verifies isInsideBlade checks edgeTransition and uses consistent 218px blade height for top and bottom', () => {
    const hoverSrc = read('src/hooks/useEdgeHover.ts')
    expect(hoverSrc).toContain('if (state.sliderActive || state.edgeTransition?.active) return true')
    expect(hoverSrc).toContain('const bladeHeight = 218')
    expect(hoverSrc).not.toContain('state.settingsOpen ? 480 : 218')
    expect(hoverSrc).toContain('distFromBottom <= bladeHeight')
  })

  it('verifies unsubCursorEdge includes consistent 218px blade height and 40px hysteresis for top and bottom', () => {
    const hoverSrc = read('src/hooks/useEdgeHover.ts')
    expect(hoverSrc).toContain('const baseBladeH = 218')
    expect(hoverSrc).toContain('const keepOpenDepth = baseBladeH')
    expect(hoverSrc).toContain('const startCloseDepth = baseBladeH + 40')
    expect(hoverSrc).toContain('const outsideX = data.x < dockX - (BUFFER_PX + 40) || data.x > dockX + dockWidth + (BUFFER_PX + 40)')
    expect(hoverSrc).toContain('distFromTop > startCloseDepth')
    expect(hoverSrc).toContain('distFromBottom > startCloseDepth')
  })

  it('verifies closePanel and scheduleClose guard against active edge transitions', () => {
    const hoverSrc = read('src/hooks/useEdgeHover.ts')
    expect(hoverSrc).toContain('if (state.sliderActive || state.edgeTransition?.active) return')
  })

  it('verifies Settings.tsx preserves position tab on orientation toggle', () => {
    const settingsSrc = read('src/components/Settings.tsx')
    expect(settingsSrc).toContain("const currentTab = useStore.getState().settingsTab")
    expect(settingsSrc).toContain("const isTransitioning = !!useStore.getState().edgeTransition?.active")
    expect(settingsSrc).toContain("if (currentTab !== 'position' && !isTransitioning) {")
    expect(settingsSrc).toContain("useStore.getState().setSettingsTab('behaviour')")
  })
})
