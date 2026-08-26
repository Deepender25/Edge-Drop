/**
 * Internal-drag boomerang guard — pure state machine.
 *
 * PROBLEM
 * -------
 * When Edge-Drop exports an item via a native OS drag and the user drops it
 * back onto our own window, Windows delivers that drop ASYNCHRONOUSLY after
 * the OLE loop returns — sometimes well over a second later on loaded
 * systems. Without protection the delivered files re-enter item:add-files
 * as a fresh import (self-drop duplication).
 *
 * INVARIANT (physics, not timing)
 * -------------------------------
 * There is exactly one mouse. After one of OUR drags starts, the FIRST drop
 * event observed is ours — no human can start dragging a file from Explorer
 * into us before finishing the current gesture. Therefore:
 *
 *   armed  : from our dragstart until the first drop is consumed
 *   drop   : while armed => ours => swallow + consume back to idle
 *   dragEnd: begins 'releasing' — a grace window (GUARD_AUTO_IDLE_MS) that
 *            still swallows late-deferred deliveries, then self-heals to
 *            idle so external imports can never be permanently blocked.
 *
 * The 'armed' phase intentionally has NO timer: Chromium synthesizes
 * dragend reliably (including Esc-cancel), and a mid-gesture expiry would
 * unprotect the boomerang. Worst case if dragend were never fired (crash-
 * level defect): ONE external import gets swallowed, then the machine
 * self-heals via that very consume.
 *
 * Pure reducer + explicit events so every transition is unit-testable.
 */

export type GuardPhase = 'idle' | 'armed' | 'releasing'

export interface GuardState {
  phase: GuardPhase
  /** Absolute deadline when phase === 'releasing'. */
  fireAt: number | null
}

/** Grace window after dragEnd that still swallows deferred deliveries. */
export const GUARD_AUTO_IDLE_MS = 1500

export type GuardEvent =
  | { type: 'arm' }
  | { type: 'dragEnd'; now: number }
  | { type: 'drop' }
  | { type: 'tick'; now: number }

const IDLE: GuardState = { phase: 'idle', fireAt: null }

export function reduceGuard(state: GuardState, event: GuardEvent): GuardState {
  switch (event.type) {
    case 'arm':
      // Re-arming at any time (redundant dragstart, new gesture) yields a
      // clean armed phase and cancels any pending release.
      return { phase: 'armed', fireAt: null }

    case 'drop':
      // First drop while armed/releasing is OURS by the single-mouse
      // invariant: consume it and return to idle. Drops while idle are not
      // routed through the reducer at all (external imports flow normally).
      return IDLE

    case 'dragEnd':
      if (state.phase !== 'armed') return state
      return { phase: 'releasing', fireAt: event.now + GUARD_AUTO_IDLE_MS }

    case 'tick':
      if (state.phase !== 'releasing' || state.fireAt === null) return state
      if (event.now >= state.fireAt) return IDLE
      return state

    default:
      return state
  }
}

/** Convenience predicate used by the drop listener. */
export function isGuarded(state: GuardState): boolean {
  return state.phase !== 'idle'
}
