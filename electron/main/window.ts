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
import { existsSync } from 'node:fs'
import { APP_CONFIG } from './config'
import { runtime } from './config'
import { PATHS } from '../store/paths'
import { computeStickBounds } from './geometry'
import { loadSettings } from '../store/settings'

export const PANEL_WIDTH = 384
/** Visual width of the blade when collapsed (only used by the renderer). */
export const COLLAPSED_WIDTH = 0

let mainWindow: BrowserWindow | null = null
// Kept only by the unused legacy helper at the bottom of this module. The
// detector window is deliberately no longer created at runtime.
let detectorWindow: BrowserWindow | null = null
let interactive = false
export let previewActive = false

export let currentHotZoneWidth = 3
export let currentStickDisplayId: number | undefined

export function setHotZoneWidth(width: number): void {
  currentHotZoneWidth = width
}

export function setStickDisplayId(id: number | undefined): void {
  currentStickDisplayId = id
}

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
    // Use 'screen-saver' level to stay above fullscreen apps (YouTube fullscreen, games, etc.)
    // 'floating' (HWND_TOPMOST) can be pushed behind by fullscreen D3D/browser windows.
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
  } else {
    // Panel is closed: full click-through, no forwarding needed.
    mainWindow.setIgnoreMouseEvents(true, { forward: false })
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
  }
}

export function setPreviewMode(active: boolean): void {
  if (previewActive === active) return
  previewActive = active
  repositionWindow()
}

/**
 * Poll the OS cursor position every ~16ms and send `window:cursor-edge` to
 * the renderer. This is the reliable alternative to `forward:true` on Windows
 * transparent windows, where pointermove forwarding often silently stops
 * working.
 */
let cursorPollTimer: ReturnType<typeof setInterval> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let lastEdgeState = false
let heartbeatPaused = false

/**
 * Temporarily suspend the always-on-top heartbeat.
 *
 * The heartbeat calls setAlwaysOnTop() every 500 ms, which reasserts z-order
 * via SetWindowPos(HWND_TOPMOST) on Windows.  During a native drag the OS
 * renders the drag-ghost image using the DWM compositor at a layer that sits
 * BELOW HWND_TOPMOST windows.  Every heartbeat tick therefore pushes our
 * window in front of the ghost, making it disappear ~0.5 s into any drag.
 *
 * Pausing the heartbeat for the duration of the drag keeps the window at its
 * current z-position and lets the DWM ghost stay visible for the full drag.
 * The heartbeat is re-enabled (and immediately re-asserts always-on-top) when
 * the drag ends.
 */
export function setHeartbeatPaused(paused: boolean): void {
  heartbeatPaused = paused
  if (!paused) {
    // Re-assert z-order immediately when drag ends so the window snaps back
    // to the correct level without waiting up to 500 ms for the next tick.
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
    }
  }
}

export function startCursorPoll(): void {
  if (cursorPollTimer !== null) return
  cursorPollTimer = setInterval(() => {
    if (runtime.quitting || !mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return

    const settings = loadSettings()
    const pt = screen.getCursorScreenPoint()

    // Find the stick display (or fallback to primary)
    const allDisplays = screen.getAllDisplays()
    let stickDisplay = allDisplays.find(d => d.id === currentStickDisplayId)
    if (!stickDisplay) {
      stickDisplay = screen.getPrimaryDisplay()
    }

    const wa = stickDisplay.workArea

    // Translate screen coords → stick display client coords.
    const clientX = pt.x - wa.x
    const clientY = pt.y - wa.y

    // Guard against garbage values that Windows occasionally sends.
    if (clientX < -5000 || clientX > 15000 || clientY < -5000 || clientY > 15000) return

    let inEdge = false
    switch (settings.stickPosition) {
      case 'left':
        inEdge = clientX >= -30 && clientX <= currentHotZoneWidth
        break
      case 'right':
        const distFromRight = wa.width - clientX
        inEdge = distFromRight >= -30 && distFromRight <= currentHotZoneWidth
        break
    }

    const newState = inEdge

    // Stream cursor position while near the edge (opening), while open (closing),
    // or when edge state changes. The near-edge check adapts to stick position.
    const nearEdge = settings.stickPosition === 'right'
      ? (wa.width - clientX) <= 450
      : clientX <= 450
    if (nearEdge || interactive || newState !== lastEdgeState) {
      lastEdgeState = newState
      if (!mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('window:cursor-edge', {
          x: clientX,
          y: clientY,
          inEdge,
          inZone: true,
          stickPosition: settings.stickPosition,
          displayWidth: wa.width,
          displayHeight: wa.height
        })
      }
    }
  }, 16)
}

export function stopCursorPoll(): void {
  if (cursorPollTimer !== null) {
    clearInterval(cursorPollTimer)
    cursorPollTimer = null
  }
}

function getStickGeometry(): { x: number; y: number; width: number; height: number } {
  const settings = loadSettings()
  const allDisplays = screen.getAllDisplays().map(d => ({
    id: d.id,
    workArea: { ...d.workArea }
  }))

  const primaryHeight = screen.getPrimaryDisplay().workArea.height
  const windowHeight = primaryHeight
  const currentWindowWidth = previewActive ? 820 : PANEL_WIDTH

  const result = computeStickBounds({
    position: settings.stickPosition,
    displays: allDisplays,
    displayId: settings.stickDisplayId,
    windowWidth: currentWindowWidth,
    windowHeight,
    currentBounds: getMainWindow()?.getBounds()
  })

  currentStickDisplayId = result.displayId
  return { x: result.x, y: result.y, width: result.width, height: result.height }
}

export function createWindow(): BrowserWindow {
  const { x, y, height } = getStickGeometry()

  mainWindow = new BrowserWindow({
    icon: PATHS.icon(),
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
  screen.on('display-metrics-changed', repositionWindow)
  screen.on('display-added', () => setTimeout(repositionWindow, 500))
  screen.on('display-removed', () => setTimeout(repositionWindow, 500))

  // Respect OS-level always-on-top reordering.
  mainWindow.on('focus', () => {
    mainWindow?.setAlwaysOnTop(true, 'screen-saver')
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
    if (!mainWindow) return
    mainWindow.showInactive()
    // 'screen-saver' level stays above fullscreen browser windows and games.
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
  })

  mainWindow.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
    console.log(`[Renderer] ${message} (${sourceId}:${line})`)
  })

  mainWindow.on('close', (e) => {
    if (!runtime.quitting) {
      e.preventDefault()
    }
  })

  // Periodic heartbeat: Windows fullscreen apps (Chrome YouTube, games) push
  // floating windows behind them. Re-asserting 'screen-saver' level every 500ms
  // ensures the panel instantly re-appears when the user exits fullscreen.
  if (heartbeatTimer !== null) clearInterval(heartbeatTimer)
  heartbeatTimer = setInterval(() => {
    if (runtime.quitting || heartbeatPaused || interactive) return
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
    }
  }, 500)

  return mainWindow
}

export function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

export function repositionWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const g = getStickGeometry()
  mainWindow.setBounds({ ...g })
}

/** Toggle the panel between shown (always on top) and fully hidden. */
export function setVisible(visible: boolean): void {
  if (!mainWindow) return
  if (visible) {
    mainWindow.showInactive()
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
  } else {
    mainWindow.hide()
  }
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
function getDetectorBounds(g: { x: number; y: number; width: number; height: number }, stickPosition: string): { x: number; y: number; width: number; height: number } {
  if (stickPosition === 'top') {
    const detWidth = Math.floor(g.width * 0.3)
    return { x: g.x + Math.floor((g.width - detWidth) / 2), y: g.y, width: detWidth, height: 1 }
  }
  const h = g.height
  const detHeight = Math.floor(h * 0.3)
  const detY = g.y + Math.floor((h - detHeight) / 2)
  return { x: g.x, y: detY, width: 1, height: detHeight }
}

export function createDetectorWindow(x: number, y: number, _w: number, h: number): void {
  const detBounds = getDetectorBounds({ x, y, width: _w, height: h }, loadSettings().stickPosition)

  detectorWindow = new BrowserWindow({
    x: detBounds.x,
    y: detBounds.y,
    width: detBounds.width,
    height: detBounds.height,
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

  const devDetectorFile = join(__dirname, '../../resources/detector.html')
  const detectorFile = existsSync(devDetectorFile) ? devDetectorFile : join(process.resourcesPath, 'detector.html')
  if (existsSync(detectorFile)) {
    detectorWindow.loadFile(detectorFile)
  }

  detectorWindow.once('ready-to-show', () => {
    detectorWindow?.showInactive()
  })

  detectorWindow.on('close', (e) => {
    if (!runtime.quitting) {
      e.preventDefault()
    }
  })

  detectorWindow.on('closed', () => {
    detectorWindow = null
  })
}
