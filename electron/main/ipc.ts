/**
 * IPC handler registration.
 *
 * Each `ipcMain.handle` here mirrors a contract in `shared/ipc.ts`. The
 * renderer calls them through the typed preload bridge, so a signature mismatch
 * is a compile-time error rather than a runtime one.
 */
import { app, ipcMain, clipboard, nativeImage, shell, net } from 'electron'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { psHost, getSystemPowerShellPath, getWritableCwd } from './powershell'
import { filterValidPaths, isExistingFilePath } from './pathValidation'
import { type InvokeMap, type InvokeChannel, type SendMap, type SendChannel } from '../../shared/ipc'
import { getStore, loadSettings, saveSettings, pushState, addFiles, getWatcher } from './state'
import { sendToMainWindow, setInteractive, setHeartbeatPaused, setHotZoneWidth, repositionWindow, getDisplayListOptions, popUpAndRetract, setWindowFocusable } from './window'
import { registerGlobalHotkey } from './index'
import { getOnboardingWindow } from './onboardingWindow'
import { rebuildTrayMenu } from './tray'
import { startDragOut, resolveDragData, prestageDrag, stageDragFile } from './drag'
import { clipboardSignature, formatTabularDataForClipboard } from '../clipboard/formats'
import type { ItemData, MergeResult } from '../../shared/types'
import { quitAndInstallUpdate, checkForUpdatesManual, startUpdateDownload, syncAutoUpdaterState } from './updater'
import { createId } from '../store/ids'
import { isStoreBuild } from './config'
import { applyLaunchAtLogin, refreshLaunchAtLoginFromOs } from './loginItems'
import { toUnpackagedFilePath, toUnpackagedFilePaths } from '../store/paths'

export { isStoreBuild }

/**
 * Returns true if the current system clipboard content matches the given item data.
 *
 * Used before delete to decide whether to clear the system clipboard. Clearing
 * is only done when the deleted item IS the thing currently on the clipboard;
 * deleting an old history entry that the user has since replaced must never
 * wipe their current clipboard contents.
 */
function clipboardMatchesItem(data: ItemData): boolean {
  const sig = clipboardSignature()
  if (data.kind === 'text') return sig === `text:${data.text}`
  if (data.kind === 'files') return sig === `files:${data.paths.join('\n')}`
  if (data.kind === 'image') {
    // sig format: "image:<W>x<H>:<hash>" — check the dimension prefix to avoid a full pixel read.
    // If another image with the same dimensions is on the clipboard, we over-clear, which is
    // acceptable (user loses clipboard content they were about to paste from a deleted item anyway).
    return sig.startsWith(`image:${data.width}x${data.height}:`)
  }
  // image-collection: clear if any image is on the clipboard (conservative but safe)
  if (data.kind === 'image-collection') return sig.startsWith('image:')
  return false
}

/** Fire a transient toast to the renderer (best-effort; renderer may be closed). */
function toast(message: string, tone: 'info' | 'error' = 'info'): void {
  sendToMainWindow('ui:toast', { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, message, tone })
}

/** Simulate pressing Ctrl+V via PowerShell after returning focus to the previous active window. */
function simulatePaste(): void {
  if (process.platform === 'win32') {
    // Run via the persistent powershell host for near-zero latency (no process spawn overhead)
    psHost.run("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')", 2000)
      .catch((err) => {
        console.error('[Main] simulatePaste psHost failed, using fallback:', err)
        // Fallback to spawning powershell process via absolute system path
        execFile(getSystemPowerShellPath(), [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"
        ], { windowsHide: true, ...(isStoreBuild() ? { cwd: getWritableCwd() } : {}) }, (fallbackErr) => {
          if (fallbackErr) console.error('[Main] simulatePaste fallback error:', fallbackErr)
        })
      })
  }
}

/**
 * Write file *references* onto the system clipboard so that paste in Explorer,
 * Word, Slack, and every other shell-aware app copies the actual files.
 *
 * WHY POWERSHELL: Electron's clipboard API calls EmptyClipboard() on every
 * write. Sequential calls (writeBuffer then writeText) leave only the LAST
 * format — which was always the plain path string, making every paste land as
 * text. PowerShell's Clipboard.SetFileDropList writes CF_HDROP + FileNameW +
 * Shell IDList Array + all other shell formats in a single atomic transaction.
 * Paths are base64-encoded so any character (spaces, quotes, Unicode) is safe.
 */
async function writeFileListToClipboard(rawPaths: string[]): Promise<void> {
  const validPaths = toUnpackagedFilePaths(filterValidPaths(rawPaths))
  if (process.platform === 'win32' && validPaths.length > 0) {
    try {
      const addLines = validPaths
        .map(p => `$c.Add([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(p, 'utf8').toString('base64')}')))|Out-Null`)
        .join(';')
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$c=New-Object System.Collections.Specialized.StringCollection',
        addLines,
        '[Windows.Forms.Clipboard]::SetFileDropList($c)'
      ].join(';')
      await psHost.run(script, 3000)
      return
    } catch (err) {
      console.error('[ipc] writeFileListToClipboard PowerShell failed, using text fallback:', err)
    }
  }
  // Non-Windows fallback: plain text paths (best-effort)
  if (validPaths.length > 0) {
    clipboard.clear()
    clipboard.writeText(validPaths.join('\r\n'))
  }
}

/** Bitmap for apps that read CF_DIB, plus a named file so Explorer paste keeps our filename. */
async function writeImageWithNamedFile(imagePath: string, namedPath: string): Promise<boolean> {
  if (process.platform !== 'win32') return false
  try {
    const b64Img = Buffer.from(imagePath, 'utf8').toString('base64')
    const b64File = Buffer.from(namedPath, 'utf8').toString('base64')
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName System.Drawing',
      `$img=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64Img}'))`,
      `$fp=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64File}'))`,
      '$bmp=[Drawing.Image]::FromFile($img)',
      '$d=New-Object Windows.Forms.DataObject',
      '$d.SetImage($bmp)',
      '$c=New-Object System.Collections.Specialized.StringCollection',
      '$c.Add($fp)|Out-Null',
      '$d.SetFileDropList($c)',
      '[Windows.Forms.Clipboard]::SetDataObject($d,$true)',
      '$bmp.Dispose()'
    ].join(';')
    await psHost.run(script, 3000)
    return true
  } catch (err) {
    console.error('[ipc] writeImageWithNamedFile failed:', err)
    return false
  }
}

export async function writeImageToClipboard(imagePath: string | null, previewDataUrl?: string): Promise<void> {
  // If we have the full image path on disk, load the nativeImage directly from path
  if (imagePath && existsSync(imagePath)) {
    try {
      const img = nativeImage.createFromPath(imagePath)
      if (!img.isEmpty()) {
        clipboard.clear()
        clipboard.writeImage(img)
        return
      }
    } catch (err) {
      console.error('[ipc] writeImageToClipboard nativeImage.createFromPath failed:', err)
    }
  }

  // Fallback if imagePath was missing but previewDataUrl exists
  if (previewDataUrl) {
    try {
      const img = nativeImage.createFromDataURL(previewDataUrl)
      if (!img.isEmpty()) {
        clipboard.clear()
        clipboard.writeImage(img)
        return
      }
    } catch { /* ignore */ }
  }
}

/**
 * Type-checked registration helper: guarantees the handler's return matches the
 * contract declared in InvokeMap.
 */
function handle<C extends InvokeChannel>(
  channel: C,
  fn: (...args: InvokeMap[C]['args']) => Promise<InvokeMap[C]['result']> | InvokeMap[C]['result']
): void {
  ipcMain.handle(channel, (_e, ...args) => fn(...(args as InvokeMap[C]['args'])))
}

/** Apply launch-at-login to the OS and return the state Windows actually kept. */
export async function syncLoginItemSettings(launchAtLogin?: boolean): Promise<void> {
  const wantLaunch = launchAtLogin ?? loadSettings().launchAtLogin
  const result = await applyLaunchAtLogin(wantLaunch)
  if (!result.ok) {
    console.error('[IPC] launch-at-login apply did not stick. wanted=', wantLaunch, 'result=', result)
  }
}

export function registerIpc(): void {
  handle('state:load', () => {
    return {
      items: getStore().toDto(),
      settings: loadSettings(),
      version: app.getVersion(),
      isStoreBuild: isStoreBuild()
    }
  })

  handle('app:install-update', () => {
    if (isStoreBuild()) return
    console.log('[IPC] app:install-update requested by renderer — calling quitAndInstallUpdate')
    quitAndInstallUpdate()
  })

  handle('updater:check-manual', async () => {
    if (isStoreBuild()) return { status: 'up-to-date', version: app.getVersion() }
    return checkForUpdatesManual()
  })

  handle('updater:start-download', async () => {
    if (isStoreBuild()) return
    await startUpdateDownload()
  })

  handle('app:quit', () => {
    console.log('[IPC] app:quit requested by renderer — quitting application')
    app.quit()
  })

  handle('app:get-releases', async () => {
    if (_releasesCache) {
      // Re-validate in background asynchronously without blocking UI render
      fetchAndCacheReleases().catch(() => {})
      return _releasesCache
    }
    return fetchAndCacheReleases()
  })

  handle('file:reveal', (filePath) => {
    if (isExistingFilePath(filePath)) {
      try {
        shell.showItemInFolder(filePath)
        return true
      } catch (err) {
        console.error('[IPC] file:reveal failed:', err)
      }
    }
    return false
  })

  handle('item:set-pinned', (id, pinned) => {
    getStore().setPinned(id, pinned)
    return getStore().toDto()
  })

  handle('item:delete', (id) => {
    const item = getStore().get(id)
    getStore().delete(id)
    // If the deleted item is still on the system clipboard, clear the clipboard.
    // This is the fix for the copy→delete→copy cycle bug:
    //   Without this, resyncSignature() would lock lastSig to the current
    //   clipboard state. When the user immediately re-copies the same image the
    //   clipboard never changes, so the watcher never fires and the item stays
    //   invisible. Clearing makes the clipboard transition to 'empty', so the
    //   next re-copy IS a detectable change.
    if (item && clipboardMatchesItem(item.data)) {
      clipboard.clear()
    }
    getWatcher().resyncSignature()
    pushState.items()
    return getStore().toDto()
  })

  handle('item:delete-batch', (ids) => {
    if (!ids || ids.length === 0) return getStore().toDto()
    const items = ids.map((id) => getStore().get(id)).filter(Boolean)
    getStore().deleteBatch(ids)
    if (items.some((item) => item && clipboardMatchesItem(item.data))) {
      clipboard.clear()
    }
    getWatcher().resyncSignature()
    pushState.items()
    return getStore().toDto()
  })

  handle('item:clear', () => {
    getStore().clearUnpinned()
    // Clear the system clipboard unconditionally: the user wiped their history,
    // so whatever is on the clipboard should not zombie-reappear, and clearing
    // ensures any subsequent re-copy of the same content is detectable.
    clipboard.clear()
    getWatcher().resyncSignature()
    pushState.items()
    return getStore().toDto()
  })

  handle('item:get-full-text', (id) => {
    return getStore().getFullText(id)
  })

  handle('item:copy', async (id) => {
    const item = getStore().get(id)
    console.log('[IPC] item:copy id=', id, 'found=', !!item)
    if (!item) return false

    const watcher = getWatcher()
    watcher.setPaused(true)
    const fullText = item.data.kind === 'text' ? getStore().getFullText(id) : undefined
    const itemDataWithFullText = item.data.kind === 'text' && fullText ? { ...item.data, text: fullText } : item.data
    await writeItemToClipboard(itemDataWithFullText)
    console.log('[IPC] item:copy wrote to clipboard, kind=', item.data.kind)

    // Promote the copied item to the top of the history stack
    getStore().add(itemDataWithFullText, loadSettings().historyLimit)
    pushState.items()

    // Unpause after a short delay to allow OS clipboard event to settle.
    // Respect the current incognito state when unpausing.
    setTimeout(() => {
      watcher.setPaused(loadSettings().incognito)
    }, 200)

    return true
  })

  handle('item:copy-subitem', async (req) => {
    // Resolve a single sub-item (one file of a bundle, or one image of a
    // collection) and write just that onto the clipboard — not the whole item.
    const dto = getStore().toDto().find((d) => d.id === req.id)
    if (!dto) return false

    let wrote = false
    if (dto.data.kind === 'files' && req.paths && req.paths.length > 0) {
      // Write real file references so pasting into Explorer copies the file,
      // not a path string.
      await writeFileListToClipboard(req.paths)
      wrote = true
    } else if (dto.data.kind === 'image-collection' && req.imageId) {
      const img = dto.data.images.find((i) => i.imageId === req.imageId)
      if (img) {
        // Single image from a collection: write full bitmap + file reference atomically.
        const src = getStore().getImagePath(img.imageId, img.ext)
        const preview = img.preview ?? ''
        await writeImageToClipboard(src && existsSync(src) ? src : null, preview)
        wrote = true
      }
    }

    if (!wrote) return false

    // Promote the parent item to the top of the history stack
    const parentItem = getStore().get(req.id)
    if (parentItem) {
      getStore().add(parentItem.data, loadSettings().historyLimit)
      pushState.items()
    }

    const watcher = getWatcher()
    watcher.setPaused(true)
    setTimeout(() => {
      watcher.setPaused(loadSettings().incognito)
    }, 200)

    return true
  })

  // ---------------------------------------------------------------------------
  // Paste guard — prevents double-paste from rapid/double clicks.
  // Stored at module scope so it's authoritative across all renderer invocations.
  // The renderer-side tryPaste() is a best-effort pre-filter; this is the hard gate.
  // ---------------------------------------------------------------------------
  let _lastPasteTime = 0
  const PASTE_GUARD_MS = 600

  handle('item:paste', async (id) => {
    const now = Date.now()
    if (now - _lastPasteTime < PASTE_GUARD_MS) {
      console.log('[IPC] item:paste blocked — too soon after last paste')
      return false
    }
    _lastPasteTime = now

    const item = getStore().get(id)
    console.log('[IPC] item:paste id=', id, 'found=', !!item)
    if (!item) return false

    const watcher = getWatcher()
    watcher.setPaused(true)

    try {
      // 1. Close panel immediately so Edge-Drop slides shut with 0ms UI lag
      pushState.togglePanel(false)

      // 2. Write item to system clipboard
      const fullText = item.data.kind === 'text' ? getStore().getFullText(id) : undefined
      const itemDataWithFullText = item.data.kind === 'text' && fullText ? { ...item.data, text: fullText } : item.data
      await writeItemToClipboard(itemDataWithFullText)
      console.log('[IPC] item:paste wrote to clipboard, kind=', item.data.kind)

      // 3. Touch item timestamp if enabled
      const settings = loadSettings()
      if (settings.movePastedToTop !== false) {
        getStore().touch(id)
      }

      // 4. Simulate Ctrl+V after 50ms
      setTimeout(() => {
        simulatePaste()
      }, 50)

      // 5. Broadcast updated items list after panel has fully closed off-screen (250ms)
      if (settings.movePastedToTop !== false) {
        setTimeout(() => {
          pushState.items()
        }, 250)
      }
    } finally {
      // Resync the watcher signature after paste so standard OS Ctrl+V does NOT
      // increment item hitCounts or re-order items.
      setTimeout(() => {
        watcher.resyncSignature()
        watcher.setPaused(loadSettings().incognito)
      }, 350)
    }

    return true
  })

  handle('item:paste-subitem', async (req) => {
    const now = Date.now()
    if (now - _lastPasteTime < PASTE_GUARD_MS) {
      console.log('[IPC] item:paste-subitem blocked — too soon after last paste')
      return false
    }
    _lastPasteTime = now

    const dto = getStore().toDto().find((d) => d.id === req.id)
    if (!dto) return false

    const watcher = getWatcher()
    watcher.setPaused(true)

    try {
      let wrote = false
      if (dto.data.kind === 'files' && req.paths && req.paths.length > 0) {
        await writeFileListToClipboard(req.paths)
        wrote = true
      } else if (dto.data.kind === 'image-collection' && req.imageId) {
        const img = dto.data.images.find((i) => i.imageId === req.imageId)
        if (img) {
          // Single image from a collection: write full bitmap + file reference atomically.
          const src = getStore().getImagePath(img.imageId, img.ext)
          const preview = img.preview ?? ''
          await writeImageToClipboard(src && existsSync(src) ? src : null, preview)
          wrote = true
        }
      }

      if (!wrote) return false

      // DO NOT promote/bump hitCount here — same reason as item:paste.
      // Only the watcher (genuine user Ctrl+C) should increment hitCount.

      // Pass false to explicitly close and avoid toggle race conditions.
      pushState.togglePanel(false)

      // Wait 50ms for layout updates, then simulate Ctrl+V
      setTimeout(() => {
        simulatePaste()
      }, 50)
    } finally {
      setTimeout(() => {
        watcher.invalidateSignature()
        watcher.setPaused(loadSettings().incognito)
      }, 350)
    }

    return true
  })

  handle('item:add-files', (paths) => {
    const result = addFiles(paths)
    // If a large drop was split into several stacks, let the user know why
    // they suddenly see multiple items instead of one bundle.
    if (result.stacksCreated > 1) {
      toast(`Split into ${result.stacksCreated} stacks (max 10 each)`, 'info')
    }
    return getStore().toDto()
  })

  handle('item:add-data', async (data) => {
    if (!data) return getStore().toDto()

    if (data.kind === 'files' && data.paths && data.paths.length > 0) {
      const result = addFiles(data.paths)
      if (result.stacksCreated > 1) {
        toast(`Split into ${result.stacksCreated} stacks (max 10 each)`, 'info')
      }
      return getStore().toDto()
    }

    if (data.kind === 'image' && (data as any).imageUrl) {
      const imageUrl = (data as any).imageUrl as string
      if (/^file:/i.test(imageUrl)) {
        const local = imageUrl.replace(/^file:\/\//i, '').replace(/^\/([a-zA-Z]:)/, '$1')
        try {
          const decoded = decodeURIComponent(local).replace(/\//g, '\\')
          if (existsSync(decoded)) {
            addFiles([decoded])
            return getStore().toDto()
          }
        } catch { /* fall through to bitmap import */ }
      }
      try {
        let img = nativeImage.createFromDataURL(imageUrl)
        if (img.isEmpty() && /^https?:\/\//i.test(imageUrl)) {
          const res = await net.fetch(imageUrl)
          if (res.ok) {
            const arrayBuf = await res.arrayBuffer()
            img = nativeImage.createFromBuffer(Buffer.from(arrayBuf))
          }
        }
        if (!img.isEmpty()) {
          let png: Buffer | null = img.toPNG()
          const size = img.getSize()
          data.imageId = createId()
          data.bytes = png.length
          data.width = size.width
          data.height = size.height
          data.ext = 'png'
          data.source = 'image'
          const fromUrl = imageUrl.split(/[\\/]/).pop()?.split('?')[0]
          if (fromUrl && /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(fromUrl)) {
            data.fileName = decodeURIComponent(fromUrl)
          }
          getStore().stageImageBytes(data.imageId, png)
          png = null
          img = null as any
        }
      } catch (err) {
        console.error('[IPC] Failed to process dropped web image URL:', err)
      }
    }

    getStore().add(data, loadSettings().historyLimit)
    pushState.items()
    return getStore().toDto()
  })

  handle('item:remove-subitem', (req) => {
    const success = getStore().removeSubitem(req)
    if (success) pushState.items()
    return success
  })

  handle('item:merge', (sourceId, targetId) => {
    const result: MergeResult = getStore().merge(sourceId, targetId)
    if (result.ok) {
      pushState.items()
    } else if (result.reason === 'full') {
      toast(result.message || 'Collection is full (10 max)', 'info')
    } else if (result.reason === 'incompatible') {
      toast(result.message || 'Cannot combine different item types', 'info')
    }
    // 'notfound' fails silently
    return result
  })

  handle('item:split', (req) => {
    console.log('[IPC] item:split called with req=', JSON.stringify(req))
    const success = getStore().split(req)
    console.log('[IPC] item:split success=', success)
    if (success) pushState.items()
    return success
  })

  handle('startup:refresh', async () => {
    return refreshLaunchAtLoginFromOs()
  })

  handle('settings:update', async (patch) => {
    // When the user explicitly picks a display, also persist its geometry so
    // the next reboot can re-identify the monitor via fuzzy bounds matching
    // even after Windows re-assigns numeric display IDs.
    let enrichedPatch = { ...patch }
    if (patch.stickDisplayId !== undefined) {
      const displays = getDisplayListOptions()
      const chosen = displays.find(d => d.id === patch.stickDisplayId)
      if (chosen) {
        // IMPORTANT: persist workArea (not bounds) — geometry.ts Tier-2 fuzzy match
        // compares d.workArea against savedWorkArea. Using bounds (which includes the
        // taskbar) would create a mismatch of ~40px, exceeding the 8px BOUNDS_TOLERANCE
        // and causing Tier-2 to always fail on reboot.
        enrichedPatch = {
          ...enrichedPatch,
          stickDisplayWorkArea: chosen.workArea,
          stickDisplayScaleFactor: chosen.scaleFactor
        }
      }
    }
    let next = saveSettings(enrichedPatch)
    if (patch.launchAtLogin !== undefined) {
      const applied = await applyLaunchAtLogin(patch.launchAtLogin)
      if (applied.enabled !== next.launchAtLogin) {
        next = saveSettings({ launchAtLogin: applied.enabled })
      }
      if (applied.blockedByUser && patch.launchAtLogin) {
        toast('Windows blocked launch at login. Enable Edge-Drop in Settings → Apps → Startup.', 'info')
      } else if (!applied.ok) {
        toast('Could not update launch at login.', 'error')
      }
    }
    if (patch.hotZoneWidth !== undefined) {
      setHotZoneWidth(patch.hotZoneWidth)
    }
    if (patch.stickPosition !== undefined || patch.stickDisplayId !== undefined || patch.verticalOffset !== undefined) {
      repositionWindow()
      if (patch.stickPosition !== undefined || patch.stickDisplayId !== undefined) {
        popUpAndRetract(1500)
      }
    }
    if (patch.autoUpdates !== undefined) {
      syncAutoUpdaterState()
    }
    if (patch.toggleHotkey !== undefined) {
      registerGlobalHotkey(patch.toggleHotkey)
    }
    pushState.settings(next)
    rebuildTrayMenu()
    return next
  })

  handle('hotkey:pause', (paused) => {
    if (paused) {
      try {
        const { globalShortcut } = require('electron')
        globalShortcut.unregisterAll()
      } catch { /* ignore */ }
    } else {
      registerGlobalHotkey()
    }
  })

  handle('window:set-interactive', (value) => {
    setInteractive(value)
  })

  handle('window:set-preview-mode', (active) => {
    import('./window').then(m => m.setPreviewMode(active))
  })

  handle('window:minimize', () => {
    const win = getOnboardingWindow()
    if (win && !win.isDestroyed()) {
      win.minimize()
    }
  })

  handle('window:focus', (focusable) => {
    setWindowFocusable(focusable ?? true)
  })

  handle('displays:list', () => {
    return getDisplayListOptions()
  })
}

/**
 * Register fire-and-forget (send) listeners.
 *
 * These use `ipcMain.on` + `event.sender` instead of `ipcMain.handle` because
 * the drag-out gesture must be synchronous — `event.sender.startDrag(...)` only
 * works correctly when called from the same event-loop turn as the renderer's
 * `dragstart` event.
 */
function on<C extends SendChannel>(
  channel: C,
  fn: (sender: Electron.WebContents, ...args: SendMap[C]['args']) => void
): void {
  ipcMain.on(channel, (event, ...args) => fn(event.sender, ...(args as SendMap[C]['args'])))
}

export function registerSendListeners(): void {
  on('item:start-drag', (sender, req) => {
    console.log('[IPC] item:start-drag req=', JSON.stringify(req))
    const resolved = resolveDragData(req)
    if (!resolved) {
      console.log('[IPC] start-drag: no data resolved')
      return
    }
    const { data, capturedAt } = resolved
    console.log('[IPC] start-drag: kind=', data.kind)

    // Pause the always-on-top heartbeat for the duration of the drag.
    // The heartbeat fires SetWindowPos(HWND_TOPMOST) every 500 ms, which
    // pushes our window in front of the DWM drag-ghost image — making the
    // dragged item appear to vanish ~0.5 s into any drag gesture.
    setHeartbeatPaused(true)

    startDragOut(sender, data, capturedAt)
    console.log('[IPC] start-drag returned, sending drag-end')
    sender.send('item:drag-end')

    // Re-enable the heartbeat now that the drag is over.
    setHeartbeatPaused(false)

    // Workaround for Electron/Windows not firing drop events on the source window:
    // Check if the user dropped the item back onto our window!
    const { screen, BrowserWindow } = require('electron')
    const point = screen.getCursorScreenPoint()
    const win = BrowserWindow.fromWebContents(sender)
    if (win) {
      const bounds = win.getBounds()
      const isInside = point.x >= bounds.x && point.x <= bounds.x + bounds.width &&
                       point.y >= bounds.y && point.y <= bounds.y + bounds.height
      if (isInside) {
        console.log(`[IPC] Drag ended inside window! Triggering internal-drop at x=${point.x - bounds.x}, y=${point.y - bounds.y}`)
        sender.send('item:internal-drop', { x: point.x - bounds.x, y: point.y - bounds.y })
      }
    }
  })

  on('item:prestage-drag', (_sender, req) => {
    prestageDrag(req)
  })
}

/** Write any item payload back onto the system clipboard. */
export async function writeItemToClipboard(data: ItemData): Promise<void> {
  switch (data.kind) {
    case 'text': {
      const formatted = formatTabularDataForClipboard(data.text, data.html)
      clipboard.clear()
      clipboard.write({ text: formatted.text, html: formatted.html })
      break
    }

    case 'image': {
      const dto = getStore().toDto().find(
        (d) => d.data.kind === 'image' && d.data.imageId === data.imageId
      )
      if (dto && dto.data.kind === 'image') {
        const src = getStore().getImagePath(dto.data.imageId, dto.data.ext)
        const staged = src && existsSync(src) ? stageDragFile(data, dto.capturedAt) : null
        if (staged?.file && src && existsSync(src)) {
          const named = toUnpackagedFilePath(staged.file)
          const ok = await writeImageWithNamedFile(toUnpackagedFilePath(src), named)
          if (ok) break
        }
        await writeImageToClipboard(src && existsSync(src) ? src : null, dto.data.preview)
      }
      break
    }

    case 'image-collection': {
      // Write all image file references so pasting into Explorer copies all files.
      // Also write the first image as bitmap so single-image paste targets work.
      const dto = getStore().toDto().find(
        (d) => d.data.kind === 'image-collection'
      )
      if (dto && dto.data.kind === 'image-collection') {
        const paths: string[] = []
        for (const img of dto.data.images) {
          const src = getStore().getImagePath(img.imageId, img.ext)
          if (existsSync(src)) paths.push(toUnpackagedFilePath(src))
        }
        if (paths.length > 0) {
          // For multi-image collections, write all file refs atomically.
          // Also include the first image as bitmap using DataObject.
          const firstImg = dto.data.images[0]
          const firstPreview = firstImg?.preview ?? ''
          if (paths.length === 1) {
            // Single resolved path: use full atomic image+file write
            await writeImageToClipboard(paths[0], firstPreview)
          } else {
            // Multiple files: write CF_HDROP for all + bitmap for first
            try {
              const addLines = paths
                .map(p => `$c.Add([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(p, 'utf8').toString('base64')}')))|Out-Null`)
                .join(';')
              const b64First = Buffer.from(paths[0], 'utf8').toString('base64')
              const script = [
                'Add-Type -AssemblyName System.Windows.Forms',
                'Add-Type -AssemblyName System.Drawing',
                `$fp=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64First}'))`,
                '$bmp=[Drawing.Image]::FromFile($fp)',
                '$d=New-Object Windows.Forms.DataObject',
                '$d.SetImage($bmp)',
                '$c=New-Object System.Collections.Specialized.StringCollection',
                addLines,
                '$d.SetFileDropList($c)',
                '[Windows.Forms.Clipboard]::SetDataObject($d,$true)',
                '$bmp.Dispose()'
              ].join(';')
              await psHost.run(script, 3000)
            } catch (err) {
              console.error('[ipc] image-collection clipboard write failed:', err)
              // Fallback: write first image bitmap only
              try {
                const img = nativeImage.createFromDataURL(firstPreview)
                if (!img.isEmpty()) { clipboard.clear(); clipboard.writeImage(img) }
              } catch { /* ignore */ }
            }
          }
        }
      }
      break
    }

    case 'files':
      // Write real file references so pasting into Explorer copies the files,
      // not path strings.
      await writeFileListToClipboard(data.paths)
      break
  }
}

/** Parses raw GitHub markdown release notes into clean plain text highlights (stripping image/video/HTML tags). */
function parseReleaseBodyToCleanText(body: string): { summary: string; highlights: Array<{ title: string; description: string }> } {
  // 1. Strip images, videos, and raw HTML tags completely (pure plain text)
  const clean = body
    .replace(/!\[.*?\]\(.*?\)/g, '') // Strip markdown images ![alt](url)
    .replace(/<img[^>]*>/gi, '')     // Strip HTML img tags
    .replace(/<video[^>]*>.*?<\/video>/gi, '') // Strip HTML video tags
    .replace(/<[^>]+>/g, '')         // Strip any remaining HTML tags

  const lines = clean.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  let summary = ''
  const highlights: Array<{ title: string; description: string }> = []

  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('>')) {
      const text = line.replace(/^[#>\s]+/, '').trim()
      if (!summary && text && !text.toLowerCase().includes('what\'s changed') && !text.toLowerCase().includes('full changelog')) {
        summary = text
      }
      continue
    }

    if (line.startsWith('-') || line.startsWith('*') || line.startsWith('•') || /^\d+\./.test(line)) {
      const content = line.replace(/^[-*•\d.\s]+/, '').trim()
      if (!content) continue

      const boldMatch = content.match(/^\*\*(.*?)\*\*[\s:-]*(.*)/)
      if (boldMatch) {
        const title = boldMatch[1].trim()
        const description = boldMatch[2].trim()
        if (title) {
          highlights.push({ title, description: description || title })
          continue
        }
      }

      const colonIdx = content.indexOf(':')
      if (colonIdx > 0 && colonIdx < 45) {
        const title = content.substring(0, colonIdx).trim()
        const description = content.substring(colonIdx + 1).trim()
        if (title) {
          highlights.push({ title, description: description || title })
          continue
        }
      }

      highlights.push({ title: content, description: '' })
    } else if (!summary && line.length > 10) {
      summary = line
    }
  }

  return {
    summary: summary || 'Latest updates and fixes.',
    highlights: highlights.length > 0 ? highlights : [{ title: 'Bug Fixes & Performance Enhancements', description: 'Includes minor bug fixes and stability improvements.' }]
  }
}

const STATIC_CHANGELOG_FALLBACK = [
  {
    version: 'v0.2.7',
    date: 'Aug 13, 2026',
    isLatest: true,
    summary: 'Disk-backed on-demand text payloads, image thumbnailing, RAM footprint stabilization (~130 MB), universal drag-and-drop vault, zero-cost URL previews, and Windows OS integration fixes.',
    highlights: [
      {
        title: 'Disk-Backed Payloads & RAM Footprint Stabilization',
        description: 'Large text entries (>300 chars) are stored as disk payload files, locking operational RAM down to ~130 MB–160 MB with zero copy/paste latency.'
      },
      {
        title: 'Image Thumbnailing Protocol (edgelocal://thumb/)',
        description: 'History cards now render 240px custom thumbnails instead of multi-megapixel raw images, preventing Chromium GPU memory bloat.'
      },
      {
        title: 'Windows Home Screen & Fullscreen Detection Fix',
        description: 'Differentiates Windows Desktop/Home Screen shell focus from full-screen games via Win32 API window class filtering, enabling smooth edge opening on the Home Screen.'
      },
      {
        title: 'Self-Healing Launch at Login Sync',
        description: 'Unconditionally synchronizes Windows Registry startup entries with live binary paths and --hidden flags after every app update.'
      },
      {
        title: 'Universal Drag-and-Drop & Zero-Cost URL Previews',
        description: 'Drag text, links, web images, and files directly into Edge-Drop, with offline rich URL link preview cards and favicons.'
      }
    ]
  },
  {
    version: 'v0.2.6',
    date: 'Aug 05, 2026',
    isLatest: false,
    summary: 'Performance optimizations, redesigned settings footer, custom support portal integration, and enhanced 30-language typography.',
    highlights: [
      {
        title: 'Performance Improvements',
        description: 'Removed CPU blur effects across UI components for smoother panel opening and scrolling.'
      },
      {
        title: 'Settings UI & Navigation Redesign',
        description: 'Reordered settings footer to place the Support section above the Quit button, redesigned buttons into matching pill shapes with a soft pastel red support button, and simplified Quit into a low-profile bottom button.'
      },
      {
        title: 'Official Support Portal Integration',
        description: 'Updated support link to open official Edge-Drop support page supporting both International Ko-fi and Indian UPI options.'
      },
      {
        title: 'Localization & Typography Enhancements',
        description: 'Updated filter category labels across 30 languages with shorter native terms and added dynamic font scaling so filter text fits cleanly without overlapping.'
      }
    ]
  },
  {
    version: 'v0.2.5',
    date: 'Aug 03, 2026',
    isLatest: false,
    summary: 'Full 30-language localization with auto-scroll selector, powerMonitor sleep/wake protection, text size typography settings, and multi-file action bar.',
    highlights: [
      {
        title: 'Complete 30-Language Localization & Smart Language Selector',
        description: 'Implemented full translation dictionaries across 30 languages, added RTL layout support for Arabic and Hebrew, integrated audio haptics, and added auto-scrolling to position the selected language in the dropdown viewport.'
      },
      {
        title: 'Laptop Sleep & Unlock Protection',
        description: 'Eliminated false Copy Indicator activations when opening laptop lid or unlocking screen using native powerMonitor lifecycle handlers.'
      },
      {
        title: 'Text Size Typography Scale Setting',
        description: 'Added customizable typography scale settings (Small, Normal, Medium, Large) applying dynamic font scaling across the app.'
      },
      {
        title: 'Multi-File Selection & Preview Action Bar',
        description: 'Added tap-to-toggle multi-file selection with a batch action bar (Select All, Copy Selected, Paste Selected, Clear Selection).'
      }
    ]
  },
  {
    version: 'v0.2.2',
    date: 'Jul 29, 2026',
    isLatest: false,
    summary: 'Stationary 3-category Settings navigation, Web Audio API haptic sound suite, edge trigger alignment presets, and magnetic 5% tick slider.',
    highlights: [
      {
        title: 'Stationary 3-Category Settings Navigation',
        description: 'Organized Settings into three clean tabs (Behaviour, Position, Appearance) with a stationary header and independent scroll position memory per section.'
      },
      {
        title: 'Synthesized Web Audio Haptic Suite',
        description: 'Zero-asset Web Audio API sound engine providing tactile audio feedback for dial ticks, button clicks, toggle pops, and mechanical delete thuds.'
      },
      {
        title: 'Independent Edge Trigger Alignment & Proximity Beacon',
        description: 'Choose Top, Center, or Bottom trigger strip placement with dynamic clipPath alignment, alongside an edge location hint hairline pulse.'
      },
      {
        title: '5% Magnetic Tick Slider & Quit Action',
        description: 'Continuous 0.002 1-to-1 real-time drag tracking with magnetic 5% snapping on release, plus an integrated Quit Edge-Drop button.'
      }
    ]
  },
  {
    version: 'v0.2.1',
    date: 'Jul 28, 2026',
    isLatest: false,
    summary: 'Cross-reboot multi-monitor display persistence, 5-category macOS segmented filter control, unified image classification, and HD anti-aliased curved edges.',
    highlights: [
      {
        title: 'Cross-Reboot Display Persistence',
        description: '4-tier display resolution pipeline (geometry fuzzy-matching) remembers your chosen monitor across device restarts with an automatic primary display fallback.'
      },
      {
        title: '5-Category Segmented Filter Bar',
        description: 'Integrated All, Text, Links, Images, and Files quick filter chips with a persistent sliding spring pill and zero shape distortion.'
      },
      {
        title: 'Unified Image Entity Classification',
        description: 'Native screenshots (Win+Shift+S) and copied image files (.png, .jpg, .webp, .svg) are unified under the Images filter tab.'
      },
      {
        title: 'HD Anti-Aliased Curved Edges',
        description: 'GPU layer promotion (transform: translateZ(0)) and padding-box clipping deliver crisp, vector-smooth curved borders across all display scales.'
      }
    ]
  },
  {
    version: 'v0.2.0',
    date: 'Jul 26, 2026',
    isLatest: false,
    summary: 'Silent background auto-updater, GitHub Releases changelog synchronization, and glassmorphic pinned deck.',
    highlights: [
      {
        title: 'Silent Background Auto-Updater',
        description: 'GitHub releases feature silent background downloading and a single-click Restart to Update installation button.'
      },
      {
        title: 'Microsoft Store Build Isolation',
        description: 'Isolated build pipelines ensure Microsoft Store (MSIX) builds remain 100% compliant with Store policies.'
      },
      {
        title: 'Direct URL Launcher',
        description: 'Added quick action buttons to launch links in your default web browser directly from item cards and preview flyouts.'
      },
      {
        title: 'Pinned Items Deck Container',
        description: 'Encapsulated pinned items inside a dedicated deck container with smooth spring height animations.'
      }
    ]
  },
  {
    version: 'v0.1.5',
    date: 'Jul 24, 2026',
    isLatest: false,
    summary: 'Customizable Copy Indicator styles with a 2x2 grid selector flyout alongside panel hover stability fixes.',
    highlights: [
      {
        title: 'Four Vector Indicator Options',
        description: 'Added support for 4 customizable copy indicator styles including Logo, Tick, Copy, and Sparkle.'
      },
      {
        title: 'Balanced 2x2 Grid Flyout Selector',
        description: 'Integrated a 2x2 grid selector flyout inside Settings under Indicator Style for quick previews.'
      }
    ]
  }
]

let _releasesCache: Array<{
  version: string
  date: string
  isLatest: boolean
  summary: string
  highlights: Array<{ title: string; description: string }>
}> | null = null

async function fetchAndCacheReleases() {
  try {
    const response = await fetch('https://api.github.com/repos/Deepender25/Edge-Drop/releases', {
      headers: { 'User-Agent': 'Edge-Drop-App' },
      signal: AbortSignal.timeout(12000)
    })
    if (!response.ok) {
      return _releasesCache || STATIC_CHANGELOG_FALLBACK
    }
    const data = (await response.json()) as any[]
    if (!Array.isArray(data) || data.length === 0) {
      return _releasesCache || STATIC_CHANGELOG_FALLBACK
    }

    const parsed = data.slice(0, 10).map((rel, index) => {
      const tag = rel.tag_name || rel.name || `v0.1.${index}`
      const dateStr = rel.published_at
        ? new Date(rel.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : ''

      const rawBody = rel.body || ''
      const { summary, highlights } = parseReleaseBodyToCleanText(rawBody)

      return {
        version: tag.startsWith('v') ? tag : `v${tag}`,
        date: dateStr,
        isLatest: index === 0,
        summary: summary || `Release ${tag}`,
        highlights
      }
    })

    _releasesCache = parsed
    return parsed
  } catch {
    console.log('[IPC] GitHub releases fetch offline or timed out; using static fallback.')
    return _releasesCache || STATIC_CHANGELOG_FALLBACK
  }
}

// Background pre-fetch 3 seconds after startup ONLY if autoUpdates is enabled
setTimeout(() => {
  if (loadSettings().autoUpdates !== false) {
    fetchAndCacheReleases().catch(() => {})
  } else {
    console.log('[IPC] Automatic updates disabled by setting; using bundled static release notes.')
  }
}, 3000)


