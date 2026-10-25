/**
 * Is a drag from another app in progress right now?
 *
 * The shelf window is click-through while closed, so it gets no drag events
 * until it is open and under the cursor. To let the edge bar get ready for a
 * drag before it arrives, the cursor poll asks this on each tick.
 *
 * Windows has no API for "a drag is in progress", but every drag that carries
 * a drag image (Explorer, browsers, Office, Electron and Chromium apps) shows
 * it in a small top-level shell window of class `SysDragImage` that exists
 * only for the length of the drag. A held mouse button plus that window is
 * the signal; the button is checked first, so a tick with no button held
 * costs one GetAsyncKeyState pair. Drags with no image are not seen here and
 * keep the old behaviour (open at the edge, drop zone on drag-enter).
 *
 * Our own drag-outs (cards dragged out of the shelf) also show that window;
 * main brackets them with setOwnDragActive so they are never mistaken for an
 * incoming drag.
 */
import koffi from 'koffi'

type GetAsyncKeyStateFn = (vKey: number) => number
type FindWindowFn = (className: string, windowName: null) => number | bigint

let getAsyncKeyState: GetAsyncKeyStateFn | null = null
let findWindow: FindWindowFn | null = null

if (process.platform === 'win32') {
  try {
    const user32 = koffi.load('user32.dll')
    getAsyncKeyState = user32.func('short GetAsyncKeyState(int vKey)') as GetAsyncKeyStateFn
    findWindow = user32.func('uintptr_t FindWindowW(str16 lpClassName, str16 lpWindowName)') as FindWindowFn
  } catch (err) {
    console.error('[ExternalDrag] Failed to load user32 functions via koffi:', err)
    getAsyncKeyState = null
    findWindow = null
  }
}

const VK_LBUTTON = 0x01
const VK_RBUTTON = 0x02
/** After our own drag-out ends, its drag image can linger a moment. */
const OWN_DRAG_TAIL_MS = 800

let ownDrag = false
let ownDragUntil = 0

/** Bracket a drag-out from the shelf (true before startDrag, false after). */
export function setOwnDragActive(active: boolean): void {
  ownDrag = active
  if (!active) ownDragUntil = Date.now() + OWN_DRAG_TAIL_MS
}

/** True while a drag from another app is in progress anywhere on screen. */
export function isExternalDragActive(now = Date.now()): boolean {
  if (!getAsyncKeyState || !findWindow) return false
  if (ownDrag || now < ownDragUntil) return false
  try {
    // Physical buttons (GetAsyncKeyState ignores the swap setting), and a
    // right-button drag is a drag too.
    const held = (getAsyncKeyState(VK_LBUTTON) & 0x8000) !== 0 || (getAsyncKeyState(VK_RBUTTON) & 0x8000) !== 0
    if (!held) return false
    return !!findWindow('SysDragImage', null)
  } catch {
    return false
  }
}
