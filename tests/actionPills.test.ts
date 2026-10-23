import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const css = read('src/styles/item.css')
const tokens = read('src/styles/tokens.css')
const flyout = read('src/components/PreviewFlyout.tsx')

const rule = (selector: string) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`(?:^|\\n)${esc} \\{([^}]*)\\}`))?.[1] ?? ''
}

describe('action pills share one look', () => {
  it('defines the shared values once', () => {
    for (const v of ['--act-size', '--act-icon', '--act-surface', '--act-shadow', '--act-ink', '--act-hover', '--act-on', '--act-danger']) {
      expect(tokens).toContain(`${v}:`)
    }
  })

  it('every hover/quick-action container gets the same surface from one rule', () => {
    const shared = css.match(/\.actions,\n\.actions-pill,\n\.act-pill,\n\.fluid-row-actions,\n\.horizontal-subitem-actions,\n\.stack-row-actions \{([^}]*)\}/)?.[1] ?? ''
    expect(shared).toContain('background: var(--act-surface);')
    expect(shared).toContain('border: none;')
    expect(shared).toContain('border-radius: 999px;')
    expect(shared).toContain('box-shadow: var(--act-shadow);')
  })

  it('containers only position themselves: no own background, border or size', () => {
    for (const sel of ['.actions', '.fluid-row-actions', '.flyout-subitem .actions', '.horizontal-subitem-actions', '.list.horizontal .actions']) {
      const body = rule(sel)
      expect(body, sel).not.toMatch(/background|border:|box-shadow|padding|will-change/)
    }
    // an open stack's row pill (stack.css) too
    const row = read('src/styles/stack.css').match(/\n\.stack-row-actions \{([^}]*)\}/)?.[1] ?? ''
    expect(row).toContain('position: absolute;')
    expect(row).not.toMatch(/background|border:|box-shadow|padding|will-change/)
  })

  it('buttons are sized and coloured only through the shared values', () => {
    expect(rule('.act')).toContain('width: var(--act-size);')
    expect(rule('.act > svg')).toContain('width: var(--act-icon);')
    expect(rule('.act.active::before')).toContain('background: var(--act-on);')
    expect(rule('.act.danger:hover')).toContain('color: var(--act-danger);')
    // No context re-styles the button any more.
    expect(css).not.toMatch(/\n[^\n{]*\S \.act(:hover|\.danger:hover|\.active)? \{/)
  })

  it('the horizontal dock only changes size', () => {
    const h = rule('.list.horizontal')
    expect(h).toContain('--act-size: 22px;')
    expect(h).toContain('--act-icon: 12px;')
  })

  it('nothing animates forever (the old preview pulse cost ~0.5s CPU per second)', () => {
    expect(css).not.toContain('preview-pulse')
    // The only remaining infinite animation is the onboarding tutorial highlight.
    expect(css.match(/animation:[^;]*infinite/g)).toEqual(['animation: pulse-glow 1.5s infinite'])
  })
})

describe('preview flyout buttons use the shared styles', () => {
  it('quick actions take their size from CSS', () => {
    expect(flyout).not.toContain('style={{ width: size, height: size }}')
    expect(flyout).not.toContain('solidDark')
  })

  it('batch bar is class-styled, with no JS hover handlers', () => {
    expect(flyout).toContain('className="flyout-chip"')
    expect(flyout).toContain('className="flyout-text-btn"')
    expect(flyout).toContain('className="flyout-btn"')
    expect(flyout).toContain('className="flyout-btn primary"')
    expect(flyout).not.toContain('onMouseEnter')
    expect(flyout).not.toContain('onMouseLeave')
  })

  it('standalone quick actions sit in a pill (the shared header row)', () => {
    expect(flyout.split('className="act-pill"').length - 1).toBe(1)
    expect(flyout).toMatch(/<div className="pf-head">[\s\S]*className="act-pill"/)
  })
})
