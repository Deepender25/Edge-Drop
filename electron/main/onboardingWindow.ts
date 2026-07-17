import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { saveSettings, loadSettings, pushState } from './state'

let onboardingWindow: BrowserWindow | null = null

export function getOnboardingWindow(): BrowserWindow | null {
  return onboardingWindow
}

export function createOnboardingWindow(): void {
  if (onboardingWindow) {
    onboardingWindow.focus()
    return
  }

  onboardingWindow = new BrowserWindow({
    width: 800,
    height: 640,
    center: true,
    show: false,
    frame: false,
    resizable: false,
    backgroundColor: '#121212',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Standard window behavior (not always on top)

  if (process.env.ELECTRON_RENDERER_URL) {
    onboardingWindow.loadURL(process.env.ELECTRON_RENDERER_URL + '#/onboarding')
  } else {
    onboardingWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'onboarding' })
  }

  onboardingWindow.once('ready-to-show', () => {
    if (!onboardingWindow) return
    // Force the window to the very front to steal focus on initial launch
    onboardingWindow.setAlwaysOnTop(true)
    onboardingWindow.show()
    onboardingWindow.focus()
    // Then immediately revert to normal window behavior so it can go behind others
    onboardingWindow.setAlwaysOnTop(false)
  })

  onboardingWindow.on('closed', () => {
    onboardingWindow = null
    // If closed, consider tutorial completed
    const settings = loadSettings()
    if (!settings.tutorialCompleted) {
      const next = saveSettings({ tutorialCompleted: true })
      pushState.settings(next)
    }
  })
}

export function closeOnboardingWindow(): void {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.close()
  }
}
