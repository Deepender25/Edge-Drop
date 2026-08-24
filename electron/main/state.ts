/**
 * Central runtime state & renderer notification hub.
 *
 * Owns the single ItemStore and ClipboardWatcher instances and provides typed
 * helpers to broadcast changes to the renderer. Every mutation goes through
 * here so there's one path that re-pushes the DTO list.
 */
import { ItemStore } from '../store/ItemStore'
import { ClipboardWatcher } from '../clipboard/ClipboardWatcher'
import { loadSettings, saveSettings } from '../store/settings'
import type { ClipboardItemDto, Settings } from '../../shared/types'
import { MAX_STACK } from '../../shared/types'
import { BrowserWindow, powerMonitor } from 'electron'
import { isStagedTempPath } from '../store/paths'
import { prefetchFileIcons } from './drag'
import { runtime } from './config'
import { getMainWindow } from './window'

const store = new ItemStore()
const watcher = new ClipboardWatcher(600)
let pruneTimer: ReturnType<typeof setInterval> | null = null
let wakeTimer: ReturnType<typeof setTimeout> | null = null

function handleSystemSleep(): void {
  watcher.setPaused(true)
}

function handleSystemWake(): void {
  watcher.resyncSignature()
  watcher.setPaused(true)

  if (wakeTimer !== null) clearTimeout(wakeTimer)
  wakeTimer = setTimeout(() => {
    wakeTimer = null
    watcher.resyncSignature()
    watcher.setPaused(loadSettings().incognito)
  }, 1500)
}

/** Initialize persistence + start the clipboard watcher. */
export function initState(): void {
  store.load()

  // One-time v0.2.6 upgrade migration: clear unpinned items once & set default historyLimit to 250
  const currentSettings = loadSettings()
  if (!currentSettings.v026UpgradeCleaned) {
    console.log('[State] Executing one-time v0.2.6 upgrade migration: clearing unpinned items & setting historyLimit to 250...')
    store.clearUnpinned()
    saveSettings({ v026UpgradeCleaned: true, historyLimit: 250 })
  } else if (currentSettings.clearUnpinnedOnRestart) {
    store.clearUnpinned()
  }
  store.pruneExpired(loadSettings().autoDeleteHours)

  for (const item of store.toDto()) {
    if (item.data.kind === 'files' && item.data.paths) {
      prefetchFileIcons(item.data.paths)
    }
  }
  watcher.start((data, png) => {
    if (loadSettings().incognito) return
    store.pruneExpired(loadSettings().autoDeleteHours)
    if (data.kind === 'image' && png && data.imageId) {
      store.stageImageBytes(data.imageId, png)
      png = undefined as any
    }
    if (data.kind === 'files' && data.paths) {
      prefetchFileIcons(data.paths)
    }
    store.add(data, loadSettings().historyLimit)
    pushState.items()
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('ui:copy-flare')
    }
  })
  watcher.setPaused(loadSettings().incognito)

  powerMonitor.removeAllListeners('suspend')
  powerMonitor.removeAllListeners('lock-screen')
  powerMonitor.removeAllListeners('resume')
  powerMonitor.removeAllListeners('unlock-screen')

  powerMonitor.on('suspend', handleSystemSleep)
  powerMonitor.on('lock-screen', handleSystemSleep)
  powerMonitor.on('resume', handleSystemWake)
  powerMonitor.on('unlock-screen', handleSystemWake)

  // After a restart-clear, the watcher.start() seeds lastSig from the live
  // clipboard (correct). But if clearUnpinnedOnRestart removed items that are
  // still on the clipboard, the user can re-copy them immediately — this works
  // because start() always re-seeds lastSig fresh from the current clipboard.
  // No extra invalidate() is needed here.

  if (pruneTimer !== null) clearInterval(pruneTimer)
  pruneTimer = setInterval(() => {
    if (runtime.quitting) return
    if (store.pruneExpired(loadSettings().autoDeleteHours)) {
      // Pruned items should be re-capturable if still on the clipboard.
      watcher.resyncSignature()
      pushState.items()
    }
  }, 60_000)
}

export function stopStateTimers(): void {
  if (pruneTimer !== null) {
    clearInterval(pruneTimer)
    pruneTimer = null
  }
}

export function getStore(): ItemStore {
  return store
}

export function getWatcher(): ClipboardWatcher {
  return watcher
}

/** Push updates to all open windows (main window, onboarding window, etc.). */
function send(channel: string, ...args: unknown[]): void {
  if (runtime.quitting) return
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }
}

export const pushState = {
  items(): void {
    const dto: ClipboardItemDto[] = store.toDto()
    send('state:items', dto)
  },
  settings(next: Settings): void {
    send('state:settings', next)
  },
  togglePanel(open?: boolean): void {
    console.log(`[Main] Sending window:toggle event to renderer with open=${open}`)
    send('window:toggle', open)
  },
  openSettings(): void {
    console.log('[Main] Sending window:open-settings event to renderer')
    send('window:open-settings')
  },
  updateAvailable(info: { version: string }): void {
    console.log('[Main] Sending app:update-available event to renderer:', info)
    send('app:update-available', info)
  },
  updateDownloaded(info: { version: string }): void {
    console.log('[Main] Sending app:update-downloaded event to renderer:', info)
    send('app:update-downloaded', info)
  }
}

/** Re-export for handlers that mutate settings then need to broadcast. */
export { loadSettings, saveSettings }

/**
 * Result of importing dropped files: how many stacks were created and whether
 * any overflow was chunked, so the IPC layer can show an informative toast.
 */
export interface AddFilesResult {
  /** Total number of separate items/stacks created (1 means a single bundle). */
  stacksCreated: number
}

/**
 * Import dropped file paths the same way Explorer Ctrl+C is captured:
 * keep the original paths (and names). Do not copy image bytes into the
 * internal image store — that made drag-out invent a Screenshot filename.
 */
export function addFiles(paths: string[]): AddFilesResult {
  const clean = paths.filter((p) => !isStagedTempPath(p))
  if (clean.length === 0) return { stacksCreated: 0 }

  prefetchFileIcons(clean)

  const limit = loadSettings().historyLimit
  let stacksCreated = 0
  for (let i = 0; i < clean.length; i += MAX_STACK) {
    const chunk = clean.slice(i, i + MAX_STACK)
    store.add({ kind: 'files', paths: chunk }, limit)
    stacksCreated++
  }

  if (stacksCreated > 0) pushState.items()
  return { stacksCreated }
}
