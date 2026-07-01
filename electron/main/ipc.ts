/**
 * IPC handler registration.
 *
 * Each `ipcMain.handle` here mirrors a contract in `shared/ipc.ts`. The
 * renderer calls them through the typed preload bridge, so a signature mismatch
 * is a compile-time error rather than a runtime one.
 */
import { ipcMain, clipboard, nativeImage } from 'electron'
import { type InvokeMap, type InvokeChannel, type SendMap, type SendChannel } from '../../shared/ipc'
import { getStore, loadSettings, saveSettings, pushState, addFiles, getWatcher } from './state'
import { setInteractive } from './window'
import { startDragOut, resolveDragData } from './drag'
import type { ItemData } from '../../shared/types'

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

export function registerIpc(): void {
  handle('state:load', () => {
    return {
      items: getStore().toDto(),
      settings: loadSettings()
    }
  })

  handle('item:set-pinned', (id, pinned) => {
    getStore().setPinned(id, pinned)
    pushState.items()
    return getStore().toDto()
  })

  handle('item:delete', (id) => {
    getStore().delete(id)
    pushState.items()
    return getStore().toDto()
  })

  handle('item:clear', () => {
    getStore().clearUnpinned()
    pushState.items()
    return getStore().toDto()
  })

  handle('item:copy', (id) => {
    const item = getStore().get(id)
    console.log('[IPC] item:copy id=', id, 'found=', !!item)
    if (!item) return false

    const watcher = getWatcher()
    watcher.setPaused(true)
    writeItemToClipboard(item.data)
    console.log('[IPC] item:copy wrote to clipboard, kind=', item.data.kind)

    // Unpause after a short delay to allow OS clipboard event to settle.
    // Respect the current incognito state when unpausing.
    setTimeout(() => {
      watcher.setPaused(loadSettings().incognito)
    }, 200)

    return true
  })

  handle('item:copy-subitem', (req) => {
    // Resolve a single sub-item (one file of a bundle, or one image of a
    // collection) and write just that onto the clipboard — not the whole item.
    const dto = getStore().toDto().find((d) => d.id === req.id)
    if (!dto) return false

    let wrote = false
    if (dto.data.kind === 'files' && req.paths && req.paths.length > 0) {
      // Electron has no public files-write API; fall back to paths as text,
      // mirroring writeItemToClipboard's behaviour for whole file items.
      clipboard.clear()
      clipboard.writeText(req.paths.join('\r\n'))
      wrote = true
    } else if (dto.data.kind === 'image-collection' && req.imageId) {
      const img = dto.data.images.find((i) => i.imageId === req.imageId)
      if (img && img.preview) {
        const native = nativeImage.createFromDataURL(img.preview)
        if (!native.isEmpty()) {
          clipboard.clear()
          clipboard.writeImage(native)
          wrote = true
        }
      }
    }

    if (!wrote) return false

    const watcher = getWatcher()
    watcher.setPaused(true)
    setTimeout(() => {
      watcher.setPaused(loadSettings().incognito)
    }, 200)

    return true
  })

  handle('item:add-files', (paths) => {
    addFiles(paths)
    return getStore().toDto()
  })

  handle('item:remove-subitem', (req) => {
    const success = getStore().removeSubitem(req)
    if (success) pushState.items()
    return success
  })

  handle('item:merge', (sourceId, targetId) => {
    const success = getStore().merge(sourceId, targetId)
    if (success) pushState.items()
    return success
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
    pushState.settings(next)
    return next
  })

  handle('window:set-interactive', (value) => {
    setInteractive(value)
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
    startDragOut(sender, data)
    console.log('[IPC] start-drag returned, sending drag-end')
    sender.send('item:drag-end')

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
export function writeItemToClipboard(data: ItemData): void {
  switch (data.kind) {
    case 'text':
      clipboard.clear()
      clipboard.writeText(data.text)
      if (data.html) clipboard.writeHTML(data.html)
      break
    case 'image': {
      const dto = getStore().toDto().find(
        (d) => d.data.kind === 'image' && d.data.imageId === data.imageId
      )
      if (dto && dto.data.kind === 'image') {
        const img = nativeImage.createFromDataURL(dto.data.preview)
        if (!img.isEmpty()) {
          clipboard.clear()
          clipboard.writeImage(img)
        }
      }
      break
    }
    case 'files':
      // Electron has no public files-write API; fall back to paths as text.
      clipboard.clear()
      clipboard.writeText(data.paths.join('\r\n'))
      break
  }
}
