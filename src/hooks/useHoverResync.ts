import { useEffect } from 'react'
import { useStore } from '../store/appStore'
import { edge } from '../lib/edge'

/** After a change, re-check soon, and again once card motion has settled. */
const RESYNC_DELAYS_MS = [60, 400] as const
/** A scroll counts as settled after this long without a scroll event. */
const SCROLL_SETTLE_MS = 80

/**
 * Keep hover (the cards' action buttons) on the card that is really under
 * the pointer. Chromium re-hit-tests only on a mouse move, so when cards
 * are added, removed or reordered under a still pointer (a new copy, paste
 * moving an item to the top, delete, expanding a stack, the shelf opening,
 * scrolling with the wheel or trackpad) the buttons stayed on the card that
 * moved away until the mouse moved.
 * On such changes this asks main for one real mouse-move at the cursor's
 * spot (main skips it when the cursor is not over the window).
 *
 * Skipped while a button is held or something is being dragged, so it can
 * never interfere with a press, a drag or a slider.
 */
export function useHoverResync(root: HTMLElement | null): void {
  useEffect(() => {
    if (!root || typeof MutationObserver === 'undefined') return
    let pressed = false
    const timers: number[] = []
    const onDown = (): void => { pressed = true }
    const onUp = (): void => { pressed = false }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)

    const fire = (): void => {
      const s = useStore.getState()
      if (!s.open || pressed || s.dragActive || s.internalDragReq) return
      try {
        edge.resyncHover?.()
      } catch { /* ignore */ }
    }
    const schedule = (): void => {
      if (timers.length > 0) return // one pending round covers a burst of changes
      for (const ms of RESYNC_DELAYS_MS) {
        timers.push(window.setTimeout(() => {
          timers.shift()
          fire()
        }, ms))
      }
    }

    const observer = new MutationObserver(schedule)
    observer.observe(root, { childList: true, subtree: true })
    // the list scrolling under a still pointer: once, when the scroll settles.
    // Wheel, trackpad and smooth scrolls run as a stream of scroll events (the
    // top dock turns each wheel step into its own instant scroll, so
    // 'scrollend' would fire per step; a short quiet period covers both).
    let scrollTimer = 0
    const onScroll = (): void => {
      window.clearTimeout(scrollTimer)
      scrollTimer = window.setTimeout(fire, SCROLL_SETTLE_MS)
    }
    const doc = root.ownerDocument
    doc.addEventListener('scroll', onScroll, { capture: true, passive: true })
    // the shelf finishing its open under a still pointer
    const unsubOpen = useStore.subscribe((s, prev) => {
      if (s.open && !prev.open) schedule()
    })

    return () => {
      observer.disconnect()
      unsubOpen()
      for (const t of timers) window.clearTimeout(t)
      window.clearTimeout(scrollTimer)
      doc.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
    }
  }, [root])
}
