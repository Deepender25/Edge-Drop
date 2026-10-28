/**
 * The tour's camera: the scene in front of the wallpaper (the laptop, the
 * shelf, the other apps, the pointer and what it drags) sits under one lens
 * that pushes in on wherever the action is and pulls back to show where it
 * lands, the way screen recordings do. The wallpaper stays behind it (its
 * crisp dither would break up when scaled), and the step's text, dots,
 * buttons and the Ctrl+C keys are outside it and never move.
 *
 * A move is a scale transform (smooth to animate); once the camera has
 * arrived it holds with CSS zoom instead, which lays the scene out at the
 * zoomed size, so held text and cards are drawn crisp rather than stretched.
 *
 * The camera makes a few decisive moves, it does not drift: each step
 * pushes in once where its action starts, holds still through the fine work,
 * and pulls back with the pointer as the action reaches its destination.
 * Demos measure everything in scene pixels (toLocal), which the lens leaves
 * untouched, so the pointer lands on the same card whatever the camera does.
 * Under reduced motion the lens stays at rest.
 */

/** The scene the lens covers, in its own pixels. */
const W = 800

/** The camera's own moves: they ease in (no lurch) and land without a long creep. */
export const CAM = 'cubic-bezier(.5,0,.25,1)'

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/** A framing: scale `k`, then a move by (x, y), from the scene's top-left corner. */
export interface View {
  k: number
  x: number
  y: number
}

export const REST: View = { k: 1, x: 0, y: 0 }

const reduced = () => document.documentElement.dataset.motion === 'reduce'

/** Where each lens is headed (its last framing), for placing things outside it. */
const target = new WeakMap<HTMLElement, View>()
/** The pending switch to a held framing, per lens. */
const holding = new WeakMap<HTMLElement, number>()

const atRest = (v: View) => v.k === 1 && v.x === 0 && v.y === 0
const moving = (v: View) => (atRest(v) ? 'none' : `translate(${v.x}px, ${v.y}px) scale(${v.k})`)

/** Arrived: hold `v` with CSS zoom (the move's translate is in zoomed pixels there, hence / k). */
function hold(lens: HTMLElement, v: View) {
  lens.classList.remove('is-moving')
  lens.style.transition = 'none'
  lens.style.zoom = atRest(v) ? '' : String(v.k)
  lens.style.transform = atRest(v) ? 'none' : `translate(${v.x / v.k}px, ${v.y / v.k}px)`
}

/**
 * A framing at scale `k` that puts the scene point `focus` at the window point `at`. It never shows past
 * the laptop's sides, nor (unless `free`) above the screen's top edge.
 */
export function aim(k: number, focus: { x: number; y: number }, at: { x: number; y: number }, free = false): View {
  const x = Math.min(0, Math.max(W * (1 - k), at.x - focus.x * k))
  const y = free ? at.y - focus.y * k : Math.min(0, at.y - focus.y * k)
  return { k, x: Math.round(x), y: Math.round(y) }
}

/** Move the camera to `v` over `ms`. */
export function zoomTo(lens: HTMLElement, v: View, ms: number, easing = CAM): void {
  const from = target.get(lens) ?? REST
  target.set(lens, v)
  if (reduced()) return
  // already there, or on its way there: let it be
  if (from.k === v.k && from.x === v.x && from.y === v.y) return
  clearTimeout(holding.get(lens))
  holding.delete(lens)
  if (lens.style.zoom) {
    // from a held framing back to the same picture as a transform, so the move can animate from it
    lens.style.transition = 'none'
    lens.style.zoom = ''
    lens.style.transform = moving(from)
    void lens.offsetWidth
  }
  if (ms <= 0) {
    hold(lens, v)
    return
  }
  // while it moves, the cards' pictures stay on their pre-drawn layers (cheap to move; see .ob-shelf in
  // onboarding.css); once it holds they are drawn again at the size they are shown
  lens.classList.add('is-moving')
  lens.style.transition = `transform ${ms}ms ${easing}`
  lens.style.transform = moving(v)
  holding.set(lens, window.setTimeout(() => {
    holding.delete(lens)
    hold(lens, v)
  }, ms + 40))
}

/** Back to the whole scene. */
export function zoomRest(lens: HTMLElement, ms: number, easing = CAM): void {
  zoomTo(lens, REST, ms, easing)
}

/** A scene point where it will be in the window once the camera has arrived. */
export function toScreen(lens: HTMLElement, p: { x: number; y: number }): { x: number; y: number } {
  const v = reduced() ? REST : (target.get(lens) ?? REST)
  return { x: p.x * v.k + v.x, y: p.y * v.k + v.y }
}

/** A client rect in scene pixels, whatever the lens (and the intro's scene scale) is doing right now. */
export function toLocal(lens: HTMLElement, r: DOMRect): Rect {
  const b = lens.getBoundingClientRect()
  const s = b.width / W || 1
  const left = (r.left - b.left) / s
  const top = (r.top - b.top) / s
  const width = r.width / s
  const height = r.height / s
  return { left, top, width, height, right: left + width, bottom: top + height }
}
