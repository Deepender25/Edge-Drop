/**
 * Where the edge trigger bar sits and how it is shaped, so the onboarding can
 * draw the real one: on the laptop's screen in the welcome and settings frames
 * (scaled from the user's actual screen), and at the top of the window where
 * the real shelf's closed bar is (Panel), which the drawn bar hands over to.
 *
 * Same numbers as Panel: the bar's length along the edge comes from the trigger
 * zone size (hotZoneHeight), its thickness from hotZoneWidth, and its ends
 * taper over 24px like the closed blade's clip (EDGE_BAR_RADIUS in Panel).
 */
import type { CSSProperties } from 'react'
import type { Settings, StickPosition } from '../../shared/types'

/**
 * The tour's shelf is drawn at the size it has on a real monitor: the window
 * stands for a whole screen, so the real Panel is laid out for this window and
 * scaled down from the top edge (see .ob-shelf). Without it the shelf would
 * span nearly the whole window, far bigger than it ever looks on a desktop.
 */
export const SHELF_SCALE = 0.72

/** The laptop frame's screen, in window pixels (see .ob-bezel). */
export const LAPTOP_SCREEN = { left: 48, top: 18, width: 704, height: 390 }

/**
 * The tour's camera on the laptop (.ob-cam.is-tour): pushed in on the top edge
 * so the top of the laptop (bezel, rounded corners, a little sky above) stays
 * in view and the screen fills the window below it.
 * Must match the CSS: transform-origin 400px 10px; scale(1.125).
 * The scale puts the screen's top edge on a whole pixel (10 + 8 * 1.125 = 19), so the bezel's inner edge
 * and the shelf's top meet exactly; at a fractional edge both blend with the sky and leave a blue seam.
 */
const TOUR = { scale: 1.125, ox: 400, oy: 10, ty: 0 }
/** Where the screen's top edge lands in the window in the tour (the shelf hangs from it). */
export const TOUR_SCREEN_TOP = TOUR.oy + (LAPTOP_SCREEN.top - TOUR.oy) * TOUR.scale + TOUR.ty

/** Length of the top dock's bar (Panel: triggerWidthPx). */
function topBarLength(hotZoneHeight: number): number {
  return hotZoneHeight >= 0.55 ? 575 : hotZoneHeight >= 0.35 ? 400 : 275
}

function radius(pos: StickPosition, corner: number): string {
  if (pos === 'top') return `0 0 ${corner}px ${corner}px / 0 0 100% 100%`
  if (pos === 'left') return `0 100% 100% 0 / 0 ${corner}px ${corner}px 0`
  return `100% 0 0 100% / ${corner}px 0 0 ${corner}px`
}

type BarSettings = Pick<Settings, 'hotZoneHeight' | 'hotZoneWidth'> & Partial<Pick<Settings, 'panelHeight' | 'verticalOffset'>>

/**
 * The bar on the laptop's top edge in the welcome frame, sized so that after
 * the tour's push-in it is exactly the real shelf's closed bar (Panel's bar,
 * scaled with the shelf): it stays attached to the edge through the zoom and
 * the shelf takes over in the same spot. In the laptop's own pixels.
 */
export function tourBar(s: BarSettings): CSSProperties {
  const k = SHELF_SCALE / TOUR.scale
  const length = topBarLength(s.hotZoneHeight) * k
  return {
    left: TOUR.ox - length / 2,
    top: LAPTOP_SCREEN.top,
    width: length,
    height: (s.hotZoneWidth || 3) * k,
    borderRadius: radius('top', 24 * k)
  }
}

/** From window pixels to the shelf layer's own pixels (it hangs from the screen's top edge, scaled from its middle). */
export function toShelfLayer(r: { left: number; top: number; width: number; height: number }, windowWidth = 800) {
  const cx = windowWidth / 2
  return {
    x: cx + (r.left - cx) / SHELF_SCALE,
    y: (r.top - TOUR_SCREEN_TOP) / SHELF_SCALE,
    width: r.width / SHELF_SCALE,
    height: r.height / SHELF_SCALE
  }
}

/** The bar on the laptop's screen: the user's screen scaled down to the frame. */
export function laptopBar(pos: StickPosition, s: BarSettings): CSSProperties {
  const screenW = window.screen?.width || 1920
  const screenH = window.screen?.height || 1080
  const k = LAPTOP_SCREEN.width / screenW
  // Scaled 1:1 the bar would be ~1px thick; keep it visible.
  const thick = Math.max(2, Math.round((s.hotZoneWidth || 3) * k * 1.4))
  const corner = 24 * k
  if (pos === 'top') {
    const length = topBarLength(s.hotZoneHeight) * k
    return {
      left: LAPTOP_SCREEN.left + LAPTOP_SCREEN.width / 2 - length / 2,
      top: LAPTOP_SCREEN.top,
      width: length,
      height: thick,
      borderRadius: radius('top', corner)
    }
  }
  // Side docks: the bar is centred on the shelf's middle, as in Panel.
  const length = screenH * s.hotZoneHeight * k
  const panelH = (s.panelHeight || 0.6) * LAPTOP_SCREEN.height
  const mid = panelH / 2 + (s.verticalOffset ?? 0.5) * (LAPTOP_SCREEN.height - panelH)
  return {
    left: pos === 'left' ? LAPTOP_SCREEN.left : LAPTOP_SCREEN.left + LAPTOP_SCREEN.width - thick,
    top: LAPTOP_SCREEN.top + mid - length / 2,
    width: thick,
    height: length,
    borderRadius: radius(pos, corner)
  }
}
