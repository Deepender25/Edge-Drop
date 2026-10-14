/**
 * Outline of the copy indicator: a small liquid tab that grows out of the
 * edge bar.
 *
 * The profile is a box (half-length A, depth DEPTH) softened by a Gaussian
 * of width SOFTNESS. That gives a flat cap for the icon, rounded shoulders,
 * and concave feet that melt back into the bar, with no corners anywhere.
 * It starts and ends at the bar's own thickness, so the tab and the bar read
 * as one shape.
 *
 * Coordinates are for a left dock: x points away from the screen edge, y
 * runs along it, and (0, 0) is the middle of the tab on the edge. Other
 * docks mirror or rotate it in CSS.
 */

/** How far the tab reaches out from the screen edge, in px. */
export const COPY_TAB_DEPTH = 48
const A = 30
const SOFTNESS = 10
/** Points sampled along the outline (smoothed into cubic curves). */
const SAMPLES = 48
/** The closed outline runs this far behind the screen edge so no gap shows. */
const BEHIND_EDGE = 40

// Abramowitz & Stegun 7.1.26 (max error 1.5e-7): plenty for drawing.
function erf(v: number): number {
  const s = Math.sign(v)
  const x = Math.abs(v)
  const t = 1 / (1 + 0.3275911 * x)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-x * x)
  return s * y
}

/** Distance of the outline from the screen edge at position y along it. */
export function copyTabProfile(y: number, barWidth: number): number {
  const box = 0.5 * (erf((A - y) / SOFTNESS) + erf((A + y) / SOFTNESS))
  return barWidth + (COPY_TAB_DEPTH - barWidth) * (box / erf(A / SOFTNESS))
}

/**
 * Closed SVG path for the tab plus its half-length along the edge.
 * The ends stop once the outline is within 0.05px of the bar.
 */
export function copyTabPath(barWidth: number): { d: string; halfLength: number } {
  const bar = Math.max(0, barWidth)
  let half = A
  while (copyTabProfile(half, bar) - bar > 0.05) half += 0.5

  const pts: Array<[number, number]> = []
  for (let i = 0; i <= SAMPLES; i++) {
    const y = -half + (2 * half * i) / SAMPLES
    pts.push([copyTabProfile(Math.abs(y), bar), y])
  }
  const r = (v: number) => +v.toFixed(2)
  let d = `M ${-BEHIND_EDGE} ${r(-half)} L ${r(pts[0][0])} ${r(pts[0][1])}`
  // Catmull-Rom through the samples, written as cubic Beziers.
  for (let i = 0; i < SAMPLES; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(SAMPLES, i + 2)]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${r(c1x)} ${r(c1y)} ${r(c2x)} ${r(c2y)} ${r(p2[0])} ${r(p2[1])}`
  }
  d += ` L ${-BEHIND_EDGE} ${r(half)} Z`
  return { d, halfLength: half }
}

export const COPY_TAB_BEHIND_EDGE = BEHIND_EDGE

/**
 * Centre of the visible edge bar, in window px, along the edge.
 * Mirrors the trigger-bar placement in Panel.tsx (alignment + offsets) so
 * the tab always grows out of the bar itself.
 */
export function edgeBarCenter(
  settings: {
    stickPosition?: string
    panelHeight?: number
    verticalOffset?: number
    hotZoneHeight?: number
    triggerAlignment?: string
  },
  viewport: { width: number; height: number }
): number {
  const alignment = settings.triggerAlignment || 'center'
  if (settings.stickPosition === 'top') {
    const bladeW = Math.min(viewport.width - 60, 1080)
    const hz = settings.hotZoneHeight ?? 0.25
    const barW = hz >= 0.55 ? 575 : hz >= 0.35 ? 400 : 275
    const mid = viewport.width / 2
    if (alignment === 'top' || alignment === 'left') return mid - bladeW / 2 + barW / 2
    if (alignment === 'bottom' || alignment === 'right') return mid + bladeW / 2 - barW / 2
    return mid
  }
  const screenH = viewport.height
  const panelH = screenH * (settings.panelHeight || 0.6)
  const minY = panelH / 2
  const maxY = screenH - panelH / 2
  const midY = Math.round(minY + (settings.verticalOffset ?? 0.5) * (maxY - minY))
  const barH = Math.round(screenH * (settings.hotZoneHeight ?? 0.25))
  if (alignment === 'top') return midY - panelH / 2 + barH / 2
  if (alignment === 'bottom') return midY + panelH / 2 - barH / 2
  return midY
}
