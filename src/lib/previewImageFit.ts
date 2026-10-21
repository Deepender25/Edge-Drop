/**
 * How big to draw an image in the preview flyout, and how wide the flyout
 * should be for it.
 *
 * A fixed 440px flyout with a contain-fit image failed three ways: a
 * full-screen screenshot drew at ~20% (text unreadable), a long screenshot
 * became a thin sliver, and a small icon was blown up 8x and blurry. So:
 *  - the flyout widens (up to what the window allows) for wide images;
 *  - an image too tall to fit at a readable size is drawn at full width and
 *    the body scrolls, instead of shrinking it to a sliver;
 *  - nothing is enlarged past 2 image pixels per screen pixel.
 */

export interface PreviewImageFit {
  /** Outer width of the flyout (CSS px). */
  flyoutWidth: number
  /** Size the image is drawn at (CSS px). */
  width: number
  height: number
  /** Drawn taller than the body: the flyout body scrolls. */
  scroll: boolean
}

export interface PreviewImageBounds {
  /** Flyout width used for everything else; the image never narrows it. */
  minFlyoutWidth: number
  /** Widest the flyout may get here. */
  maxFlyoutWidth: number
  /** Room for the image inside the body (flyout height minus header, padding, label). */
  maxImageHeight: number
  /** Body padding left + right. */
  sidePadding: number
  devicePixelRatio: number
}

/** Most image pixels per screen pixel when enlarging a small image. */
export const MAX_UPSCALE = 2
/** Below this scale a height-fitted tall image is too small to read: scroll instead. */
export const MIN_READABLE_SCALE = 0.6
/**
 * Only images at least this much taller than wide scroll (phone and long
 * page screenshots, receipts). A portrait photo (2:3) still fits whole.
 */
export const TALL_ASPECT = 1.8

export function fitPreviewImage(imgW: number, imgH: number, b: PreviewImageBounds): PreviewImageFit {
  const minInner = Math.max(1, b.minFlyoutWidth - b.sidePadding)
  const maxInner = Math.max(minInner, b.maxFlyoutWidth - b.sidePadding)
  const maxH = Math.max(1, b.maxImageHeight)
  if (!(imgW > 0) || !(imgH > 0)) {
    return { flyoutWidth: b.minFlyoutWidth, width: minInner, height: Math.min(maxH, minInner), scroll: false }
  }
  // CSS px per image px at which the image would be enlarged MAX_UPSCALE times on screen.
  const dpr = Math.max(1, b.devicePixelRatio || 1)
  const upscaleCap = MAX_UPSCALE / dpr
  // Only an image wider than the normal flyout at its own size widens it;
  // a smaller one is never stretched just to fill a wider panel.
  const wide = imgW / dpr > minInner
  const boxW = wide ? maxInner : minInner
  // In the wider box an image is at most its own size (1 image px per screen px).
  const cap = wide ? Math.min(upscaleCap, 1 / dpr) : upscaleCap

  let scale = Math.min(cap, boxW / imgW, maxH / imgH)
  let scroll = false

  // Tall image that would be shrunk to an unreadable sliver: draw it as wide
  // as allowed and let the body scroll.
  if (scale < MIN_READABLE_SCALE && imgH / imgW >= TALL_ASPECT && maxH / imgH < boxW / imgW) {
    scale = Math.min(cap, boxW / imgW)
    scroll = imgH * scale > maxH
  }

  const width = Math.max(1, Math.round(imgW * scale))
  const height = Math.max(1, Math.round(imgH * scale))
  const flyoutWidth = Math.min(b.maxFlyoutWidth, Math.max(b.minFlyoutWidth, width + b.sidePadding))
  return { flyoutWidth, width, height, scroll }
}
