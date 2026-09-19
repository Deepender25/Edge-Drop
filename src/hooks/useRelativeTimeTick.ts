/**
 * Shared clock for relative-time labels ("5m ago").
 *
 * One interval for the whole list (ItemList subscribes once and passes the
 * tick into memoized cards). Idle: the timer runs only while the shelf is
 * open. On open it fires immediately so labels are not stuck on "just now"
 * from the previous visit — copying in another app closes the shelf before
 * a long interval would ever elapse.
 */
import { useEffect, useState } from 'react'
import { useStore } from '../store/appStore'

/** While the shelf is open, refresh relative time labels periodically (30s). */
const TICK_MS = 30000

let timer: number | undefined
let subscribers = 0
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function syncTimer(): void {
  const shouldRun = subscribers > 0 && useStore.getState().open
  if (shouldRun && timer === undefined) {
    // Start periodic interval while open without emitting synchronously on the open animation frame
    timer = window.setInterval(emit, TICK_MS)
  } else if (!shouldRun && timer !== undefined) {
    window.clearInterval(timer)
    timer = undefined
  }
}

function acquire(): void {
  subscribers++
  syncTimer()
}

function release(): void {
  subscribers--
  if (subscribers <= 0) subscribers = 0
  syncTimer()
}

// Keep the clock gated on panel visibility (parity with the old per-card
// behaviour). Wired once at module load; the listener itself does nothing
// unless the open flag actually flipped.
if (typeof window !== 'undefined') {
  let lastOpen = !!useStore.getState().open
  useStore.subscribe((state) => {
    if (!!state.open === lastOpen) return
    lastOpen = !!state.open
    syncTimer()
  })
}

/**
 * Subscribes the calling component to the shared clock. The returned tick
 * must be passed into memoized cards so they re-render and recompute
 * `relativeTime(capturedAt)`.
 */
export function useRelativeTimeTick(): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    const listener = (): void => setValue((n) => n + 1)
    listeners.add(listener)
    acquire()
    return () => {
      listeners.delete(listener)
      release()
    }
  }, [])

  return value
}
