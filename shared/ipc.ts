/**
 * Single source of truth for IPC channel names and their payload contracts.
 *
 * The preload bridge is generated from these contracts so the renderer never
 * touches a raw string channel name and the main handler signatures stay in
 * sync with the renderer calls.
 *
 * Convention:
 *   - `Renderer -> Main` calls (invoke/handle) are listed in `InvokeMap`.
 *   - `Main -> Renderer` events (send/on) are listed in `EventMap`.
 */
import type { ClipboardItemDto, DragRequest, MergeResult, Settings } from './types'

/* ------------------------------------------------------------------ */
/* Renderer -> Main  (ipcMain.handle / ipcRenderer.invoke)            */
/* ------------------------------------------------------------------ */

export interface InvokeMap {
  /** Returns the full current item list + settings on startup. */
  'state:load': { args: []; result: { items: ClipboardItemDto[]; settings: Settings; version: string } }

  /** Set an item's pinned state. */
  'item:set-pinned': { args: [id: string, pinned: boolean]; result: ClipboardItemDto[] }

  /** Delete a single item (and its image file if present). */
  'item:delete': { args: [id: string]; result: ClipboardItemDto[] }

  /** Delete every unpinned item. */
  'item:clear': { args: []; result: ClipboardItemDto[] }

  /** Remove a specific sub-item from a bundle. */
  'item:remove-subitem': { args: [req: DragRequest]; result: boolean }

  /** Copy an item back onto the system clipboard. */
  'item:copy': { args: [id: string]; result: boolean }

  /** Copy a single sub-item (one file of a bundle, or one image of a
   *  collection) onto the system clipboard. */
  'item:copy-subitem': { args: [req: DragRequest]; result: boolean }

  /** Copy an item and paste it directly into the active application. */
  'item:paste': { args: [id: string]; result: boolean }

  /** Copy a sub-item and paste it directly into the active application. */
  'item:paste-subitem': { args: [req: DragRequest]; result: boolean }

  /** Add local file paths dragged into the shelf. */
  'item:add-files': { args: [paths: string[]]; result: ClipboardItemDto[] }

  /** Merge an item into another. Returns why it failed (full / incompatible). */
  'item:merge': { args: [sourceId: string, targetId: string]; result: MergeResult }

  /** Split a sub-item out of a bundle into a new standalone item. */
  'item:split': { args: [req: DragRequest]; result: boolean }

  /** Update a persisted setting. */
  'settings:update': { args: [patch: Partial<Settings>]; result: Settings }

  /** Toggle whether the window is interactive (mouse-ignore). */
  'window:set-interactive': { args: [interactive: boolean]; result: void }

  /** Minimize the window (used by Onboarding). */
  'window:minimize': { args: []; result: void }

  /** Check for application updates on GitHub releases. */
  'app:check-update': { args: []; result: { latestVersion: string; downloadUrl: string } | null }

  /** Get the list of connected displays. */
  'displays:list': { args: []; result: import('./types').DisplayInfo[] }
}

/* ------------------------------------------------------------------ */
/* Main -> Renderer  (webContents.send / ipcRenderer.on)              */
/* ------------------------------------------------------------------ */

export interface EventMap {
  /** Full new item list whenever the history changes. */
  'state:items': [items: ClipboardItemDto[]]
  /** Settings changed (e.g. from the tray menu). */
  'state:settings': [settings: Settings]
  /** Toggle the panel open/closed from the main process (e.g. tray). */
  'window:toggle': [open?: boolean]
  /** Open the panel directly to settings from the main process (e.g. tray). */
  'window:open-settings': []
  /** Fired when an OS drag initiated by the app has completed. */
  'item:drag-end': []
  /** Tutorial step sync */
  'tutorial:step': [step: number]
  /** Internal drop triggered by the main process when startDrag ends inside the window */
  'item:internal-drop': [pos: { x: number; y: number }]
  /**
   * Transient user-facing notice (e.g. "Stack is full (10 max)"). The renderer
   * shows it as a toast; `id` lets it dedupe/dismiss.
   */
  'ui:toast': [toast: { id: string; message: string; tone: 'info' | 'error' }]
  /**
   * Main-process cursor poll signals: fired when the cursor enters/leaves
   * the screen-edge hot zone. The renderer uses this to open/close the panel
   * instead of relying on `forward:true` pointermove (which is unreliable on
   * Windows transparent windows).
   * payload: { x, y, inEdge, inZone }
   */
  'window:cursor-edge': [data: {
    x: number
    y: number
    inEdge: boolean
    inZone: boolean
    stickPosition: import('./types').StickPosition
    displayWidth: number
    displayHeight: number
  }]
}

/* ------------------------------------------------------------------ */
/* Renderer -> Main  (ipcMain.on / ipcRenderer.send) — fire & forget  */
/* ------------------------------------------------------------------ */
//
// Used for time-critical, one-way gestures where the renderer must not block
// on a round-trip. The canonical example is native drag-out: Electron's
// `startDrag` only works when called synchronously from the `dragstart` event,
// so the renderer `send`s the request and main calls `event.sender.startDrag`.
export interface SendMap {
  /** Begin a native OS drag of an item (or one file of a bundle) out of the app. */
  'item:start-drag': { args: [req: DragRequest] }
  /** Synchronize tutorial step */
  'tutorial:set-step': { args: [step: number] }
}

/* ------------------------------------------------------------------ */
/* Keys                                                                */
/* ------------------------------------------------------------------ */

/** Typed keyof helpers so channel names can never drift. */
export const INVOKE_CHANNELS = Object.keys({} as InvokeMap) as (keyof InvokeMap)[]
export const EVENT_CHANNELS = Object.keys({} as EventMap) as (keyof EventMap)[]
export const SEND_CHANNELS = Object.keys({} as SendMap) as (keyof SendMap)[]

export type InvokeChannel = keyof InvokeMap
export type EventChannel = keyof EventMap
export type SendChannel = keyof SendMap

/** Argument tuple for an invoke channel. */
export type InvokeArgs<C extends InvokeChannel> = InvokeMap[C]['args']
/** Return type for an invoke channel. */
export type InvokeResult<C extends InvokeChannel> = InvokeMap[C]['result']
/** Argument tuple for an event channel. */
export type EventArgs<C extends EventChannel> = EventMap[C]
/** Argument tuple for a fire-and-forget send channel. */
export type SendArgs<C extends SendChannel> = SendMap[C]['args']
