/**
 * useDragOut — drives the native OS drag from the `dragstart` event.
 *
 * Because the real drag is owned by the OS once it starts, we fire it
 * synchronously inside the `dragstart` handler (no async IPC). The
 * preload bridge uses `ipcRenderer.send` (fire-and-forget) and the main
 * process calls `event.sender.startDrag(...)` — the only Electron path
 * that reliably works on Windows for non-text items.
 *
 * For text items the caller should use the native HTML5 drag API directly
 * (setData on the DataTransfer) and should NOT call this hook.
 */
import { useCallback } from 'react'
import { edge } from '../lib/edge'
import { useStore } from '../store/appStore'
import type { DragRequest } from '../../shared/types'

export function useDragOut() {
  return useCallback((req: DragRequest) => {
    useStore.getState().setInternalDragReq(req)
    edge.startDrag(req)
  }, [])
}
