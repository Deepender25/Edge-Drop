/**
 * IPC handler registration.
 *
 * Each `ipcMain.handle` here mirrors a contract in `shared/ipc.ts`. The
 * renderer calls them through the typed preload bridge, so a signature mismatch
 * is a compile-time error rather than a runtime one.
 */
import { app, ipcMain, clipboard, nativeImage, screen } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { psHost } from './powershell'
import { type InvokeMap, type InvokeChannel, type SendMap, type SendChannel } from '../../shared/ipc'
import { getStore, loadSettings, saveSettings, pushState, addFiles, getWatcher } from './state'
import { getMainWindow } from './window'
import { setInteractive, setHeartbeatPaused, setHotZoneWidth, repositionWindow } from './window'
import { getOnboardingWindow } from './onboardingWindow'
import { startDragOut, resolveDragData } from './drag'
import { clipboardSignature } from '../clipboard/formats'
import type { ItemData, MergeResult } from '../../shared/types'

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
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('ui:toast', { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, message, tone })
  }
}

/** Simulate pressing Ctrl+V via PowerShell after returning focus to the previous active window. */
function simulatePaste(): void {
  if (process.platform === 'win32') {
    // Run via the persistent powershell host for near-zero latency (no process spawn overhead)
    psHost.run("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')", 2000)
      .catch((err) => {
        console.error('[Main] simulatePaste psHost failed, using fallback:', err)
        // Fallback to spawning a new powershell process
        execFile('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"
        ], (fallbackErr) => {
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
async function writeFileListToClipboard(paths: string[]): Promise<void> {
  if (process.platform === 'win32' && paths.length > 0) {
    try {
      const addLines = paths
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
  clipboard.clear()
  clipboard.writeText(paths.join('\r\n'))
}

async function writeImageToClipboard(imagePath: string | null, previewDataUrl: string): Promise<void> {
  if (process.platform === 'win32' && imagePath && existsSync(imagePath)) {
    try {
      const b64Path = Buffer.from(imagePath, 'utf8').toString('base64')
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        'Add-Type -AssemblyName System.Drawing',
        `$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64Path}'))`,
        '$bmp=[Drawing.Image]::FromFile($p)',
        '$d=New-Object Windows.Forms.DataObject',
        '$d.SetImage($bmp)',
        '$c=New-Object System.Collections.Specialized.StringCollection',
        '$c.Add($p)|Out-Null',
        '$d.SetFileDropList($c)',
        '[Windows.Forms.Clipboard]::SetDataObject($d,$true)',
        '$bmp.Dispose()'
      ].join(';')
      await psHost.run(script, 3000)
      return
    } catch (err) {
      console.error('[ipc] writeImageToClipboard PowerShell failed, using bitmap fallback:', err)
    }
  }
  // Fallback: write bitmap only via Electron (no file reference)
  try {
    const img = nativeImage.createFromDataURL(previewDataUrl)
    if (!img.isEmpty()) {
      clipboard.clear()
      clipboard.writeImage(img)
    }
  } catch { /* ignore */ }
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

/** Detects whether the app is packaged and running as a Microsoft Store (MSIX) build. */
function isStoreBuild(): boolean {
  if (process.windowsStore || process.env.APP_BUILD_TARGET === 'store') {
    return true
  }
  try {
    if (app.isPackaged) {
      const pkgPath = join(app.getAppPath(), 'package.json')
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
        if (pkg.buildTarget === 'store') {
          return true
        }
      }
    }
  } catch {
    /* ignore */
  }
  return false
}

export function registerIpc(): void {
  handle('state:load', () => {
    return {
      items: getStore().toDto(),
      settings: loadSettings(),
      version: app.getVersion()
    }
  })

  handle('app:check-update', async () => {
    if (isStoreBuild()) {
      return null
    }
    try {
      const response = await fetch('https://api.github.com/repos/Deepender25/Edge-Drop/releases/latest', {
        headers: {
          'User-Agent': 'Edge-Drop-App'
        }
      })
      if (!response.ok) {
        console.error('[IPC] app:check-update fetch failed with status:', response.status)
        return null
      }
      const data = await response.json() as any
      const latestVersion = data.tag_name || ''
      const assets = data.assets || []
      const exeAsset = assets.find((a: any) => a.name && a.name.endsWith('.exe'))
      const apkAsset = assets.find((a: any) => a.name && a.name.endsWith('.apk'))
      const downloadUrl = exeAsset?.browser_download_url || apkAsset?.browser_download_url || data.html_url || ''
      return {
        latestVersion,
        downloadUrl
      }
    } catch (err) {
      console.error('[IPC] app:check-update error:', err)
      return null
    }
  })

  handle('item:set-pinned', (id, pinned) => {
    getStore().setPinned(id, pinned)
    pushState.items()
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

  handle('item:copy', async (id) => {
    const item = getStore().get(id)
    console.log('[IPC] item:copy id=', id, 'found=', !!item)
    if (!item) return false

    const watcher = getWatcher()
    watcher.setPaused(true)
    await writeItemToClipboard(item.data)
    console.log('[IPC] item:copy wrote to clipboard, kind=', item.data.kind)

    // Promote the copied item to the top of the history stack
    getStore().add(item.data, loadSettings().historyLimit)
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
      await writeItemToClipboard(item.data)
      console.log('[IPC] item:paste wrote to clipboard, kind=', item.data.kind)

      // DO NOT call store.add() here. hitCount must only increment when the user
      // genuinely copies the content from a source app (detected by the watcher).
      // Pasting from Edge-Drop is a retrieval action, not a new copy.

      // Close panel so focus returns to the user's active input/text box.
      // Pass false to explicitly close and avoid toggle race conditions.
      pushState.togglePanel(false)

      // Wait 50ms for layout updates, then simulate Ctrl+V
      setTimeout(() => {
        simulatePaste()
      }, 50)
    } finally {
      // Invalidate (not resync) the watcher signature after the pause expires.
      // This ensures that if the user re-copies the SAME content from the source
      // app right after paste, the watcher detects it as new (clipboard sig never
      // changed, but our sentinel '__post-paste__' guarantees the next poll sees a diff).
      setTimeout(() => {
        watcher.invalidateSignature()
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

  handle('settings:update', (patch) => {
    const next = saveSettings(patch)
    if (patch.launchAtLogin !== undefined && app.isPackaged) {
      try {
        app.setLoginItemSettings({
          openAtLogin: next.launchAtLogin,
          path: app.getPath('exe')
        })
      } catch { /* ignore */ }
    }
    if (patch.hotZoneWidth !== undefined) {
      setHotZoneWidth(patch.hotZoneWidth)
    }
    if (patch.stickPosition !== undefined || patch.stickDisplayId !== undefined) {
      repositionWindow()
    }
    pushState.settings(next)
    return next
  })

  handle('window:set-interactive', (value) => {
    setInteractive(value)
  })

  handle('window:minimize', () => {
    const win = getOnboardingWindow()
    if (win && !win.isDestroyed()) {
      win.minimize()
    }
  })

  handle('displays:list', () => {
    const all = screen.getAllDisplays()
    const primary = screen.getPrimaryDisplay()
    return all.map((d) => {
      const rawName = (d as any).label || ''
      const name = rawName || (d.id === primary.id ? 'Primary' : `Display #${d.id}`)
      return {
        id: d.id,
        bounds: { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height },
        isPrimary: d.id === primary.id,
        label: d.id === primary.id
          ? `${name} (Primary) ${d.bounds.width}×${d.bounds.height}`
          : `${name} ${d.bounds.width}×${d.bounds.height}`,
        name: d.id === primary.id ? `${name} (Primary)` : name,
        resolution: `${d.bounds.width}×${d.bounds.height}`
      }
    })
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
    const data = resolveDragData(req)
    if (!data) {
      console.log('[IPC] start-drag: no data resolved')
      return
    }
    console.log('[IPC] start-drag: kind=', data.kind)

    // Pause the always-on-top heartbeat for the duration of the drag.
    // The heartbeat fires SetWindowPos(HWND_TOPMOST) every 500 ms, which
    // pushes our window in front of the DWM drag-ghost image — making the
    // dragged item appear to vanish ~0.5 s into any drag gesture.
    setHeartbeatPaused(true)

    startDragOut(sender, data)
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
}

/** Write any item payload back onto the system clipboard. */
export async function writeItemToClipboard(data: ItemData): Promise<void> {
  switch (data.kind) {
    case 'text':
      clipboard.clear()
      clipboard.write({ text: data.text, html: data.html })
      break

    case 'image': {
      const dto = getStore().toDto().find(
        (d) => d.data.kind === 'image' && d.data.imageId === data.imageId
      )
      if (dto && dto.data.kind === 'image') {
        // Write bitmap AND file reference atomically via PowerShell DataObject.
        // This lets the user paste into Slack/Word (reads bitmap) AND into
        // Explorer (reads CF_HDROP file reference) from the same clipboard write.
        const src = getStore().getImagePath(dto.data.imageId, dto.data.ext)
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
          if (existsSync(src)) paths.push(src)
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
