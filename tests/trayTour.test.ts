import { describe, it, expect, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  buildFromTemplate: vi.fn().mockReturnValue({}),
  createOnboardingWindow: vi.fn()
}))

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn().mockReturnValue('')
}))

vi.mock('electron', () => {
  const image = { resize: vi.fn().mockReturnThis() }
  return {
    app: {
      getAppPath: vi.fn().mockReturnValue(process.cwd()),
      getPath: vi.fn().mockReturnValue(process.cwd()),
      getPreferredSystemLanguages: vi.fn().mockReturnValue(['en-US']),
      quit: vi.fn()
    },
    nativeTheme: { shouldUseDarkColors: true, on: vi.fn() },
    nativeImage: { createFromPath: vi.fn().mockReturnValue(image), createFromBuffer: vi.fn().mockReturnValue(image) },
    Tray: class {
      setImage = vi.fn(); setToolTip = vi.fn(); setContextMenu = vi.fn(); on = vi.fn(); isDestroyed = () => false
    },
    Menu: { buildFromTemplate: mocks.buildFromTemplate },
    Notification: { isSupported: vi.fn().mockReturnValue(false) },
    screen: { on: vi.fn() }
  }
})

vi.mock('../electron/store/settings', () => ({
  loadSettings: () => ({ language: 'en', stickPosition: 'left', incognito: false, hoverActivation: true }),
  saveSettings: vi.fn()
}))
vi.mock('../electron/main/window', () => ({
  getMainWindow: vi.fn(), setVisible: vi.fn(), repositionWindow: vi.fn(),
  getDisplayListOptions: () => [], registerWindowRepositionListener: vi.fn(), popUpAndRetract: vi.fn()
}))
vi.mock('../electron/main/state', () => ({ pushState: {} }))
vi.mock('../electron/main/onboardingWindow', () => ({ createOnboardingWindow: mocks.createOnboardingWindow }))

import { createTray } from '../electron/main/tray'
import { TRANSLATIONS, en } from '../src/i18n/translations'

describe('tray menu: replay the welcome tour', () => {
  it('sits right under Settings and opens the onboarding window', () => {
    createTray()
    const template = mocks.buildFromTemplate.mock.calls.at(-1)![0] as Electron.MenuItemConstructorOptions[]
    const labels = template.map((item) => item.label)
    expect(labels.indexOf('Replay Welcome Tour')).toBe(labels.indexOf('Settings') + 1)
    const item = template.find((it) => it.label === 'Replay Welcome Tour')!
    ;(item.click as () => void)()
    expect(mocks.createOnboardingWindow).toHaveBeenCalledTimes(1)
  })

  it('is translated in every language', () => {
    for (const [code, dict] of Object.entries(TRANSLATIONS)) {
      expect(dict.tray.tour, code).toBeTruthy()
      if (code !== 'en') expect(dict.tray.tour, code).not.toBe(en.tray.tour)
    }
  })
})
