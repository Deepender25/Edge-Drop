import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COPY_TAB_DEPTH, copyTabPath, copyTabProfile, edgeBarCenter } from '../src/lib/copyIndicatorShape'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('copy indicator shape', () => {
  it('reaches full depth in the middle and melts back into the bar at the ends', () => {
    for (const bar of [1, 3, 7]) {
      expect(copyTabProfile(0, bar)).toBeCloseTo(COPY_TAB_DEPTH, 6)
      const { halfLength } = copyTabPath(bar)
      expect(copyTabProfile(halfLength, bar) - bar).toBeLessThanOrEqual(0.05)
      expect(copyTabProfile(halfLength, bar)).toBeGreaterThanOrEqual(bar)
    }
  })

  it('is symmetric and only ever gets shallower away from the middle (no bumps)', () => {
    let last = Infinity
    for (let y = 0; y <= 70; y += 0.5) {
      const v = copyTabProfile(y, 3)
      expect(v).toBeCloseTo(copyTabProfile(-y, 3), 9)
      expect(v).toBeLessThanOrEqual(last + 1e-9)
      last = v
    }
  })

  it('has a flat cap for the icon: within 1px of full depth for the middle 30px', () => {
    for (let y = 0; y <= 15; y += 1) expect(COPY_TAB_DEPTH - copyTabProfile(y, 3)).toBeLessThan(1)
  })

  it('is the same compact size in every dock (about 100px along the edge)', () => {
    const { halfLength, d } = copyTabPath(3)
    expect(halfLength * 2).toBeGreaterThan(90)
    expect(halfLength * 2).toBeLessThan(115)
    expect(d.startsWith('M -40 ')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
  })
})

describe('copy indicator placement follows the edge bar', () => {
  const vp = { width: 384, height: 1000 }
  const base = { panelHeight: 0.5, verticalOffset: 0.5, hotZoneHeight: 0.2 }

  it('side docks: bar centre for each alignment', () => {
    // panel 500 tall centred at 500 -> spans 250..750; bar is 200 long.
    expect(edgeBarCenter({ ...base, stickPosition: 'left' }, vp)).toBe(500)
    expect(edgeBarCenter({ ...base, stickPosition: 'right', triggerAlignment: 'top' }, vp)).toBe(350)
    expect(edgeBarCenter({ ...base, stickPosition: 'left', triggerAlignment: 'bottom' }, vp)).toBe(650)
  })

  it('top dock: bar centre for each alignment', () => {
    const wide = { width: 1200, height: 400 }
    // blade 1080 wide centred at 600 -> 60..1140; bar 275 wide at hotZoneHeight 0.2.
    expect(edgeBarCenter({ ...base, stickPosition: 'top' }, wide)).toBe(600)
    expect(edgeBarCenter({ ...base, stickPosition: 'top', triggerAlignment: 'left' }, wide)).toBe(60 + 137.5)
    expect(edgeBarCenter({ ...base, stickPosition: 'top', triggerAlignment: 'right' }, wide)).toBe(1140 - 137.5)
  })
})

describe('copy indicator motion', () => {
  const tsx = read('src/components/CopyIndicatorCurve.tsx')
  const css = read('src/styles/panel.css')

  it('has no per-frame JS: no framer-motion, no path morphing', () => {
    expect(tsx).not.toContain('framer-motion')
    expect(tsx).not.toContain('AnimatePresence')
    expect(tsx).toContain("if (on) className += ' is-on'")
  })

  it('grows the tab out of the bar with transforms only', () => {
    expect(css).toMatch(/\.copy-ind__shape \{[^}]*transform: scale\(var\(--copy-tab-start\), 0\.62\);/)
    expect(css).toMatch(/\.copy-ind\.is-on \.copy-ind__shape \{[^}]*transform: scale\(1, 1\);/)
    expect(tsx).toContain("'--copy-tab-start': `${barWidth / COPY_TAB_DEPTH}`")
  })

  it('hides everything only after the exit has finished', () => {
    const shape = css.match(/\.copy-ind__shape \{([^}]*)\}/)?.[1] ?? ''
    // exit: 289ms spring starting 60ms late -> done at 349ms
    expect(shape).toContain('visibility 0s linear 360ms')
    const icon = css.match(/\.copy-ind__icon \{([^}]*)\}/)?.[1] ?? ''
    expect(icon).toContain('visibility 0s linear 160ms')
  })

  it('honours Reduce motion with plain fades', () => {
    expect(tsx).toContain("if (settings.reduceMotion) className += ' is-reduced'")
    expect(css).toMatch(/\.copy-ind\.is-reduced \.copy-ind__shape \{\s*transform: none;\s*opacity: 0;/)
  })
})
