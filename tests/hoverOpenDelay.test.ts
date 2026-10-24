import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const paths = vi.hoisted(() => ({ settingsFile: '' }))

vi.mock('../electron/store/paths', () => ({
  PATHS: { settingsFile: () => paths.settingsFile }
}))

import {
  DEFAULT_SETTINGS,
  HOVER_OPEN_DELAY_MAX,
  HOVER_OPEN_DELAY_MIN,
  HOVER_OPEN_DELAY_STEP,
  normalizeHoverOpenDelay
} from '../shared/types'
import { loadSettings, resetSettingsCache, saveSettings } from '../electron/store/settings'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('hover open delay — value contract', () => {
  it('defaults to 0 so existing users keep today’s instant hover', () => {
    expect(DEFAULT_SETTINGS.hoverOpenDelay).toBe(0)
    expect(HOVER_OPEN_DELAY_MIN).toBe(0)
    expect(HOVER_OPEN_DELAY_MAX).toBe(1000)
    expect(HOVER_OPEN_DELAY_STEP).toBe(50)
  })

  it('clamps to the slider range', () => {
    expect(normalizeHoverOpenDelay(-200)).toBe(0)
    expect(normalizeHoverOpenDelay(5000)).toBe(1000)
    expect(normalizeHoverOpenDelay(1000)).toBe(1000)
  })

  it('snaps to the 50ms grid', () => {
    expect(normalizeHoverOpenDelay(73)).toBe(50)
    expect(normalizeHoverOpenDelay(75)).toBe(100)
    expect(normalizeHoverOpenDelay(500)).toBe(500)
  })

  it('treats anything invalid as 0', () => {
    expect(normalizeHoverOpenDelay(undefined)).toBe(0)
    expect(normalizeHoverOpenDelay(Number.NaN)).toBe(0)
    expect(normalizeHoverOpenDelay(Number.POSITIVE_INFINITY)).toBe(0)
    expect(normalizeHoverOpenDelay('300')).toBe(0)
    expect(normalizeHoverOpenDelay(null)).toBe(0)
  })
})

describe('hover open delay — persisted settings', () => {
  let dir: string

  beforeEach(() => {
    dir = join(tmpdir(), `ed-hoverdelay-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(dir, { recursive: true })
    paths.settingsFile = join(dir, 'settings.json')
    resetSettingsCache()
  })

  afterEach(() => {
    resetSettingsCache()
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('loads 0 for settings files written before the option existed', () => {
    writeFileSync(paths.settingsFile, JSON.stringify({ hoverActivation: true }))
    expect(loadSettings().hoverOpenDelay).toBe(0)
  })

  it('heals corrupt stored values on load', () => {
    writeFileSync(paths.settingsFile, JSON.stringify({ hoverOpenDelay: 'slow' }))
    expect(loadSettings().hoverOpenDelay).toBe(0)
    resetSettingsCache()
    writeFileSync(paths.settingsFile, JSON.stringify({ hoverOpenDelay: 99999 }))
    expect(loadSettings().hoverOpenDelay).toBe(1000)
  })

  it('saves a clamped, snapped value', () => {
    expect(saveSettings({ hoverOpenDelay: 333 }).hoverOpenDelay).toBe(350)
    expect(JSON.parse(readFileSync(paths.settingsFile, 'utf8')).hoverOpenDelay).toBe(350)
  })
})

describe('hover open delay — wiring', () => {
  it('every hover dwell timer (top, right, left) uses base dwell + user delay', () => {
    const src = read('src/hooks/useEdgeHover.ts')
    expect(src.match(/\}, dwellMsFor\(state\)\)/g)?.length).toBe(3)
    expect(src).not.toMatch(/\}, DWELL_MS\)/)
    expect(src).toContain('return DWELL_MS + normalizeHoverOpenDelay(state.settings.hoverOpenDelay)')
  })

  it('renders the slider in both the horizontal and vertical settings layouts', () => {
    const src = read('src/components/Settings.tsx')
    // one row definition, rendered by both layouts
    expect(src).toContain('below: renderHoverDelayControl()')
    expect(src).toMatch(/renderGroups\(horizontalTab\)[\s\S]*renderGroups\(activeTab\)/)
    expect(src).toContain('min={HOVER_OPEN_DELAY_MIN}')
    expect(src).toContain('max={HOVER_OPEN_DELAY_MAX}')
    expect(src).toContain('step={HOVER_OPEN_DELAY_STEP}')
  })

  it('has its strings in every language', () => {
    const src = read('src/i18n/translations.ts')
    const dictionaries = src.match(/export const \w+: TranslationKeys = \{/g)?.length ?? 0
    expect(dictionaries).toBe(31)
    for (const key of ['"hoverDelayTitle"', '"hoverDelayDesc"', '"hoverDelayInstant"', '"hoverDelay"']) {
      expect(src.split(`${key}:`).length - 1).toBe(dictionaries)
    }
  })
})
