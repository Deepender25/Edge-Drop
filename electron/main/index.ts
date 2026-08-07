/**
 * Electron main process entry point.
 *
 * Lifecycle:
 *   1. Single-instance lock (only one Edge-Drop may run).
 *   2. App 'ready' -> ensure dirs, create the edge window + tray, register the
 *      image protocol + IPC handlers, start the clipboard watcher.
 *   3. On 'window-all-closed' we DON'T quit (the panel is hidden, not closed).
 *   4. Quit from the tray menu tears everything down cleanly.
 */
import { app, BrowserWindow, protocol, session } from 'electron'
import { APP_CONFIG, runtime } from './config'
import { ensureDirs, cleanTemp, PATHS } from '../store/paths'
import { createWindow, getMainWindow, setInteractive, setVisible, startCursorPoll, stopCursorPoll, stopHeartbeat, setHotZoneWidth } from './window'
import { createTray, registerIncognitoApplier } from './tray'
import { registerIpc, registerSendListeners } from './ipc'
import { prewarmDragIcons } from './drag'
import { initState, getWatcher, loadSettings, saveSettings, pushState, stopStateTimers } from './state'
import { initAutoUpdater } from './updater'
import { createOnboardingWindow } from './onboardingWindow'
import { startFullscreenMonitor, stopFullscreenMonitor, triggerFullscreenCheck } from './fullscreen'
import { extname, normalize } from 'node:path'
import { existsSync, createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolveStoredImage } from './imageProtocol'

// Edge-Drop renders a small, mostly static transparent panel. Chromium's GPU
// process costs substantially more memory (~150–250 MB) than the iGPU compositing
// savings are worth for such a simple UI. Software compositing keeps the process
// count and RAM footprint minimal without meaningfully affecting visual quality.
// Electron requires this call before the ready event.
app.disableHardwareAcceleration()

// Restrict the renderer to a single webContents and forbid remote module usage.
app.enableSandbox()

// Optimize V8 heap allocation and garbage collection for low RAM overhead.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128 --optimize-for-size')

// ---- single instance -------------------------------------------------------
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // If a second copy launches, just reveal the existing panel.
    setVisible(true)
    getMainWindow()?.focus()
  })
  app.on('browser-window-blur', () => {
    triggerFullscreenCheck()
  })
}

// ---- before ready: register privileged protocol ----------------------------
// Must happen before app is ready so we can declare it as privileged (bypass
// CSP for image loads).
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_CONFIG.imageProtocol,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

// ---- app lifecycle ---------------------------------------------------------
app.on('before-quit', () => {
  runtime.quitting = true
  stopCursorPoll()
  stopHeartbeat()
  stopStateTimers()
  stopFullscreenMonitor()
  getWatcher().stop()
  try {
    const { globalShortcut } = require('electron')
    globalShortcut.unregisterAll()
  } catch { /* ignore */ }
})

app.whenReady().then(() => {
  // Set App User Model ID so native notifications are branded as "Edge-Drop" on Windows
  app.setAppUserModelId('com.edgedrop.app')

  ensureDirs()
  cleanTemp()

  // Lock the renderer session down: block all permission requests by default.
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))

  // Register the image protocol: edgelocal://<imageId> -> the staged image file.
  registerImageProtocol()

  createWindow()
  startCursorPoll()
  startFullscreenMonitor()
  createTray()

  // Register Alt+C global shortcut to toggle panel
  try {
    const { globalShortcut } = require('electron')
    let lastToggleTime = 0
    globalShortcut.register('Alt+C', () => {
      if (runtime.quitting) return
      const now = Date.now()
      if (now - lastToggleTime < 500) return // Throttle to once per 500ms
      lastToggleTime = now
      pushState.togglePanel()
    })
  } catch (err) {
    console.error('[Main] Failed to register global shortcut Alt+C:', err)
  }
  registerIpc()
  registerSendListeners()
  initState()
  prewarmDragIcons()

  // Reflect settings immediately.
  let settings = loadSettings()
  if (!settings.tutorialCompleted) {
    // When onboarding is active (initial launch or reset tutorial), reset language to system default so onboarding always begins in System Default
    if (settings.language !== 'system') {
      settings = saveSettings({ language: 'system' })
    }
    setTimeout(() => {
      createOnboardingWindow()
    }, 2000)
  }
  setHotZoneWidth(settings.hotZoneWidth || 3)
  
  if (app.isPackaged) {
    try {
      app.setLoginItemSettings({
        openAtLogin: settings.launchAtLogin,
        path: app.getPath('exe')
      })
    } catch { /* ignore in non-packaged / sandbox */ }
  }
  registerIncognitoApplier((v) => getWatcher().setPaused(v))
  getWatcher().setPaused(settings.incognito)
  pushState.settings(settings)
  initAutoUpdater()

  // Keep the tray checkmarks in sync after settings change from the UI.
  // (Tray menu is rebuilt on each open, so no extra wiring is needed here.)
})

app.on('window-all-closed', () => {
  // Never quit automatically when panel hides/closes; lifecycle is managed by tray.
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ---- image protocol handler ------------------------------------------------
function registerImageProtocol(): void {
  protocol.handle(APP_CONFIG.imageProtocol, async (request) => {
    try {
      // Support streaming full-resolution local image files: edgelocal://file/<encodedPath>
      if (request.url.startsWith(`${APP_CONFIG.imageProtocol}://file/`)) {
        const rawPath = request.url.slice(`${APP_CONFIG.imageProtocol}://file/`.length)
        const filePath = normalize(decodeURIComponent(rawPath))
        if (existsSync(filePath)) {
          const ext = extname(filePath).toLowerCase()
          let contentType = 'image/png'
          if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg'
          else if (ext === '.gif') contentType = 'image/gif'
          else if (ext === '.webp') contentType = 'image/webp'
          else if (ext === '.svg') contentType = 'image/svg+xml'
          else if (ext === '.bmp') contentType = 'image/bmp'
          else if (ext === '.avif') contentType = 'image/avif'

          const stream = createReadStream(filePath)
          const body = new Response(stream as unknown as ReadableStream<Uint8Array>).body
          return new Response(body, {
            status: 200,
            headers: new Headers({
              'Content-Type': contentType,
              'Cache-Control': 'max-age=3600'
            })
          })
        }
        return new Response('Not found', { status: 404 })
      }

      const imageId = new URL(request.url).hostname
      if (!/^[a-z0-9-]+$/i.test(imageId)) {
        return new Response('Forbidden', { status: 403 })
      }

      const storedImage = resolveStoredImage(PATHS.imagesDir(), imageId)
      if (!storedImage) {
        return new Response('Not found', { status: 404 })
      }

      const stream = createReadStream(storedImage.filePath)
      const body = new Response(stream as unknown as ReadableStream<Uint8Array>).body
      const headers = new Headers({
        'Content-Type': storedImage.contentType,
        'Cache-Control': 'no-cache',
        'ETag': `"${createHash('sha256').update(storedImage.filePath).digest('hex')}"`
      })
      return new Response(body, { status: 200, headers })
    } catch {
      return new Response('Error', { status: 500 })
    }
  })
}

// Silence unused import in environments where setVisible isn't referenced
// after the refactor (kept for second-instance wiring above).
void setInteractive
