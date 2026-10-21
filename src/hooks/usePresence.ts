import { useEffect, useRef, useState } from 'react'

/**
 * Keep something mounted for `exitMs` after `show` turns false, so a CSS exit
 * animation can play before it unmounts. Replaces AnimatePresence where the
 * motion itself is plain CSS (compositor-run, no per-frame JS).
 *
 * `leaving` is true while the exit plays. Showing again during the exit
 * cancels it. `onExited` runs once the element has unmounted.
 */
export function usePresence(show: boolean, exitMs: number, onExited?: () => void): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(show)
  const onExitedRef = useRef(onExited)
  onExitedRef.current = onExited

  useEffect(() => {
    if (show) {
      setMounted(true)
      return
    }
    if (!mounted) return
    const id = setTimeout(() => {
      setMounted(false)
      onExitedRef.current?.()
    }, exitMs)
    return () => clearTimeout(id)
  }, [show, mounted, exitMs])

  return { mounted: show || mounted, leaving: !show && mounted }
}
