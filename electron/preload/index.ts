/**
 * Preload bridge: the only surface the renderer has onto Electron.
 *
 * Everything is built from the typed contracts in `shared/ipc.ts`, so the
 * renderer gets a fully typed `window.edge` API and never touches a raw channel
 * name. contextIsolation keeps this isolated from page globals; nodeIntegration
 * stays off, so the renderer has no Node access at all.
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type {
  EventChannel,
  EventArgs,
  InvokeArgs,
  InvokeChannel,
  InvokeResult,
  SendArgs,
  SendChannel
} from '../../shared/ipc'
import type { EdgeApi } from '../../shared/bridge'
import type { DragRequest } from '../../shared/types'

/** Typed invoke wrapper derived from the shared contracts. */
function invoke<C extends InvokeChannel>(
  channel: C,
  ...args: InvokeArgs<C>
): Promise<InvokeResult<C>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<InvokeResult<C>>
}

/**
 * Typed fire-and-forget send. Used for gestures that the renderer must not
 * await — notably native drag-out, where main needs `event.sender.startDrag`
 * called synchronously relative to the DOM dragstart.
 */
function send<C extends SendChannel>(channel: C, ...args: SendArgs<C>): void {
  ipcRenderer.send(channel, ...args)
}

/** Typed event subscriber. Returns an unsubscribe function. */
function on<C extends EventChannel>(
  channel: C,
  listener: (...args: EventArgs<C>) => void
): () => void {
  const wrapped = (_e: IpcRendererEvent, ...args: EventArgs<C>) => listener(...args)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.off(channel, wrapped)
}

/**
 * Intercept drag-and-drop globally in the preload script.
 * By running in the capturing phase, we intercept the drop before React.
 * This is required because passing DragEvent or File objects across the
 * contextBridge strips their internal C++ backing, causing webUtils.getPathForFile
 * to fail. Handling it here natively bypasses the bridge entirely.
 */
import { reduceGuard, isGuarded } from './internalDragGuard'

let guard: import('./internalDragGuard').GuardState = { phase: 'idle', fireAt: null }
let guardIdleTimer: ReturnType<typeof setTimeout> | null = null

function dispatchGuard(event: import('./internalDragGuard').GuardEvent): void {
  guard = reduceGuard(guard, event)
  if (event.type === 'dragEnd' && guard.phase === 'releasing') {
    if (guardIdleTimer) clearTimeout(guardIdleTimer)
    const remaining = (guard.fireAt ?? Date.now()) - Date.now()
    guardIdleTimer = setTimeout(() => {
      dispatchGuard({ type: 'tick', now: Date.now() })
      guardIdleTimer = null
    }, Math.max(1, remaining))
  }
  // An explicit 'arm' cancels any pending release timer by leaving it to fire
  // harmlessly against the armed phase ('tick' is a no-op while armed).
}

function setInternalDragState(active: boolean): void {
  if (active) {
    dispatchGuard({ type: 'arm' })
  } else {
    dispatchGuard({ type: 'dragEnd', now: Date.now() })
  }
}

const win: any = (globalThis as any).window || globalThis

win.addEventListener('dragstart', () => {
  setInternalDragState(true)
}, true)

win.addEventListener('dragend', () => {
  setInternalDragState(false)
}, true)

win.addEventListener('dragover', (e: any) => {
  e.preventDefault()
}, false)

win.addEventListener('drop', (e: any) => {
  if (isGuarded(guard)) {
    // First drop after one of our drags is ours by the single-mouse
    // invariant (see internalDragGuard.ts). Swallow, consume, and stop any
    // other handler from reacting to our own exported files.
    dispatchGuard({ type: 'drop' })
    if (guardIdleTimer) { clearTimeout(guardIdleTimer); guardIdleTimer = null }
    e.preventDefault()
    e.stopPropagation()
    return
  }

  const dt = e.dataTransfer
  if (!dt) return

  // 1. Local Files
  const files = dt.files
  if (files && files.length > 0) {
    const paths: string[] = []
    for (let i = 0; i < files.length; i++) {
      try {
        const p = webUtils.getPathForFile(files[i])
        if (p) paths.push(p)
      } catch {
        /* ignore unreadable entries */
      }
    }
    if (paths.length > 0) {
      e.preventDefault()
      invoke('item:add-files', paths).catch(console.error)
      return
    }
  }

  // 2. URLs / Web Links / Web Images
  const uriList = dt.getData('text/uri-list') || dt.getData('URL')
  const plainText = dt.getData('text/plain')?.trim()
  const htmlText = dt.getData('text/html')?.trim()

  if (uriList) {
    const urls = uriList.split(/\r?\n/).map((u: string) => u.trim()).filter((u: string) => u && !u.startsWith('#'))
    if (urls.length > 0) {
      const url = urls[0]
      const isImg = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url) || /^data:image\//i.test(url)
      e.preventDefault()
      if (isImg) {
        invoke('item:add-data', {
          kind: 'image',
          imageId: '',
          width: 0,
          height: 0,
          bytes: 0,
          imageUrl: url
        } as any).catch(console.error)
      } else {
        invoke('item:add-data', {
          kind: 'text',
          text: url,
          isUrl: true
        }).catch(console.error)
      }
      return
    }
  }

  // 3. Plain Text / HTML
  if (plainText) {
    e.preventDefault()
    const isUrl = /^(https?:\/\/|www\.)[^\s]+$/i.test(plainText)
    const isColor = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(plainText)
    invoke('item:add-data', {
      kind: 'text',
      text: plainText,
      html: htmlText && htmlText !== plainText ? htmlText : undefined,
      isUrl,
      isColor
    }).catch(console.error)
  }
}, true)

const api = {
  /* Renderer -> Main */
  loadState: () => invoke('state:load'),
  setPinned: (id: string, pinned: boolean) => invoke('item:set-pinned', id, pinned),
  deleteItem: (id: string) => invoke('item:delete', id),
  deleteBatchItems: (ids: string[]) => invoke('item:delete-batch', ids),
  clearItems: () => invoke('item:clear'),
  getFullText: (id: string) => invoke('item:get-full-text', id),
  copyItem: (id: string) => invoke('item:copy', id),
  copySubitem: (req: import('../../shared/types').DragRequest) => invoke('item:copy-subitem', req),
  pasteItem: (id: string) => invoke('item:paste', id),
  pasteSubitem: (req: import('../../shared/types').DragRequest) => invoke('item:paste-subitem', req),
  pasteEmoji: (text: string) => invoke('emoji:paste', text),
  installUpdate: () => invoke('app:install-update'),
  checkForUpdatesManual: () => invoke('updater:check-manual'),
  startUpdateDownload: () => invoke('updater:start-download'),
  quitApp: () => invoke('app:quit'),
  startDrag: (req: DragRequest) => {
    setInternalDragState(true)
    send('item:start-drag', req)
  },
  prestageDrag: (req: DragRequest) => send('item:prestage-drag', req),
  addFiles: (paths: string[]) => invoke('item:add-files', paths),
  addItemData: (data: import('../../shared/types').ItemData) => invoke('item:add-data', data),
  removeSubitem: (req: import('../../shared/types').DragRequest) => invoke('item:remove-subitem', req),
  mergeItems: (sourceId: string, targetId: string) => invoke('item:merge', sourceId, targetId),
  splitItem: (req: import('../../shared/types').DragRequest) => invoke('item:split', req),
  getDisplays: () => invoke('displays:list'),
  getReleases: () => invoke('app:get-releases'),
  updateSettings: (patch: Partial<InvokeResult<'settings:update'>>) =>
    invoke('settings:update', patch),
  refreshLaunchAtLogin: () => invoke('startup:refresh'),
  setInteractive: (value: boolean) => invoke('window:set-interactive', value),
  setPreviewMode: (active: boolean) => invoke('window:set-preview-mode', active),
  pauseHotkey: (paused: boolean) => invoke('hotkey:pause', paused),
  revealFile: (path: string) => invoke('file:reveal', path),
  minimizeWindow: () => invoke('window:minimize'),
  focusWindow: (focusable?: boolean) => invoke('window:focus', focusable),
  setInternalDrag: (active: boolean) => { setInternalDragState(active) },
  broadcastTutorialStep: (step: number) => send('tutorial:set-step', step),

  /* Main -> Renderer */
  onItems: (cb: (items: EventArgs<'state:items'>[0]) => void) => on('state:items', cb),
  onSettings: (cb: (settings: EventArgs<'state:settings'>[0]) => void) => on('state:settings', cb),
  onToggle: (cb: (open?: boolean) => void) => on('window:toggle', cb),
  onOpenSettings: (cb: () => void) => on('window:open-settings', cb),
  onDragEnd: (cb: () => void) => {
    return on('item:drag-end', () => {
      setInternalDragState(false)
      cb()
    })
  },
  onInternalDrop: (cb: (pos: { x: number; y: number }) => void) => on('item:internal-drop', cb),
  onCursorEdge: (cb: (data: EventArgs<'window:cursor-edge'>[0]) => void) => on('window:cursor-edge', cb),
  onToast: (cb: (toast: { id: string; message: string; tone: 'info' | 'error' }) => void) => on('ui:toast', cb),
  onCopyFlare: (cb: () => void) => on('ui:copy-flare', cb),
  onTutorialStep: (cb: (step: number) => void) => on('tutorial:step', cb),
  onUpdateAvailable: (cb: (info: { version: string }) => void) => on('app:update-available', cb),
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => on('app:update-downloaded', cb),

  /* Drag helpers */
  // (Handled natively by capturing drop event above)
}

// Validate that our implementation matches the shared contract.
const _bridge: EdgeApi = api
void _bridge

contextBridge.exposeInMainWorld('edge', api)
