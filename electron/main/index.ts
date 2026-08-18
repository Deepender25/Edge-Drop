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
import { app, BrowserWindow, nativeImage, protocol, session } from 'electron'
import { APP_CONFIG, runtime } from './config'
import { ensureDirs, cleanTemp, PATHS } from '../store/paths'
import { createWindow, getMainWindow, setInteractive, setVisible, startCursorPoll, stopCursorPoll, stopHeartbeat, setHotZoneWidth, registerTaskbarCreatedListener } from './window'
import { createTray, registerIncognitoApplier, refreshTray } from './tray'
import { registerIpc, registerSendListeners } from './ipc'
import { reconcileLaunchAtLoginOnStartup } from './loginItems'
import { isStoreBuild } from './config'
import { prewarmDragIcons } from './drag'
import { initState, getWatcher, loadSettings, saveSettings, pushState, stopStateTimers, getStore } from './state'
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

// Keep V8's old-space heap bounded without starving a renderer that is loading
// an existing clipboard history. This deliberately does not restore
// --optimize-for-size: that flag made collections more aggressive and caused
// visible animation hitches. Chromium image/compositor memory is handled by
// the thumbnail path below rather than by this JavaScript heap limit.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512 --expose-gc')

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
    getStore().persistSync()
  } catch { /* ignore */ }
  try {
    const { globalShortcut } = require('electron')
    globalShortcut.unregisterAll()
  } catch { /* ignore */ }
})

app.whenReady().then(() => {
  // GitHub NSIS needs an explicit AUMID. Store packages already have one from
  // the AppX identity; overriding it breaks toasts and taskbar grouping.
  if (!isStoreBuild()) {
    app.setAppUserModelId('com.edgedrop.app')
  }

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
  registerTaskbarCreatedListener(refreshTray)

  // Register global shortcut to toggle panel
  registerGlobalHotkey()
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

  void reconcileLaunchAtLoginOnStartup().then((reconciled) => {
    pushState.settings(reconciled)
  }).catch((err) => {
    console.error('[Main] Failed to reconcile launch-at-login with Windows:', err)
  })
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
      // List cards request bounded raster thumbnails.  Do not hand an original
      // multi-megapixel file to Chromium merely to paint a 50–240px card.
      if (request.url.startsWith(`${APP_CONFIG.imageProtocol}://thumb/`)) {
        const rawTarget = request.url.slice(`${APP_CONFIG.imageProtocol}://thumb/`.length)
        const filePath = rawTarget.startsWith('file/')
          ? normalize(decodeURIComponent(rawTarget.slice('file/'.length)))
          : resolveStoredImage(PATHS.imagesDir(), rawTarget)?.filePath

        if (!filePath || !existsSync(filePath)) return new Response('Not found', { status: 404 })
        return createThumbnailResponse(filePath)
      }

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

/**
 * Encodes a display-sized PNG so renderer image decodes are strictly bounded.
 * The full-resolution source remains available through edgelocal:// for the
 * preview flyout and drag/paste flows.
 */
function createThumbnailResponse(filePath: string): Response {
  const MAX_THUMBNAIL_EDGE_PX = 240
  const image = nativeImage.createFromPath(filePath)
  if (image.isEmpty()) return new Response('Unsupported image', { status: 415 })

  const { width, height } = image.getSize()
  const scale = Math.min(1, MAX_THUMBNAIL_EDGE_PX / Math.max(width, height))
  const thumbnail = scale < 1
    ? image.resize({
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        quality: 'good'
      })
    : image

  return new Response(thumbnail.toPNG(), {
    status: 200,
    headers: new Headers({
      'Content-Type': 'image/png',
      // The source file can change or be deleted; do not retain stale thumbs.
      'Cache-Control': 'no-cache'
    })
  })
}

// Silence unused import in environments where setVisible isn't referenced
// after the refactor (kept for second-instance wiring above).
void setInteractive

let _lastHotkeyToggleTime = 0

export function registerGlobalHotkey(targetHotkey?: string): boolean {
  try {
    const { globalShortcut } = require('electron')
    globalShortcut.unregisterAll()
    const settings = loadSettings()
    const hotkey = targetHotkey || settings.toggleHotkey || 'Alt+C'

    const success = globalShortcut.register(hotkey, () => {
      if (runtime.quitting) return
      const now = Date.now()
      if (now - _lastHotkeyToggleTime < 500) return
      _lastHotkeyToggleTime = now
      pushState.togglePanel()
    })

    if (!success && hotkey !== 'Alt+C') {
      console.warn(`[Main] Failed to register global shortcut ${hotkey}, falling back to Alt+C`)
      globalShortcut.register('Alt+C', () => {
        if (runtime.quitting) return
        const now = Date.now()
        if (now - _lastHotkeyToggleTime < 500) return
        _lastHotkeyToggleTime = now
        pushState.togglePanel()
      })
      return false
    }
    return success
  } catch (err) {
    console.error('[Main] Failed to register global shortcut:', err)
    return false
  }
}
