/**
 * System tray icon + context menu.
 *
 * The panel has no taskbar button and no window chrome, so the tray is the
 * user's handle on the app: show/hide, toggle incognito, and quit. Menu item
 * state (checkmarks) is rebuilt every time the menu opens so it always reflects
 * current settings.
 */
import { Menu, Tray, app, nativeImage, Notification, screen } from 'electron'
import { existsSync } from 'node:fs'
import { PATHS } from '../store/paths'
import { loadSettings, saveSettings } from '../store/settings'
import { getMainWindow, setVisible, repositionWindow, getDisplayListOptions, registerWindowRepositionListener, popUpAndRetract } from './window'
import type { StickPosition } from '../../shared/types'
import { pushState } from './state'
import { TRANSLATIONS, en } from '../../src/i18n/translations'

let tray: Tray | null = null

/** Build a tiny monochrome tray icon if no on-disk icon exists (first run). */
function fallbackIcon(): Electron.NativeImage {
  // 16x16 transparent PNG with a centered accent dot.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAW0lEQVR4AcXOMQ4AIQhF4eD9' +
      '/yWhVSChGAyMKlmJUqCYjCDxgi+gnqEVREe0g1FXuATdQI/CBXQMvABjgn0wAbJBHzPmJ2gB' +
      '1mYAAAAASUVORK5CYII=',
    'base64'
  )
  return nativeImage.createFromBuffer(png).resize({ width: 16, height: 16 })
}

export function createTray(): Tray {
  const iconPath = PATHS.trayIcon()
  let image: Electron.NativeImage

  if (existsSync(iconPath)) {
    // Load and resize to exactly 32x32. Windows system tray renders icons at 16x16
    // logical pixels but uses 32x32 physical pixels on 2x DPI displays.
    // Using a single 32x32 image with no scaleFactor trickery is the most reliable
    // approach — the OS scales it automatically.
    image = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32, quality: 'best' })
  } else {
    image = fallbackIcon()
  }
  tray = new Tray(image)
  tray.setToolTip('Edge-Drop')

  // Show welcome notification on first run
  if (!existsSync(PATHS.indexFile())) {
    try {
      if (Notification.isSupported()) {
        const initialSettings = loadSettings()
        new Notification({
          title: getTrayText(initialSettings.language, 'welcomeTitle'),
          body: getTrayText(initialSettings.language, 'welcomeBody'),
          icon: PATHS.icon()
        }).show()
      }
    } catch { /* ignore */ }
  }

  function buildDisplaySubmenu(): Electron.MenuItemConstructorOptions[] {
    const options = getDisplayListOptions()
    return options.map((d) => ({
      label: d.label,
      type: 'radio' as const,
      checked: d.isCurrent,
      click: () => {
        // Persist workArea (not bounds) — geometry.ts Tier-2 fuzzy match compares
        // d.workArea against savedWorkArea. Storing bounds (which includes the taskbar)
        // causes a ~40px mismatch that exceeds BOUNDS_TOLERANCE, breaking cross-reboot recovery.
        const next = saveSettings({
          stickDisplayId: d.id,
          stickDisplayWorkArea: d.workArea,
          stickDisplayScaleFactor: d.scaleFactor
        })
        pushState.settings(next)
        repositionWindow()
        popUpAndRetract(1500)
        rebuild()
      }
    }))
  }

  function buildStickSubmenu(current: StickPosition): Electron.MenuItemConstructorOptions[] {
    const settings = loadSettings()
    return ([
      { pos: 'left' as const, labelKey: 'left' as const },
      { pos: 'right' as const, labelKey: 'right' as const }
    ]).map(({ pos, labelKey }) => ({
      label: getTrayText(settings.language, labelKey),
      type: 'radio' as const,
      checked: current === pos,
      click: () => {
        const next = saveSettings({ stickPosition: pos })
        pushState.settings(next)
        repositionWindow()
        popUpAndRetract(1500)
        rebuild()
      }
    }))
  }

function getTrayText(settingsLang: string | undefined, key: keyof typeof en['tray']): string {
  let langCode = settingsLang || 'system'
  if (langCode === 'system') {
    const sysLangs = app.getPreferredSystemLanguages()
    const first = (sysLangs[0] || '').toLowerCase()
    if (first.startsWith('zh-tw') || first.startsWith('zh-hk')) langCode = 'zh-TW'
    else if (first.startsWith('zh')) langCode = 'zh-CN'
    else if (first.startsWith('es')) langCode = 'es'
    else if (first.startsWith('fr')) langCode = 'fr'
    else if (first.startsWith('de')) langCode = 'de'
    else if (first.startsWith('hi')) langCode = 'hi'
    else if (first.startsWith('fa')) langCode = 'fa'
    else if (first.startsWith('ja')) langCode = 'ja'
    else if (first.startsWith('ru')) langCode = 'ru'
    else langCode = 'en'
  }
  const dict = TRANSLATIONS[langCode]
  return (dict?.tray?.[key]) || en.tray[key] || key
}

  const rebuild = () => {
    const settings = loadSettings()
    const t = (k: keyof typeof en['tray']) => getTrayText(settings.language, k)

    const menu = Menu.buildFromTemplate([
      {
        label: t('showClipboard'),
        click: () => {
          console.log('[Main] Context menu "Show Clipboard" clicked')
          setVisible(true)
          getMainWindow()?.focus()
          pushState.togglePanel()
        }
      },
      {
        label: t('settings'),
        click: () => {
          console.log('[Main] Context menu "Settings" clicked')
          setVisible(true)
          getMainWindow()?.focus()
          pushState.openSettings()
        }
      },
      { type: 'separator' },
      {
        label: t('incognito'),
        type: 'checkbox',
        checked: settings.incognito,
        click: (item) => {
          const next = saveSettings({ incognito: item.checked })
          pushState.settings(next)
          applyIncognito(next.incognito)
          rebuild()
        }
      },
      {
        label: t('hoverTrigger'),
        type: 'checkbox',
        checked: settings.hoverActivation ?? true,
        click: (item) => {
          const next = saveSettings({
            hoverActivation: item.checked,
            suppressInFullscreen: item.checked ? true : false
          })
          pushState.settings(next)
          rebuild()
        }
      },
      { type: 'separator' },
      {
        label: t('stickTo'),
        submenu: buildStickSubmenu(settings.stickPosition)
      },
      {
        label: t('display'),
        submenu: buildDisplaySubmenu()
      },
      { type: 'separator' },
      {
        label: t('quit'),
        click: () => {
          app.quit()
        }
      }
    ])
    tray?.setContextMenu(menu)
  }

  tray.on('click', () => {
    console.log('[Main] Tray icon left-clicked')
    const win = getMainWindow()
    if (!win) return
    setVisible(true)
    pushState.togglePanel()
  })

  // Rebuild menu dynamically right before showing to ensure displays & checkmarks are 100% current.
  tray.on('right-click', () => {
    rebuild()
    tray?.popUpContextMenu()
  })

  // Listen for display changes to keep tray context menu updated in real-time.
  screen.on('display-added', rebuild)
  screen.on('display-removed', rebuild)
  screen.on('display-metrics-changed', rebuild)

  registerWindowRepositionListener(rebuild)
  trayMenuRebuilder = rebuild
  rebuild()
  return tray
}

let trayMenuRebuilder: (() => void) | null = null
export function rebuildTrayMenu(): void {
  trayMenuRebuilder?.()
}

/** Reflect incognito toggle into the watcher without the renderer round-trip. */
let incognitoApply: ((v: boolean) => void) | null = null
export function registerIncognitoApplier(fn: (v: boolean) => void): void {
  incognitoApply = fn
}
function applyIncognito(v: boolean): void {
  incognitoApply?.(v)
}
