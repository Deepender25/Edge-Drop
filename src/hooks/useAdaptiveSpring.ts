import { useMemo } from 'react'

/**
 * Returns Framer Motion spring presets calibrated to the current display.
 *
 * Goals:
 *  - Critically damped (ratio ≥ 1.0) — settles without overshoot or ring.
 *  - restDelta / restSpeed as tight as possible — Framer exits the animation
 *    loop the moment motion is sub-pixel, freeing the compositor immediately.
 *  - Hi-DPI: stiffer + heavier damping because sub-pixel overshoot is
 *    more visible at 2× and the GPU fill-rate budget is tighter on 4K.
 */
export function useAdaptiveSpring() {
  return useMemo(() => {
    const dpr = window.devicePixelRatio || 1
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReducedMotion) {
      return { type: 'tween', duration: 0.01 } as const
    }

    if (dpr >= 1.75) {
      return {
        type: 'spring',
        stiffness: 520,
        damping: 42,
        mass: 0.5,
        restDelta: 0.4,
        restSpeed: 10
      } as const
    }

    return {
      type: 'spring',
      stiffness: 480,
      damping: 40,
      mass: 0.5,
      restDelta: 0.4,
      restSpeed: 10
    } as const
  }, [])
}

/**
 * A gentler spring for secondary surfaces (flyout content, settings panes).
 * Slightly slower stiffness so it doesn't feel abrupt against the blade motion.
 */
export function useSubtleSpring() {
  return useMemo(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return { type: 'tween', duration: 0.01 } as const

    return {
      type: 'spring',
      stiffness: 480,
      damping: 40,
      mass: 0.5,
      restDelta: 0.4,
      restSpeed: 10
    } as const
  }, [])
}
