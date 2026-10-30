import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const fsRoots = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => join(fsRoots.userData, 'app'),
    getPath: (name: string) => (name === 'userData' ? fsRoots.userData : join(fsRoots.userData, name))
  }
}))

import { ONBOARDING_VERSION, onboardingDue } from '../shared/onboarding'
import { loadSettings, resetSettingsCache } from '../electron/store/settings'

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('who sees the welcome tour', () => {
  it('a new install sees it (first run)', () => {
    expect(onboardingDue({ tutorialCompleted: false })).toBe('first-run')
  })

  it('someone updating from a version before 0.4.0 sees it once (they only finished the old tour)', () => {
    expect(onboardingDue({ tutorialCompleted: true })).toBe('update')
    expect(onboardingDue({ tutorialCompleted: true, onboardingVersion: 1 })).toBe('update')
  })

  it('someone who finished this tour never sees it again on later updates', () => {
    expect(onboardingDue({ tutorialCompleted: true, onboardingVersion: ONBOARDING_VERSION })).toBeNull()
    // a later, newer tour would show once again
    expect(onboardingDue({ tutorialCompleted: true, onboardingVersion: ONBOARDING_VERSION - 1 })).toBe('update')
  })

  it('this is tour 2: everyone on 0.3.x and older counts as not having seen it', () => {
    expect(ONBOARDING_VERSION).toBe(2)
  })
})

describe('the saved tour version', () => {
  beforeEach(() => {
    fsRoots.userData = join(tmpdir(), `edge-drop-tour-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(fsRoots.userData, { recursive: true })
    resetSettingsCache()
  })
  afterEach(() => {
    resetSettingsCache()
    rmSync(fsRoots.userData, { recursive: true, force: true })
  })

  it('a settings file from 0.3.x (no version) loads as due for the update tour, keeping its language', () => {
    writeFileSync(join(fsRoots.userData, 'settings.json'), JSON.stringify({ tutorialCompleted: true, language: 'de' }))
    const s = loadSettings()
    expect(s.onboardingVersion).toBeUndefined()
    expect(s.language).toBe('de')
    expect(onboardingDue(s)).toBe('update')
  })

  it('an odd saved value never hides the tour', () => {
    for (const odd of ['2', null, Number.NaN, {}]) {
      resetSettingsCache()
      writeFileSync(join(fsRoots.userData, 'settings.json'), JSON.stringify({ tutorialCompleted: true, onboardingVersion: odd }))
      expect(loadSettings().onboardingVersion).toBeUndefined()
    }
  })
})

describe('wiring', () => {
  const index = read('electron/main/index.ts')
  const win = read('electron/main/onboardingWindow.ts')
  const tour = read('src/Onboarding.tsx')

  it('launch opens the tour for a first run as before, and for an update even on a silent login start', () => {
    expect(index).toContain("const tour = onboardingDue(settings)")
    expect(index).toMatch(/tour === 'first-run' && !hiddenLaunch\)/)
    expect(index).toMatch(/tour === 'update'\) \{[\s\S]*?createOnboardingWindow\(\)[\s\S]*?hiddenLaunch \? UPDATE_TOUR_DELAY_AT_LOGIN_MS : 2000/)
  })

  it("the tour plays in the device's own language, and the user's saved language is never changed for it", () => {
    // the tour's own copy of the settings uses System Default ...
    expect(tour).toMatch(/useStore\.setState\(\{\s*settings: \{\s*\.\.\.settings,\s*language: 'system',/)
    // ... and launch saves no language, for a new install or an update
    const launch = index.slice(index.indexOf('const tour = onboardingDue(settings)'), index.indexOf('setHotZoneWidth'))
    expect(launch).not.toMatch(/saveSettings|language:/)
  })

  it('every way out of the tour saves this tour as seen', () => {
    // closing the window (Skip, the close button, quitting) ...
    expect(win).toMatch(/\(settings\.onboardingVersion \?\? 0\) < ONBOARDING_VERSION/)
    expect(win).toContain('saveSettings({ tutorialCompleted: true, onboardingVersion: ONBOARDING_VERSION })')
    // ... and Get Started
    expect(tour).toContain('edge.updateSettings({ tutorialCompleted: true, onboardingVersion: ONBOARDING_VERSION })')
  })
})
