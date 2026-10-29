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

/**
 * The shelf layer's transform: hung from the screen's top edge in the tour, or (welcome) on the whole
 * laptop, smaller by the camera's push-in. Both are linear in the camera's progress, so with the same
 * transition as .ob-cam the shelf rides the push-in fixed to the screen edge.
 */
export const shelfTransform = (cam: 'frame' | 'tour') =>
  cam === 'tour'
    ? `translateY(${TOUR_SCREEN_TOP}px) scale(${SHELF_SCALE})`
    : `translateY(${LAPTOP_SCREEN.top}px) scale(${SHELF_SCALE / TOUR.scale})`

/**
 * The screen the last step shows the shelf on, on each edge: a 1920 x 1080 monitor at 100% display
 * scale, drawn on the laptop's screen. The shelf is laid out as on that monitor (.ob-shelf.is-real), so
 * on every edge it is the size it really is there, in proportion to the screen.
 */
export const REAL_SCREEN = { width: 1920, height: 1080 }

/** The laptop screen's height is that monitor's: everything on it at this scale. */
const REAL_SCALE = LAPTOP_SCREEN.height / REAL_SCREEN.height

/**
 * How far (window pixels) the shelf is tucked under the bezel on the edge it is docked to. Edge to edge,
 * the bezel's and the shelf's edges each cover part of the same row of pixels wherever that falls between
 * pixels (any display scale but 100% and 200%, or mid camera move), and the wallpaper behind showed
 * through between them as a line. Tucked under, the bezel's edge always lies over the shelf's black.
 * The closed bar is that much thicker (realHotZoneWidth), so what shows of it is its real thickness.
 */
const TUCK = 1

/**
 * The shelf layer, laid out as that monitor, on the laptop's screen: its top on the screen's top, and its
 * side on the screen's side for a side edge (the monitor is a touch narrower than the laptop's wide
 * screen), its middle on the screen's middle for the top; tucked under the bezel on its edge (TUCK). It
 * scales from the middle of its top edge (see .ob-shelf).
 */
export function realScreenTransform(dock: StickPosition): string {
  const k = REAL_SCALE
  const half = REAL_SCREEN.width / 2
  const x =
    dock === 'left'
      ? LAPTOP_SCREEN.left - TUCK - half * (1 - k)
      : dock === 'right'
        ? LAPTOP_SCREEN.left + LAPTOP_SCREEN.width + TUCK - half * (1 + k)
        : LAPTOP_SCREEN.left + LAPTOP_SCREEN.width / 2 - half
  const y = LAPTOP_SCREEN.top - (dock === 'top' ? TUCK : 0)
  return `translate(${x}px, ${y}px) scale(${k})`
}

/** The closed bar's thickness laid out on that monitor, with the part tucked under the bezel added. */
export const realHotZoneWidth = (hotZoneWidth: number) => hotZoneWidth + TUCK / REAL_SCALE

/**
 * Where a side edge's shelf sits on that monitor (Panel lays it out from the window's height: its height
 * and its middle, from panelHeight and verticalOffset, are given to .ob-shelf.is-real here instead).
 */
export function realSidePanel(panelHeight: number, verticalOffset: number): { height: number; middle: number } {
  const height = panelHeight * REAL_SCREEN.height
  return { height, middle: height / 2 + verticalOffset * (REAL_SCREEN.height - height) }
}

/**
 * The tour's trigger zone length for a side edge laid out as that monitor: Panel takes it as a share of
 * the window's height, the window being shorter than the monitor (`windowHeight`).
 */
export const realSideHotZone = (hotZoneHeight: number, windowHeight: number) =>
  Math.min(1, (hotZoneHeight * REAL_SCREEN.height) / windowHeight)

/** Length of the top dock's bar (Panel: triggerWidthPx). */
export function topBarLength(hotZoneHeight: number): number {
  return hotZoneHeight >= 0.55 ? 575 : hotZoneHeight >= 0.35 ? 400 : 275
}

/** The top bar's tapered ends (Panel's closed blade clip). */
const topRadius = (corner: number) => `0 0 ${corner}px ${corner}px / 0 0 100% 100%`

type BarSettings = Pick<Settings, 'hotZoneHeight' | 'hotZoneWidth'>

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
    borderRadius: topRadius(24 * k)
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
