import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useStore } from '../src/store/appStore'
import {
  playEdgeRetractSound,
  playEdgeBeaconAppearSound,
  playEdgeExpandSound,
  playEdgeTransitionSound
} from '../src/lib/soundEffects'
import { DEFAULT_SETTINGS } from '../shared/types'

describe('Edge Transition Animation & State Management', () => {
  let patchSettingsMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    patchSettingsMock = vi.fn().mockImplementation(async (patch) => {
      const next = { ...useStore.getState().settings, ...patch }
      useStore.setState({ settings: next })
      return next
    })

    // Mock electron bridge
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
      edgeTransition: null
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('orchestrates retracting -> bar_fade_out -> bar_fade_in -> expanding phases when changing edges', async () => {
    const promise = useStore.getState().startEdgeTransition('right')

    // 1. Immediately in retracting phase (panel slides back into edge bar)
    expect(useStore.getState().edgeTransition).toEqual({
      active: true,
      from: 'left',
      to: 'right',
      stage: 'retracting'
    })

    // Advance past retracting (260ms)
    await vi.advanceTimersByTimeAsync(260)

    // 2. Bar fades out
    expect(useStore.getState().edgeTransition).toEqual({
      active: true,
      from: 'left',
      to: 'right',
      stage: 'bar_fade_out'
    })

    // Advance past bar_fade_out (100ms) + reposition pause (30ms)
    await vi.advanceTimersByTimeAsync(130)

    // 3. Settings patched and bar fades in on selected edge
    expect(useStore.getState().settings.stickPosition).toBe('right')
    expect(useStore.getState().edgeTransition).toEqual({
      active: true,
      from: 'left',
      to: 'right',
      stage: 'bar_fade_in'
    })

    // Advance past bar_fade_in (120ms)
    await vi.advanceTimersByTimeAsync(120)

    // 4. Clipboard expands out from the bar on the new edge
    expect(useStore.getState().edgeTransition).toEqual({
      active: true,
      from: 'left',
      to: 'right',
      stage: 'expanding'
    })

    // Advance past expanding (300ms)
    await vi.advanceTimersByTimeAsync(300)
    await promise

    // 5. Settled, edgeTransition reset to null
    expect(useStore.getState().edgeTransition).toBeNull()
    expect(useStore.getState().settings.stickPosition).toBe('right')
  })

  it('handles cross-orientation transition from vertical (left) to horizontal (top)', async () => {
    const promise = useStore.getState().startEdgeTransition('top')

    expect(useStore.getState().edgeTransition?.stage).toBe('retracting')
    await vi.advanceTimersByTimeAsync(260)

    expect(useStore.getState().edgeTransition?.stage).toBe('bar_fade_out')
    await vi.advanceTimersByTimeAsync(130)

    expect(useStore.getState().settings.stickPosition).toBe('top')
    expect(useStore.getState().edgeTransition?.stage).toBe('bar_fade_in')
    await vi.advanceTimersByTimeAsync(120)

    expect(useStore.getState().edgeTransition?.stage).toBe('expanding')
    await vi.advanceTimersByTimeAsync(300)
    await promise

    expect(useStore.getState().edgeTransition).toBeNull()
    expect(useStore.getState().settings.stickPosition).toBe('top')
  })

  it('guards against re-entrant calls when a transition is actively playing', async () => {
    const p1 = useStore.getState().startEdgeTransition('right')
    expect(useStore.getState().edgeTransition?.to).toBe('right')

    // Rapid second click to 'bottom' should be rejected
    const p2 = useStore.getState().startEdgeTransition('bottom')
    expect(useStore.getState().edgeTransition?.to).toBe('right')

    await vi.advanceTimersByTimeAsync(900)
    await p1
    await p2

    expect(useStore.getState().settings.stickPosition).toBe('right')
  })

  it('no-ops when target edge is already the current edge', async () => {
    await useStore.getState().startEdgeTransition('left')
    expect(useStore.getState().edgeTransition).toBeNull()
    expect(patchSettingsMock).not.toHaveBeenCalled()
  })

  it('immediately updates settings with zero delay when reduceMotion is true', async () => {
    useStore.setState((s) => ({
      settings: { ...s.settings, stickPosition: 'left', reduceMotion: true }
    }))

    await useStore.getState().startEdgeTransition('bottom')

    expect(useStore.getState().edgeTransition).toBeNull()
    expect(useStore.getState().settings.stickPosition).toBe('bottom')
  })

  it('tactile acoustic synthesis functions execute safely without throwing in headless environments', () => {
    expect(() => playEdgeRetractSound()).not.toThrow()
    expect(() => playEdgeBeaconAppearSound()).not.toThrow()
    expect(() => playEdgeExpandSound()).not.toThrow()
    expect(() => playEdgeTransitionSound()).not.toThrow()
  })
})
