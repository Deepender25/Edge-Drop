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
import { BrowserWindow, screen, shell, powerMonitor, app } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import koffi from 'koffi'
import { APP_CONFIG } from './config'
import { runtime } from './config'
import { PATHS } from '../store/paths'
import { TRANSLATIONS, en } from '../../src/i18n/translations'
import { computeStickBounds } from './geometry'
import { loadSettings, saveSettings } from '../store/settings'
import { isFullscreenAppActive, registerFullscreenActiveListener } from './fullscreen'

type RegisterWindowMessageFn = (lpString: string) => number
type SetWindowLongPtrFn = (hWnd: number | bigint, nIndex: number, dwNewLong: number | bigint) => number | bigint
type GetWindowLongPtrFn = (hWnd: number | bigint, nIndex: number) => number | bigint

let registerWindowMessageFn: RegisterWindowMessageFn | null = null
let setWindowLongPtrFn: SetWindowLongPtrFn | null = null
let getWindowLongPtrFn: GetWindowLongPtrFn | null = null

if (process.platform === 'win32') {
  try {
    const user32 = koffi.load('user32.dll')
    registerWindowMessageFn = user32.func('uint32 RegisterWindowMessageA(const char *lpString)') as RegisterWindowMessageFn
    try {
      setWindowLongPtrFn = user32.func('intptr_t SetWindowLongPtrW(uintptr_t hWnd, int nIndex, intptr_t dwNewLong)') as SetWindowLongPtrFn
    } catch {
      setWindowLongPtrFn = user32.func('intptr_t SetWindowLongW(uintptr_t hWnd, int nIndex, intptr_t dwNewLong)') as SetWindowLongPtrFn
    }
    try {
      getWindowLongPtrFn = user32.func('intptr_t GetWindowLongPtrW(uintptr_t hWnd, int nIndex)') as GetWindowLongPtrFn
    } catch {
      getWindowLongPtrFn = user32.func('intptr_t GetWindowLongW(uintptr_t hWnd, int nIndex)') as GetWindowLongPtrFn
    }
  } catch (err) {
    console.error('[Window] Failed to load user32 functions via koffi:', err)
  }
}

const GWL_EXSTYLE = -20
const WS_EX_NOACTIVATE = 0x08000000

function getHwnd(win: BrowserWindow | null): number | bigint {
  if (!win || win.isDestroyed()) return 0
  const handleBuf = win.getNativeWindowHandle()
  return process.arch === 'x64' ? handleBuf.readBigUInt64LE(0) : handleBuf.readUInt32LE(0)
}

/**
 * Applies Win32 WS_EX_NOACTIVATE style so clicking anywhere on the panel (buttons, cards, empty space)
 * never steals OS window/keyboard focus from the currently active application.
 */
export function applyNoActivateStyle(win: BrowserWindow | null, enable: boolean): void {
  if (process.platform !== 'win32' || !win || win.isDestroyed() || !getWindowLongPtrFn || !setWindowLongPtrFn) return
  try {
    const hwnd = getHwnd(win)
    if (!hwnd) return
    const currentExStyle = Number(getWindowLongPtrFn(hwnd, GWL_EXSTYLE))
    const newExStyle = enable
      ? (currentExStyle | WS_EX_NOACTIVATE)
      : (currentExStyle & ~WS_EX_NOACTIVATE)
    if (newExStyle !== currentExStyle) {
      setWindowLongPtrFn(hwnd, GWL_EXSTYLE, newExStyle)
    }
  } catch (err) {
    console.error('[Window] Failed to apply WS_EX_NOACTIVATE:', err)
  }
}

const onTaskbarCreatedListeners: Array<() => void> = []
export function registerTaskbarCreatedListener(fn: () => void): void {
  onTaskbarCreatedListeners.push(fn)
}

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

let staleIdConsecutiveCount = 0
let cachedWorkArea = { x: 0, y: 0, width: 1920, height: 1080 }

export function updateCachedWorkArea(): void {
  try {
    const all = screen.getAllDisplays()
    const stick = all.find(d => d.id === currentStickDisplayId) || screen.getPrimaryDisplay()
    if (stick && stick.workArea) {
      cachedWorkArea = stick.workArea
    }
  } catch {}
}

export function setHotZoneWidth(width: number): void {
  currentHotZoneWidth = width
}

export function setStickDisplayId(id: number | undefined): void {
  currentStickDisplayId = id
  updateCachedWorkArea()
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/** Send only while the panel has a live, settled renderer frame. */
export function sendToMainWindow(channel: string, ...args: unknown[]): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  const contents = mainWindow.webContents
  if (contents.isDestroyed() || contents.isLoadingMainFrame()) return false
  try {
    contents.send(channel, ...args)
    return true
  } catch {
    // A frame can be disposed between the checks above and send(). Renderer
    // hydration obtains the current state once its replacement frame is ready.
    return false
  }
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
    mainWindow.setSkipTaskbar(true)
    applyNoActivateStyle(mainWindow, true)
  } else {
    // Panel is closed: full click-through, no forwarding needed.
    mainWindow.setIgnoreMouseEvents(true, { forward: false })
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
    mainWindow.setSkipTaskbar(true)
    applyNoActivateStyle(mainWindow, true)

    // Trigger gentle idle memory cleanup 1.5s after panel closes to reclaim RAM
    if (global.gc) {
      setTimeout(() => {
        if (!interactive && global.gc) {
          try { global.gc() } catch { /* ignore */ }
        }
      }, 1500)
    }
  }
}

export function setPreviewMode(active: boolean): void {
  if (previewActive === active) return
  previewActive = active
  repositionWindow()
}

/**
 * Adaptive cursor poll — two-speed design to minimise battery drain.
 *
 * Problem: a fixed 16ms setInterval fires 60× per second, permanently
 * preventing Intel Core Ultra CPUs from entering deep C-states (C6/C7/C8)
 * that save 2–3W each. During idle browsing (panel closed, cursor far from
 * edge) there is zero useful work being done at 60Hz.
 *
 * Solution: run at SLOW speed (150ms on battery, 80ms on AC) when the panel
 * is closed and the cursor is not within PROXIMITY_PX of the edge. Switch to
 * FAST speed (16ms) the moment the cursor approaches within PROXIMITY_PX.
 * Switch back to SLOW after SLOW_COOLDOWN_MS of no edge-proximity.
 *
 * This reduces timer wake-ups by 5–10× during idle browsing while keeping
 * panel open/close responsiveness completely unchanged (human reaction time
 * is ~150ms, so a SLOW tick of 150ms is imperceptible).
 */

/** Proximity threshold for entering fast-poll mode (px from the edge). */
const FAST_POLL_PROXIMITY_PX = 450
/** Full-speed poll when edge is near. */
const POLL_FAST_MS = 16
/** Battery-power slow poll (panel closed, cursor far). */
const POLL_SLOW_BATTERY_MS = 100
/** AC-power slow poll (panel closed, cursor far). */
const POLL_SLOW_AC_MS = 75
/** After leaving proximity, stay in fast mode for this long before throttling. */
const SLOW_COOLDOWN_MS = 1500

let cursorPollTimer: ReturnType<typeof setInterval> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let lastEdgeState = false
let heartbeatPaused = false

/** Whether the poll is currently running in fast (16ms) mode. */
let _pollFast = false
/** Timestamp of when the cursor last left the proximity zone. */
let _lastProximityExitMs = 0
/** Last sent cursor position — used to suppress duplicate IPC messages. */
let _lastSentX = -9999
let _lastSentY = -9999

/**
 * Temporarily suspend the always-on-top heartbeat.
 *
 * The heartbeat calls setAlwaysOnTop() every 2 000 ms, which reasserts z-order
 * via SetWindowPos(HWND_TOPMOST) on Windows.  During a native drag the OS
 * renders the drag-ghost image using the DWM compositor at a layer that sits
 * BELOW HWND_TOPMOST windows.  Every heartbeat tick therefore pushes our
 * window in front of the ghost, making it disappear during any drag.
 *
 * Pausing the heartbeat for the duration of the drag keeps the window at its
 * current z-position and lets the DWM ghost stay visible for the full drag.
 * The heartbeat is re-enabled (and immediately re-asserts always-on-top) when
 * the drag ends.
 */
export function setHeartbeatPaused(paused: boolean): void {
  heartbeatPaused = paused
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    if (paused) {
      // Temporarily lower window z-band from 'screen-saver' to 'normal' during active drag
      // so the Windows DWM drag-ghost image renders ON TOP of our window.
      mainWindow.setAlwaysOnTop(true, 'normal')
    } else {
      // Re-assert z-order immediately when drag ends so the window snaps back
      // to the correct level without waiting for the next heartbeat tick.
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
    }
  }
}

/** Restart the poll timer at the given interval. Clears any existing timer. */
function _restartPollTimer(intervalMs: number): void {
  if (cursorPollTimer !== null) {
    clearInterval(cursorPollTimer)
  }
  cursorPollTimer = setInterval(_pollTick, intervalMs)
}

/** Single cursor poll tick — shared by both fast and slow modes. */
function _pollTick(): void {
  if (runtime.quitting || !mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return

  const settings = loadSettings()
  if (settings.suppressInFullscreen && isFullscreenAppActive()) return

  const pt = screen.getCursorScreenPoint()

  if (cachedWorkArea.width === 1920 && cachedWorkArea.height === 1080) {
    updateCachedWorkArea()
  }
  const wa = cachedWorkArea

  // Translate screen coords → stick display client coords.
  const clientX = pt.x - wa.x
  const clientY = pt.y - wa.y

  // Guard against garbage values that Windows occasionally sends.
  if (clientX < -5000 || clientX > 15000 || clientY < -5000 || clientY > 15000) return

  // ── Adaptive speed: switch to fast poll when cursor approaches the edge ──
  const distFromEdge = settings.stickPosition === 'right'
    ? wa.width - clientX   // distance from right edge
    : clientX              // distance from left edge
  const nearProximity = distFromEdge <= FAST_POLL_PROXIMITY_PX

  if (nearProximity || interactive) {
    _lastProximityExitMs = 0  // reset cooldown
    if (!_pollFast) {
      _pollFast = true
      _restartPollTimer(POLL_FAST_MS)
    }
  } else {
    // Cursor is far from edge and panel is closed.
    if (_pollFast) {
      if (_lastProximityExitMs === 0) {
        _lastProximityExitMs = Date.now()
      }
      // Wait for the cooldown before throttling back.
      if (Date.now() - _lastProximityExitMs >= SLOW_COOLDOWN_MS) {
        _pollFast = false
        _lastProximityExitMs = 0
        const slowMs = powerMonitor.isOnBatteryPower() ? POLL_SLOW_BATTERY_MS : POLL_SLOW_AC_MS
        _restartPollTimer(slowMs)
        return
      }
    }
  }

  let inEdge = false
  switch (settings.stickPosition) {
    case 'left':
      inEdge = clientX >= -30 && clientX <= currentHotZoneWidth
      break
    case 'right': {
      const d = wa.width - clientX
      inEdge = d >= -30 && d <= currentHotZoneWidth
      break
    }
  }

  const newState = inEdge

  // ── Fix 5: IPC gating — suppress redundant messages ──────────────────────
  // Previously every poll tick within 450px of the edge sent a full IPC message
  // to the renderer, even when the cursor hadn't moved. This flooded the IPC
  // channel at 60Hz during all active browsing.
  //
  // Now we only send when:
  //   a) Edge crossing state changes (inEdge flip) — always send immediately.
  //   b) Panel is open (interactive) — send on every fast tick so the renderer
  //      can track cursor position for the close-panel logic.
  //   c) Cursor moved >= IPC_MIN_DELTA_PX since last send — avoids spamming
  //      the renderer when the cursor is stationary near the edge.
  const IPC_MIN_DELTA_PX = 3
  const nearEdge = settings.stickPosition === 'right'
    ? (wa.width - clientX) <= 450
    : clientX <= 450

  const positionChangedEnough =
    Math.abs(clientX - _lastSentX) >= IPC_MIN_DELTA_PX ||
    Math.abs(clientY - _lastSentY) >= IPC_MIN_DELTA_PX

  const shouldSend = newState !== lastEdgeState || interactive || (nearEdge && positionChangedEnough)

  if (shouldSend) {
    lastEdgeState = newState
    _lastSentX = clientX
    _lastSentY = clientY
    sendToMainWindow('window:cursor-edge', {
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

export function startCursorPoll(): void {
  if (cursorPollTimer !== null) return
  // Start in slow mode; will accelerate when cursor approaches the edge.
  const slowMs = powerMonitor.isOnBatteryPower() ? POLL_SLOW_BATTERY_MS : POLL_SLOW_AC_MS
  _pollFast = false
  cursorPollTimer = setInterval(_pollTick, slowMs)
}

export function stopCursorPoll(): void {
  if (cursorPollTimer !== null) {
    clearInterval(cursorPollTimer)
    cursorPollTimer = null
  }
}

function getStickGeometry(): { x: number; y: number; width: number; height: number } {
  let settings = loadSettings()
  const primaryDisplay = screen.getPrimaryDisplay()
  const allDisplays = screen.getAllDisplays().map(d => ({
    id: d.id,
    workArea: { ...d.workArea },
    scaleFactor: d.scaleFactor,
    isPrimary: d.id === primaryDisplay.id
  }))

  const currentWindowWidth = previewActive ? 820 : PANEL_WIDTH

  const result = computeStickBounds({
    position: settings.stickPosition,
    displays: allDisplays,
    displayId: settings.stickDisplayId,
    savedWorkArea: settings.stickDisplayWorkArea,
    savedScaleFactor: settings.stickDisplayScaleFactor,
    windowWidth: currentWindowWidth,
    windowHeight: primaryDisplay.workArea.height, // initial hint; result uses resolvedDisplay.workArea.height
    currentBounds: getMainWindow()?.getBounds()
  })

  const resolved = result.resolvedDisplay

  // ── Self-heal: persist fresh geometry whenever the resolved display differs ──
  // This covers two scenarios:
  //   A) Cross-reboot: OS re-assigned a new numeric ID to the same physical monitor.
  //      We matched via Tier-2 fuzzy bounds — now save the new ID so future same-
  //      session lookups hit Tier-1 instantly.
  //   B) Display disconnected: Tier-4 fell back to primary — clear stale persisted
  //      display so the app stays fully usable and the UI shows primary as active.
  const idChanged = settings.stickDisplayId !== undefined && settings.stickDisplayId !== resolved.id
  const idWasStale = settings.stickDisplayId !== undefined && !allDisplays.some(d => d.id === settings.stickDisplayId)

  if (idWasStale) {
    // Fix 3: Consecutive-stale-reads guard.
    //
    // When a TV mirror is active, Windows briefly removes and re-adds display IDs
    // during EDID renegotiation. This makes idWasStale=true for a single call even
    // though the user's chosen monitor is still physically connected.
    //
    // Before this fix: the very first stale read immediately wrote stickDisplayId=undefined
    // to disk, permanently wiping the user's monitor choice.
    //
    // After this fix: we require the ID to be absent in 2 CONSECUTIVE calls before
    // treating it as genuinely gone. With the 600ms debounce on display events, two
    // consecutive stale reads means the display has been absent for >600ms — a real
    // disconnection, not a transient OS reconfiguration.
    staleIdConsecutiveCount++
    const STALE_THRESHOLD = 2
    if (staleIdConsecutiveCount < STALE_THRESHOLD) {
      console.log(`[Main] Display ${settings.stickDisplayId} temporarily absent (count=${staleIdConsecutiveCount}/${STALE_THRESHOLD}) — holding preference, will re-evaluate.`)
      // Don't wipe settings yet — just reposition using what was resolved (likely Tier-2 or Tier-4)
    } else {
      staleIdConsecutiveCount = 0
      // The old ID no longer exists in this session (disconnected or reboot rename).
      // Check whether we recovered via Tier-2 or fell all the way to primary.
      const recoveredViaBounds = settings.stickDisplayWorkArea !== undefined && resolved.id !== primaryDisplay.id
      if (recoveredViaBounds) {
        console.log(`[Main] Display ${settings.stickDisplayId} re-matched via geometry to display ${resolved.id} — updating persisted ID.`)
      } else {
        console.log(`[Main] Display ${settings.stickDisplayId} disconnected or unrecognised after ${STALE_THRESHOLD} checks. Falling back to display ${resolved.id}.`)
      }
      settings = saveSettings({
        stickDisplayId: recoveredViaBounds ? resolved.id : undefined,
        stickDisplayWorkArea: recoveredViaBounds ? resolved.workArea : undefined,
        stickDisplayScaleFactor: recoveredViaBounds ? resolved.scaleFactor : undefined
      })
      sendToMainWindow('state:settings', settings)
      if (!recoveredViaBounds) {
        // Genuinely fell back — briefly show panel on new location.
        popUpAndRetract(1500)
      }
    }
  } else {
    // Reset counter: the saved ID was found this call — monitor is present.
    staleIdConsecutiveCount = 0

    if (idChanged) {
      // Shouldn't happen if Tier-1 matched, but guard it anyway.
      settings = saveSettings({
        stickDisplayId: resolved.id,
        stickDisplayWorkArea: resolved.workArea,
        stickDisplayScaleFactor: resolved.scaleFactor
      })
      sendToMainWindow('state:settings', settings)
    } else if (settings.stickDisplayId !== undefined && (
      settings.stickDisplayWorkArea === undefined ||
      settings.stickDisplayScaleFactor === undefined
    )) {
      // Upgrade: user had a stickDisplayId saved before this feature was added;
      // backfill geometry silently so the next reboot can fuzzy-match.
      saveSettings({
        stickDisplayWorkArea: resolved.workArea,
        stickDisplayScaleFactor: resolved.scaleFactor
      })
    }
  }

  currentStickDisplayId = resolved.id
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

  // Apply WS_EX_NOACTIVATE so clicking the panel never steals OS focus from the active application.
  applyNoActivateStyle(mainWindow, true)

  // Listen for Windows Explorer restart/crash to purge ghost taskbar icons and restore tray.
  if (process.platform === 'win32' && registerWindowMessageFn) {
    try {
      const taskbarCreatedMsg = registerWindowMessageFn('TaskbarCreated')
      if (taskbarCreatedMsg > 0) {
        mainWindow.hookWindowMessage(taskbarCreatedMsg, () => {
          console.log('[Main] TaskbarCreated message received from Windows Explorer — refreshing taskbar state & tray')
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setSkipTaskbar(true)
            mainWindow.setAlwaysOnTop(true, 'screen-saver')
          }
          for (const listener of onTaskbarCreatedListeners) {
            try { listener() } catch (err) { console.error('[Main] Error in onTaskbarCreated listener:', err) }
          }
        })
      }
    } catch (err) {
      console.error('[Main] Failed to hook TaskbarCreated window message:', err)
    }
  }

  registerFullscreenActiveListener(() => {
    const settings = loadSettings()
    if (settings.suppressInFullscreen && (settings.hoverActivation ?? true)) {
      sendToMainWindow('window:toggle', false)
      setInteractive(false)
    }
  })

  const handleDisplayChange = (triggerPopUp = false) => {
    updateCachedWorkArea()
    console.log('[Main] Display metrics/topology changed — validating bounds and repositioning window')
    repositionWindow()
    if (triggerPopUp) {
      popUpAndRetract(1500)
    }
  }

  // Fix 2: Debounce display-metrics-changed.
  //
  // When a TV is in mirror mode, Windows can fire this event 5–20 times in rapid
  // succession each time the TV turns on/off, wakes, or renegotiates EDID.
  // Without debouncing, each of those 20 calls hits repositionWindow() while the
  // display list is in a transitional state, potentially resolving to the wrong
  // display at intermediate frames.
  //
  // 600ms is enough for Windows DWM to finish all its display-topology bookkeeping
  // after a single physical event, while being fast enough to feel instantaneous.
  let displayChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null
  const handleDisplayChangeDebounced = (triggerPopUp = false) => {
    if (displayChangeDebounceTimer !== null) {
      clearTimeout(displayChangeDebounceTimer)
    }
    displayChangeDebounceTimer = setTimeout(() => {
      displayChangeDebounceTimer = null
      handleDisplayChange(triggerPopUp)
    }, 600)
  }

  // Keep the panel glued to the primary display if the work area changes.
  screen.on('display-metrics-changed', () => handleDisplayChangeDebounced(false))
  screen.on('display-added', () => {
    handleDisplayChangeDebounced(true)
  })
  screen.on('display-removed', () => {
    handleDisplayChangeDebounced(true)
  })

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
    applyNoActivateStyle(mainWindow, true)
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
  // floating windows behind them. Re-asserting 'screen-saver' level periodically
  // ensures the panel re-appears when the user exits fullscreen.
  //
  // Power fix: interval increased from 500ms to 2000ms.
  // The old 500ms interval called SetWindowPos(HWND_TOPMOST) 120 times/min,
  // even when nothing was happening. 2000ms reduces this to 30 times/min with
  // no perceptible difference — the panel reappears within 2s of a fullscreen
  // app losing focus, which is already faster than the user notices.
  if (heartbeatTimer !== null) clearInterval(heartbeatTimer)
  heartbeatTimer = setInterval(() => {
    if (runtime.quitting || heartbeatPaused || interactive) return
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
    }
  }, 2000)

  return mainWindow
}

export function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

let onWindowRepositioned: (() => void) | null = null
export function registerWindowRepositionListener(fn: () => void): void {
  onWindowRepositioned = fn
}

export function getActiveDisplayId(allDisplays?: Electron.Display[]): number {
  const displays = allDisplays ?? screen.getAllDisplays()
  const settings = loadSettings()
  const primary = screen.getPrimaryDisplay()

  // Tier 1: exact session-local ID match.
  if (settings.stickDisplayId !== undefined && displays.some(d => d.id === settings.stickDisplayId)) {
    return settings.stickDisplayId
  }

  // Tier 2: fuzzy workArea match (cross-reboot).
  if (settings.stickDisplayWorkArea !== undefined) {
    const TOLERANCE = 8
    const sa = settings.stickDisplayWorkArea
    const candidates = displays.filter(d =>
      Math.abs(d.workArea.x - sa.x) <= TOLERANCE &&
      Math.abs(d.workArea.y - sa.y) <= TOLERANCE &&
      Math.abs(d.workArea.width - sa.width) <= TOLERANCE &&
      Math.abs(d.workArea.height - sa.height) <= TOLERANCE
    )
    if (candidates.length === 1) return candidates[0].id
    if (candidates.length > 1 && settings.stickDisplayScaleFactor !== undefined) {
      const byScale = candidates.find(d => d.scaleFactor === settings.stickDisplayScaleFactor)
      if (byScale) return byScale.id
      return candidates[0].id
    }
    if (candidates.length > 1) return candidates[0].id
  }

  // Tier 3: in-memory ID set this session by getStickGeometry.
  if (currentStickDisplayId !== undefined && displays.some(d => d.id === currentStickDisplayId)) {
    return currentStickDisplayId
  }

  // Tier 4: primary fallback.
  return primary.id
}

export function getDisplayListOptions(): Array<{
  id: number
  bounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  isPrimary: boolean
  isCurrent: boolean
  label: string
  name: string
  resolution: string
}> {
  const all = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const activeId = getActiveDisplayId(all)

  const settings = loadSettings()
  let langCode = settings.language || 'system'
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
  const primaryText = dict?.position?.primaryDisplay || en.position.primaryDisplay

  return all.map((d, index) => {
    const isPrimary = d.id === primary.id
    const rawName = (d as any).label || (d as any).name || ''
    const fallbackName = isPrimary ? primaryText : `Display ${index + 1}`
    const baseName = rawName.trim() ? rawName.trim() : fallbackName
    const name = isPrimary
      ? (baseName.toLowerCase().includes('primary') || baseName === primaryText ? baseName : `${baseName} (${primaryText})`)
      : baseName
    const scale = d.scaleFactor || 1
    const physW = Math.round(d.bounds.width * scale)
    const physH = Math.round(d.bounds.height * scale)
    const resolution = `${physW}×${physH}`
    return {
      id: d.id,
      bounds: { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height },
      workArea: { x: d.workArea.x, y: d.workArea.y, width: d.workArea.width, height: d.workArea.height },
      scaleFactor: scale,
      isPrimary,
      isCurrent: d.id === activeId,
      label: `${name} ${resolution}`,
      name,
      resolution
    }
  })
}

let popUpTimer: ReturnType<typeof setTimeout> | null = null
export function popUpAndRetract(durationMs = 1500): void {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents || mainWindow.webContents.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.showInactive()
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setSkipTaskbar(true)

  const wasAlreadyOpen = interactive
  console.log(`[Main] Popping up panel briefly to confirm new screen/edge location (wasAlreadyOpen=${wasAlreadyOpen})`)
  sendToMainWindow('window:toggle', true)

  if (popUpTimer !== null) clearTimeout(popUpTimer)
  if (!wasAlreadyOpen) {
    popUpTimer = setTimeout(() => {
      popUpTimer = null
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log('[Main] Retracting panel after brief confirmation pop-up')
        sendToMainWindow('window:toggle', false)
      }
    }, durationMs)
  }
}

export function repositionWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.showInactive()
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setSkipTaskbar(true)
  const g = getStickGeometry()
  mainWindow.setBounds({ ...g })
  onWindowRepositioned?.()
}

/** Toggle the panel between shown (always on top) and fully hidden. */
export function setVisible(visible: boolean): void {
  if (!mainWindow) return
  if (visible) {
    mainWindow.showInactive()
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
    mainWindow.setSkipTaskbar(true)
  } else {
    mainWindow.hide()
  }
}

export function setWindowFocusable(focusable: boolean): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      applyNoActivateStyle(mainWindow, !focusable)
      mainWindow.setFocusable(focusable)
      if (focusable) {
        mainWindow.focus()
      }
    } catch {}
  }
}

export function focusMainWindow(): void {
  setWindowFocusable(true)
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
