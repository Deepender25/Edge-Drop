/**
 * Shared 30-second clock for relative-time labels ("5m ago").
 *
 * WHY: every card used to start its own setInterval. With hundreds of cards
 * that meant N independent timers firing at unaligned moments — N scattered
 * render passes across every 30s window, plus timer churn on every
 * mount/unmount while scrolling. One refcounted interval serves all
 * subscribers, producing a single batched render pass per tick.
 *
 * BEHAVIOUR PARITY: the old per-card intervals only ran while the panel was
 * open (cards stay mounted when the blade is closed — they are merely hidden).
 * This module mirrors that exactly: the interval exists only while there is
 * at least one subscriber AND the shelf is open, so idle cost stays zero.
 */
import { useEffect, useState } from 'react'
import { useStore } from '../store/appStore'

const TICK_MS = 30000

let tick = 0
let timer: number | undefined
let subscribers = 0
const listeners = new Set<() => void>()

function emit(): void {
  tick++
  for (const listener of listeners) listener()
}

function syncTimer(): void {
  const shouldRun = subscribers > 0 && useStore.getState().open
  if (shouldRun && timer === undefined) {
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
 * Subscribes the calling component to the shared clock. The component simply
 * re-renders on each tick so its `relativeTime(capturedAt)` label refreshes;
 * the returned value itself is intentionally unused.
 */
export function useRelativeTimeTick(): number {
  const [, force] = useState(0)

  useEffect(() => {
    const listener = (): void => force((n) => n + 1)
    listeners.add(listener)
    acquire()
    return () => {
      listeners.delete(listener)
      release()
    }
  }, [])

  return tick
}
