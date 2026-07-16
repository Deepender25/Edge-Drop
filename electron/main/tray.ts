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
import { getMainWindow, setVisible, repositionWindow } from './window'
import type { StickPosition } from '../../shared/types'
import { pushState } from './state'

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
        new Notification({
          title: 'Edge-Drop Clipboard Shelf',
          body: 'Hover against the middle-left screen edge, or press Alt+C to slide open your shelf.',
          icon: PATHS.icon()
        }).show()
      }
    } catch { /* ignore */ }
  }

  function buildDisplaySubmenu(currentId: number | undefined): Electron.MenuItemConstructorOptions[] {
    const all = screen.getAllDisplays()
    const primary = screen.getPrimaryDisplay()
    return all.map((d) => {
      const name = (d as any).label || (d.id === primary.id ? 'Primary' : `Display #${d.id}`)
      return {
        label: d.id === primary.id
          ? `${name} (Primary) ${d.bounds.width}×${d.bounds.height}`
          : `${name} ${d.bounds.width}×${d.bounds.height}`,
        type: 'radio' as const,
        checked: currentId === d.id,
        click: () => {
          const next = saveSettings({ stickDisplayId: d.id })
          pushState.settings(next)
          repositionWindow()
        }
      }
    })
  }

  function buildStickSubmenu(current: StickPosition): Electron.MenuItemConstructorOptions[] {
    return (['left', 'right', 'top'] as StickPosition[]).map((pos) => ({
      label: pos.charAt(0).toUpperCase() + pos.slice(1),
      type: 'radio' as const,
      checked: current === pos,
      click: () => {
        const next = saveSettings({ stickPosition: pos })
        pushState.settings(next)
        repositionWindow()
      }
    }))
  }

  const rebuild = () => {
    const settings = loadSettings()
    const menu = Menu.buildFromTemplate([
      {
        label: 'Show Clipboard',
        click: () => {
          console.log('[Main] Context menu "Show Clipboard" clicked')
          setVisible(true)
          getMainWindow()?.focus()
          pushState.togglePanel()
        }
      },
      {
        label: 'Settings',
        click: () => {
          console.log('[Main] Context menu "Settings" clicked')
          setVisible(true)
          getMainWindow()?.focus()
          pushState.openSettings()
        }
      },
      { type: 'separator' },
      {
        label: 'Incognito (pause capture)',
        type: 'checkbox',
        checked: settings.incognito,
        click: (item) => {
          const next = saveSettings({ incognito: item.checked })
          pushState.settings(next)
          applyIncognito(next.incognito)
        }
      },
      { type: 'separator' },
      {
        label: 'Stick to',
        submenu: buildStickSubmenu(settings.stickPosition)
      },
      {
        label: 'Display',
        submenu: buildDisplaySubmenu(settings.stickDisplayId)
      },
      { type: 'separator' },
      {
        label: 'Quit Edge-Drop',
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

  // Refresh checkmarks each time the menu is shown.
  tray.on('right-click', () => tray?.popUpContextMenu())
  rebuild()
  return tray
}

/** Reflect incognito toggle into the watcher without the renderer round-trip. */
let incognitoApply: ((v: boolean) => void) | null = null
export function registerIncognitoApplier(fn: (v: boolean) => void): void {
  incognitoApply = fn
}
function applyIncognito(v: boolean): void {
  incognitoApply?.(v)
}
