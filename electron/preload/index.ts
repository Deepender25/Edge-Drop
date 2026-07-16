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
let internalDrag = false

const win: any = (globalThis as any).window || globalThis

win.addEventListener('dragover', (e: any) => {
  e.preventDefault()
}, false)

win.addEventListener('drop', (e: any) => {
  if (internalDrag) {
    e.preventDefault()
    return
  }

  const files = e.dataTransfer?.files
  if (!files || !files.length) return

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
    // Fire and forget to the main process.
    // The main process will broadcast the new state back to React.
    e.preventDefault()
    invoke('item:add-files', paths).catch(console.error)
  }
}, true)

const api = {
  /* Renderer -> Main */
  loadState: () => invoke('state:load'),
  setPinned: (id: string, pinned: boolean) => invoke('item:set-pinned', id, pinned),
  deleteItem: (id: string) => invoke('item:delete', id),
  clearItems: () => invoke('item:clear'),
  copyItem: (id: string) => invoke('item:copy', id),
  copySubitem: (req: import('../../shared/types').DragRequest) => invoke('item:copy-subitem', req),
  pasteItem: (id: string) => invoke('item:paste', id),
  pasteSubitem: (req: import('../../shared/types').DragRequest) => invoke('item:paste-subitem', req),
  checkUpdate: () => invoke('app:check-update'),
  startDrag: (req: DragRequest) => send('item:start-drag', req),
  addFiles: (paths: string[]) => invoke('item:add-files', paths),
  removeSubitem: (req: import('../../shared/types').DragRequest) => invoke('item:remove-subitem', req),
  mergeItems: (sourceId: string, targetId: string) => invoke('item:merge', sourceId, targetId),
  splitItem: (req: import('../../shared/types').DragRequest) => invoke('item:split', req),
  getDisplays: () => invoke('displays:list'),
  updateSettings: (patch: Partial<InvokeResult<'settings:update'>>) =>
    invoke('settings:update', patch),
  setInteractive: (value: boolean) => invoke('window:set-interactive', value),
  minimizeWindow: () => invoke('window:minimize'),
  setInternalDrag: (active: boolean) => { internalDrag = active },
  broadcastTutorialStep: (step: number) => send('tutorial:set-step', step),

  /* Main -> Renderer */
  onItems: (cb: (items: EventArgs<'state:items'>[0]) => void) => on('state:items', cb),
  onSettings: (cb: (settings: EventArgs<'state:settings'>[0]) => void) => on('state:settings', cb),
  onToggle: (cb: (open?: boolean) => void) => on('window:toggle', cb),
  onOpenSettings: (cb: () => void) => on('window:open-settings', cb),
  onDragEnd: (cb: () => void) => on('item:drag-end', cb),
  onInternalDrop: (cb: (pos: { x: number; y: number }) => void) => on('item:internal-drop', cb),
  onCursorEdge: (cb: (data: EventArgs<'window:cursor-edge'>[0]) => void) => on('window:cursor-edge', cb),
  onToast: (cb: (toast: { id: string; message: string; tone: 'info' | 'error' }) => void) => on('ui:toast', cb),
  onTutorialStep: (cb: (step: number) => void) => on('tutorial:step', cb),

  /* Drag helpers */
  // (Handled natively by capturing drop event above)
}

// Validate that our implementation matches the shared contract.
const _bridge: EdgeApi = api
void _bridge

contextBridge.exposeInMainWorld('edge', api)
