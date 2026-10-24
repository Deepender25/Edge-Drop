import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const panel = read('src/components/Panel.tsx')
const css = read('src/styles/panel.css')

function motion(name: string): { ms: number; points: Array<[number, number]> } {
  const m = panel.match(new RegExp(`const ${name} =\\s*'clip-path (\\d+)ms linear\\(([^)]*)\\)'`))
  if (!m) throw new Error(`${name} not found`)
  const parts = m[2].split(',').map((s) => s.trim())
  const points = parts.map((p, i): [number, number] => {
    const [v, pct] = p.split(/\s+/)
    return [Number(v), pct ? Number(pct.replace('%', '')) / 100 : i === 0 ? 0 : 1]
  })
  return { ms: Number(m[1]), points }
}

// Spring step response with initial velocity v0 (SwiftUI-style response / damping).
function spring(t: number, response: number, damping: number, v0: number): number {
  const w0 = (2 * Math.PI) / response
  if (damping >= 1) return 1 - Math.exp(-w0 * t) * (1 + (w0 - v0) * t)
  const wd = w0 * Math.sqrt(1 - damping * damping)
  const a = damping * w0
  return 1 - Math.exp(-a * t) * (Math.cos(wd * t) + ((a - v0) / wd) * Math.sin(wd * t))
}

describe('shelf open/close motion', () => {
  const open = motion('SHELF_OPEN_MOTION')
  const close = motion('SHELF_CLOSE_MOTION')

  it('both curves run 0 -> 1, monotonic, never past the target', () => {
    for (const { points } of [open, close]) {
      expect(points[0]).toEqual([0, 0])
      expect(points[points.length - 1]).toEqual([1, 1])
      for (let i = 1; i < points.length; i++) {
        expect(points[i][0]).toBeGreaterThanOrEqual(points[i - 1][0])
        expect(points[i][1]).toBeGreaterThan(points[i - 1][1])
        expect(points[i][0]).toBeLessThanOrEqual(1)
      }
    }
  })

  it('open follows the 0.38s / 0.86 spring (v0 = 5) and ends where it first reaches the target', () => {
    for (const [v, p] of open.points.slice(1, -1)) {
      expect(Math.abs(spring((p * open.ms) / 1000, 0.38, 0.86, 5) - v)).toBeLessThan(0.003)
    }
    expect(spring(open.ms / 1000, 0.38, 0.86, 5)).toBeGreaterThanOrEqual(0.999)
  })

  it('close follows the critically damped 0.24s spring (v0 = 3) and is under a pixel from done', () => {
    for (const [v, p] of close.points.slice(1, -1)) {
      expect(Math.abs(spring((p * close.ms) / 1000, 0.24, 1, 3) - v)).toBeLessThan(0.003)
    }
    expect(1 - spring(close.ms / 1000, 0.24, 1, 3)).toBeLessThan(0.004)
  })

  it('opens with the open spring, closes with the close spring, edge moves included', () => {
    expect(panel).toContain(': isVisuallyOpen ? SHELF_OPEN_MOTION : SHELF_CLOSE_MOTION')
    expect(panel).toMatch(/stage === 'retracting'\) \{\s*currentTransition = SHELF_CLOSE_MOTION/)
    expect(panel).toMatch(/stage === 'expanding'\) \{\s*currentTransition = SHELF_OPEN_MOTION/)
    // The edge-move sequence waits 300ms for the expand step; the open spring must fit.
    expect(open.ms).toBeLessThanOrEqual(300)
  })

  it('open clip is the blade plus the 30px flares, with no spare margin to snap across', () => {
    expect(panel).toContain("'inset(-30px 0px -30px 0px round 0px 24px 24px 0px)'")
    expect(panel).toContain("'inset(-30px 0px -30px 0px round 24px 0px 0px 24px)'")
    expect(panel).toContain("'inset(0px -30px 0px -30px round 0px 0px 24px 24px)'")
    const insets = panel.match(/inset\([^)']*\)/g) ?? []
    expect(insets.length).toBeGreaterThanOrEqual(6)
    for (const clip of insets) expect(clip).not.toMatch(/800px|600px|999px|- 100px/)
    // The top dock's closed bar uses the same 24px corners as the side docks.
    expect(panel).toContain('calc(100% - ${hotWidth}px) ${insetLeft} round 0px 0px 24px 24px / 0px 0px ${hotWidth}px ${hotWidth}px)`')
  })

  it('content veil sits above every in-blade layer and hides only after the close finishes', () => {
    const veil = css.match(/\.blade::after \{([^}]*)\}/)?.[1] ?? ''
    expect(veil).toContain('z-index: 400;')
    expect(veil).toContain('pointer-events: none;')
    expect(veil).toContain('background-color: rgba(0, 0, 0, 1);')
    const hideDelay = Number(veil.match(/visibility 0s linear (\d+)ms/)?.[1])
    expect(hideDelay).toBeGreaterThanOrEqual(close.ms)
    expect(css).toMatch(/\.blade-container\.is-open \.blade::after \{[^}]*background-color: rgba\(0, 0, 0, 0\);[^}]*visibility: visible;/)
    expect(css).toMatch(/\.blade-container\.reduce-motion \.blade::after \{[^}]*transition-duration: 0\.01s;/)
    // Highest z-index used inside the blade (ClearMenu dropdown) stays below the veil.
    expect(read('src/components/ClearMenu.tsx')).toContain('zIndex: 350')
  })
})
