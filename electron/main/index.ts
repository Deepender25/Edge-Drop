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
import { initState, getWatcher, loadSettings, pushState, stopStateTimers } from './state'
import { createOnboardingWindow } from './onboardingWindow'
import { startFullscreenMonitor, stopFullscreenMonitor, triggerFullscreenCheck } from './fullscreen'
import { join, resolve } from 'node:path'
import { existsSync, createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'

// Edge-Drop renders a small, mostly static transparent panel. Chromium's GPU
// process costs substantially more memory than it saves here, so use software
// compositing and retain the same visual/UI behavior without that process.
// Electron requires this before the ready event.
app.disableHardwareAcceleration()

// Restrict the renderer to a single webContents and forbid remote module usage.
app.enableSandbox()

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

  // Register the image protocol: edgelocal://<imageId> -> images/<imageId>.png
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
  const settings = loadSettings()
  setHotZoneWidth(settings.hotZoneWidth || 3)
  if (!settings.tutorialCompleted) {
    setTimeout(() => {
      createOnboardingWindow()
    }, 2000)
  }
  
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
      const id = request.url.replace(`${APP_CONFIG.imageProtocol}://`, '').replace(/\/$/, '')
      const cleanId = sanitizeId(id)
      if (!cleanId) {
        return new Response('Forbidden', { status: 403 })
      }

      const targetFile = resolve(join(PATHS.imagesDir(), `${cleanId}.png`))
      const baseDir = resolve(PATHS.imagesDir())

      // Strict path confinement check: target file MUST reside directly inside imagesDir
      if (!targetFile.startsWith(baseDir) || !existsSync(targetFile)) {
        return new Response('Not found', { status: 404 })
      }

      const stream = createReadStream(targetFile)
      const body = new Response(stream as unknown as ReadableStream<Uint8Array>).body
      const headers = new Headers({
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache',
        'ETag': `"${createHash('sha256').update(targetFile).digest('hex')}"`
      })
      return new Response(body, { status: 200, headers })
    } catch {
      return new Response('Error', { status: 500 })
    }
  })
}

/** Allow only id-like characters to prevent path traversal via the protocol. */
function sanitizeId(id: string): string {
  return id.replace(/[^a-z0-9-]/gi, '')
}

// Silence unused import in environments where setVisible isn't referenced
// after the refactor (kept for second-instance wiring above).
void setInteractive
