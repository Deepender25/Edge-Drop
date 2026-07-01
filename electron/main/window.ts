/**
 * The edge panel BrowserWindow.
 *
 * The window is the full *expanded* size and sits at the left edge of the
 * primary display's work area. It is transparent and frameless, and is normally
 * click-through (`setIgnoreMouseEvents(true, { forward: true })`) so the desktop
 * stays fully usable. The renderer listens for pointer movement across the whole
 * page (which is still delivered even while click-through, thanks to `forward`)
 * and toggles interactivity via `setInteractive` once the cursor dwells in the
 * hot zone. This is what produces the "invisible until you approach the edge"
 * effect without a separate hidden trigger window.
 *
 * Drag-in support: a separate thin "detector" window is layered behind the
 * main panel. Historically it was kept non-click-through so it could receive
 * OS dragenter events, but on Windows that made it swallow all desktop clicks
 * across the hint-bar band (a transparent always-on-top BrowserWindow still
 * hit-tests across a minimum footprint). It is now click-through too; drag-in
 * still works because the main-process cursor poll (startCursorPoll) reads the
 * OS cursor position independently of mouse events, so it fires during an OS
 * file drag — the edge dwell opens the panel and makes the main window
 * interactive, and the drop then lands on the main window.
 *
 * NOTE: this module must NOT import from state.ts to avoid circular dependencies.
 */
import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import { APP_CONFIG } from './config'
import { runtime } from './config'

export const PANEL_WIDTH = 384
/** Visual width of the blade when collapsed (only used by the renderer). */
export const COLLAPSED_WIDTH = 0

let mainWindow: BrowserWindow | null = null
let detectorWindow: BrowserWindow | null = null
let interactive = false

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/** True when the window currently accepts mouse clicks (blade is "open"). */
export function isInteractive(): boolean {
  return interactive
}

/**
 * Toggle whether the panel swallows pointer events.
 *
 * - interactive=false (collapsed) -> click-through: Windows passes ALL mouse
 *   clicks to apps beneath. Edge detection is done by the main-process cursor
 *   poll (startCursorPoll), which reads screen.getCursorScreenPoint() directly,
 *   so no mouse-event forwarding is needed.
 * - interactive=true  (expanded) -> normal interactive window: the black blade
 *   captures all clicks.
 */
export function setInteractive(value: boolean): void {
  if (!mainWindow || value === interactive) return
  interactive = value
  if (value) {
    // Panel is open: disable click-through so user can interact.
    mainWindow.setIgnoreMouseEvents(false)
  } else {
    // Panel is closed: full click-through, no forwarding needed.
    // Cursor edge detection is done by the main-process poll (startCursorPoll)
    // via screen.getCursorScreenPoint() + IPC, so forward:true is not required
    // and omitting it ensures Windows passes ALL mouse clicks to apps beneath.
    mainWindow.setIgnoreMouseEvents(true, { forward: false })
  }
}

/**
 * Poll the OS cursor position every ~16ms and send `window:cursor-edge` to
 * the renderer. This is the reliable alternative to `forward:true` on Windows
 * transparent windows, where pointermove forwarding often silently stops
 * working.
 */
let cursorPollTimer: ReturnType<typeof setInterval> | null = null
let lastEdgeState = false

export function startCursorPoll(): void {
  if (cursorPollTimer !== null) return
  cursorPollTimer = setInterval(() => {
    if (!mainWindow || !mainWindow.isVisible()) return

    const pt = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(pt)
    const wa = display.workArea

    // Translate screen coords → window-client coords.
    // getCursorScreenPoint() returns physical pixels on Windows; workArea is
    // already in physical pixels when scaleFactor > 1 in Electron's screen API.
    const clientX = pt.x - wa.x
    const clientY = pt.y - wa.y

    // Guard against garbage values that Windows occasionally sends.
    if (clientX < -1000 || clientX > 10000 || clientY < -1000 || clientY > 10000) return

    const inEdge = clientX <= 3
    const newState = inEdge

    // Keep streaming the cursor position to the renderer while it is near the
    // edge (so opening works) OR while the panel is open (so closing works in
    // EVERY direction). Previously we only streamed while clientX <= 60, which
    // froze the renderer's last-known position the moment the cursor moved to
    // the right past 60px — so it never learned the cursor had left and the
    // blade refused to retract horizontally. When the panel is closed and the
    // cursor is away from the edge we stop streaming to avoid needless IPC.
    if (clientX <= 60 || interactive || newState !== lastEdgeState) {
      lastEdgeState = newState
      mainWindow.webContents.send('window:cursor-edge', {
        x: clientX,
        y: clientY,
        inEdge,
        inZone: true
      })
    }
  }, 16)
}

export function stopCursorPoll(): void {
  if (cursorPollTimer !== null) {
    clearInterval(cursorPollTimer)
    cursorPollTimer = null
  }
}

/** Compute geometry anchored to the left edge of the primary display. */
function edgeGeometry(): { x: number; y: number; width: number; height: number } {
  const display = screen.getPrimaryDisplay()
  const workArea = display.workArea
  return {
    x: workArea.x,
    y: workArea.y,
    width: PANEL_WIDTH,
    height: workArea.height
  }
}

export function createWindow(): BrowserWindow {
  const { x, y, width, height } = edgeGeometry()

  mainWindow = new BrowserWindow({
    x,
    y,
    width: PANEL_WIDTH,
    height,
    show: false,
    frame: false,
    fullscreenable: false,
    maximizable: false,
    minWidth: PANEL_WIDTH,
    minHeight: 320,
    movable: false,
    resizable: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    backgroundColor: '#00000000',
    roundedCorners: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  // Start click-through with no forwarding — edge detection is done via cursor poll.
  mainWindow.setIgnoreMouseEvents(true, { forward: false })

  // Keep the panel glued to the primary display if the work area changes.
  screen.on('display-metrics-changed', () => {
    if (!mainWindow?.isVisible()) return
    const g = edgeGeometry()
    mainWindow.setBounds({ ...g })
    if (detectorWindow && !detectorWindow.isDestroyed()) {
      detectorWindow.setBounds({ x: g.x, y: g.y, width: 1, height: g.height })
    }
  })

  // Respect OS-level always-on-top reordering.
  mainWindow.on('focus', () => {
    if (interactive) mainWindow?.setAlwaysOnTop(true, 'screen-saver')
  })

  // Open external links in the default browser.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the renderer.
  if (APP_CONFIG.is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
    console.log(`[Renderer] ${message} (${sourceId}:${line})`)
  })

  mainWindow.on('close', (e) => {
    if (!runtime.quitting) {
      e.preventDefault()
    }
  })

  // Create the detector window for OS drag-in awareness.
  createDetectorWindow(x, y, width, height)

  return mainWindow
}

/**
 * Thin invisible detector window.
 *
 * It is click-through just like the main window, so when the panel is collapsed
 * it does not steal desktop clicks. It no longer drives opening (the cursor
 * poll does that). It is kept around as a fallback drag surface and a no-op
 * drag-event absorber; its inline script still forwards file drags to the main
 * window via `window.edge.setInteractive(true)` should it ever receive one.
 */
function createDetectorWindow(x: number, y: number, w: number, h: number): void {
  // Minimal HTML: the detector uses the preload bridge (window.edge) to send IPC.
  // It listens for dragenter/dragover/drop on the document and sends a signal
  // when Files are detected.
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0}
  html,body{width:100%;height:100%;background:transparent;pointer-events:none;overflow:hidden}
</style></head><body>
<script>
  document.addEventListener('dragenter', function(e) {
    if (e.dataTransfer && e.dataTransfer.types.indexOf && e.dataTransfer.types.indexOf('Files') >= 0) {
      e.preventDefault();
      if (window.edge) window.edge.setInteractive(true);
    }
  });
  document.addEventListener('dragover', function(e) {
    if (e.dataTransfer && e.dataTransfer.types.indexOf && e.dataTransfer.types.indexOf('Files') >= 0) {
      e.preventDefault();
    }
  });
  document.addEventListener('drop', function(e) {
    e.preventDefault();
  });
</script>
</body></html>`

  // Center vertically, 30% height so we don't block the Start menu / taskbar clicks
  const detHeight = Math.floor(h * 0.3)
  const detY = y + Math.floor((h - detHeight) / 2)

  detectorWindow = new BrowserWindow({
    x,
    y: detY,
    width: 1,
    height: detHeight,
    show: false,
    frame: false,
    fullscreenable: false,
    maximizable: false,
    movable: false,
    resizable: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    roundedCorners: false,
    focusable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  // Click-through, like the main window. A non-click-through always-on-top
  // window here used to swallow all desktop clicks across the hint-bar band
  // even though it was only 1px wide (Windows still hit-tests a transparent
  // always-on-top BrowserWindow across a minimum footprint). Keeping it
  // click-through means the collapsed panel passes clicks through everywhere.
  //
  // Drag-in is NOT lost: the main-process cursor poll
  // (screen.getCursorScreenPoint) reads the OS cursor position every ~16ms
  // regardless of mouse events, so it still fires while an OS file drag is in
  // progress — the 120ms edge dwell opens the panel and makes the main window
  // interactive, and the drop then lands on the main window.
  detectorWindow.setIgnoreMouseEvents(true, { forward: false })

  // Layer behind the main panel (lower always-on-top level).
  detectorWindow.setAlwaysOnTop(true, 'normal')

  detectorWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

  detectorWindow.once('ready-to-show', () => {
    detectorWindow?.showInactive()
  })

  detectorWindow.on('close', (e) => {
    if (!runtime.quitting) {
      e.preventDefault()
    }
  })
}

/** Toggle the panel between shown (always on top) and fully hidden. */
export function setVisible(visible: boolean): void {
  if (!mainWindow) return
  if (visible) mainWindow.showInactive()
  else mainWindow.hide()
}
