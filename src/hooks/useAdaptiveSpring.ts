import { useMemo } from 'react'

export function useAdaptiveSpring() {
  return useMemo(() => {
    const dpr = window.devicePixelRatio || 1
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReducedMotion) {
      // Instant transition
      return { type: 'tween', duration: 0.01 }
    }

    if (dpr >= 1.75) {
      // Hi-DPI (2x+): Stiffer, higher damping to settle in fewer frames.
      // Reduces GPU compositor work on 4K displays where fill-rate is a bottleneck.
      return { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }
    }

    // Standard DPI: Default smooth spring
    return { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 }
  }, [])
}
