import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const slider = read('src/components/WakeSlider.tsx')
const settings = read('src/components/Settings.tsx')

describe('slider drag feel', () => {
  it('the fill tracks the pointer 1:1 while dragging, not a spring behind it', () => {
    expect(slider).toContain('(reduce || pointerId.current !== null ? target.get() : head.get())')
    expect(slider).toContain('target.set(ratio * 100)')
    // value-driven updates do not fight the pointer mid-drag
    expect(slider).toContain('if (pointerId.current === null) target.set(pct)')
  })

  it('handles pointer moves at most once per frame', () => {
    expect(slider).toMatch(/onPointerMove[\s\S]*?pendingX\.current = e\.clientX\s+frameSteps\.update\.schedule\(flushDrag\)/)
    expect(slider).not.toMatch(/onPointerMove = [^}]*commitFromX\(e\.clientX\)/)
  })

  it('release hands back to the spring from the finger, then settles on the value', () => {
    expect(slider).toMatch(/head\.jump\(target\.get\(\)\)\s+target\.set\(toPct\(latest\.current, min, max\)\)/)
  })

  it('ticks once per detent, never more than once per bar', () => {
    expect(slider).toContain('Math.min(bars - 1, Math.round((max - min) / (step > 0 ? step : 1)))')
    expect(slider).toContain('if (detentOf(clean) !== detentOf(latest.current)) playDialTickSound()')
  })

  it('settings does not double the ticks while dragging, and keeps the 1% position on release', () => {
    for (const fn of ['handleSliderInput', 'handleThicknessInput', 'handleHoverDelayInput', 'handleSliderRelease', 'handleThicknessRelease', 'handleHoverDelayRelease']) {
      const body = settings.slice(settings.indexOf(`const ${fn} = `), settings.indexOf('\n  }\n', settings.indexOf(`const ${fn} = `)))
      expect(body, fn).not.toContain('playDialTickSound')
    }
    expect(settings).toContain('step={0.01}')
    expect(settings).toContain('Math.round(rawVal * 100) / 100')
  })
})
