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
import { createWindow, getMainWindow, setInteractive, setVisible, startCursorPoll } from './window'
import { createTray, registerIncognitoApplier } from './tray'
import { registerIpc, registerSendListeners } from './ipc'
import { initState, getWatcher, loadSettings, pushState } from './state'
import { join } from 'node:path'
import { existsSync, createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'

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
})

app.whenReady().then(() => {
  ensureDirs()
  cleanTemp()

  // Lock the renderer session down: block all permission requests by default.
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))

  // Register the image protocol: edgelocal://<imageId> -> images/<imageId>.png
  registerImageProtocol()

  createWindow()
  startCursorPoll()
  createTray()
  registerIpc()
  registerSendListeners()
  initState()

  // Reflect incognito setting into the watcher immediately.
  const settings = loadSettings()
  registerIncognitoApplier((v) => getWatcher().setPaused(v))
  getWatcher().setPaused(settings.incognito)
  pushState.settings(settings)

  // Keep the tray checkmarks in sync after settings change from the UI.
  // (Tray menu is rebuilt on each open, so no extra wiring is needed here.)
})

app.on('window-all-closed', (e: Event) => {
  // Never quit when the window closes (there is no window chrome anyway).
  e.preventDefault()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ---- image protocol handler ------------------------------------------------
function registerImageProtocol(): void {
  protocol.handle(APP_CONFIG.imageProtocol, async (request) => {
    try {
      const id = request.url.replace(`${APP_CONFIG.imageProtocol}://`, '').replace(/\/$/, '')
      const file = join(PATHS.imagesDir(), `${sanitizeId(id)}.png`)
      if (!existsSync(file)) {
        return new Response('Not found', { status: 404 })
      }
      const stream = createReadStream(file)
      // node 'web stream' readable for the Response body.
      const body = new Response(stream as unknown as ReadableStream<Uint8Array>).body
      const headers = new Headers({
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache'
      })
      // ETag based on file path hash for cheap revalidation.
      headers.set('ETag', `"${createHash('md5').update(file).digest('hex')}"`)
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
