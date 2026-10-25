import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TRANSLATIONS } from '../src/i18n/translations'

// Reopening the shelf after a while (or after a new copy) starts the list at
// the top. It used to do that silently; now a round button offers the way back.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
const list = read('src/components/ItemList.tsx')
const css = read('src/styles/item.css')

describe('reopen at the top, never silently', () => {
  it('starts at the top after 1 minute closed or a new copy, and then offers the way back', () => {
    expect(list).toContain('const REOPEN_AT_TOP_AFTER_MS = 60_000')
    expect(list).toMatch(/if \(timeSinceClosed >= REOPEN_AT_TOP_AFTER_MS \|\| hasNewCopyWhileClosed\) \{[\s\S]{0,400}if \(spot && spot\.filter === \(state\.typeFilter \|\| 'all'\)\) setBackSpot\(spot\)/)
  })

  it('remembers the card at the leading edge when the shelf closes, so going back lands on it even after new copies', () => {
    expect(list).toMatch(/if \(!isNowOpen && lastOpen\) \{[\s\S]{0,500}closedSpot\.current = captureSpot\(\)/)
    expect(list).toContain("const card = hit?.closest('.list .item-main') as HTMLElement | null")
    expect(list).toMatch(/target = \(isHorizontal \? el\.scrollLeft \+ at\.left - box\.left : el\.scrollTop \+ at\.top - box\.top\) - spot\.offset/)
    // nothing to go back to within half a view of the top
    expect(list).toContain('if (pos < (isHorizontal ? el.clientWidth : el.clientHeight) / 2) return null')
  })

  it('is offered for 6 seconds, held while the pointer is on it', () => {
    expect(list).toContain('const BACK_BUTTON_MS = 6000')
    expect(list).toMatch(/onPointerEnter=\{\(\) => setHeld\(true\)\}\s+onPointerLeave=\{\(\) => setHeld\(false\)\}/)
    expect(list).toMatch(/if \(held\) return\s+const startedAt = performance\.now\(\)\s+const timer = window\.setTimeout\(\(\) => done\.current\(\), timeLeft\.current\)/)
    expect(css).toMatch(/\.back-btn\.is-held \.back-btn-ring circle \{\s+animation-play-state: paused;/)
  })

  it('goes away as soon as it is not needed: own scroll, filter, search, dock change, shelf closing', () => {
    expect(list).toMatch(/if \(next\) setBackSpot\(\(prev\) => \(prev \? null : prev\)\)/)
    expect(list).toMatch(/if \(prevFilterRef\.current !== typeFilter\) \{\s+setBackSpot\(null\)/)
    expect(list).toMatch(/prevQueryRef\.current = query\s+setBackSpot\(null\)/)
    expect(list).toMatch(/prevStickPos\.current = stickPosition\s+setBackSpot\(null\)/)
    expect(list).toMatch(/closedSpot\.current = captureSpot\(\)\s+setBackSpot\(null\)/)
  })

  it('is the scroll-to-top button itself, no text, with a white ring around its edge that shrinks for the 6 seconds', () => {
    expect(list).toMatch(/className=\{`scroll-top-btn back-btn\$\{horizontal \? ' horizontal' : ''\}/)
    const button = list.slice(list.indexOf('function BackButton'))
    expect(button).not.toMatch(/<span/)
    expect(button).toMatch(/title=\{label\}\s+aria-label=\{label\}/)
    expect(button).toContain('<circle cx="22" cy="22" r="20.5" pathLength="100" />')
    expect(css).toMatch(/\.back-btn-ring circle \{[^}]*stroke: rgba\(255, 255, 255, 0\.9\);[^}]*stroke-dasharray: 100;[^}]*animation: back-btn-ring var\(--back-btn-ms, 6000ms\) linear forwards;/)
    expect(css).toMatch(/@keyframes back-btn-ring \{\s+from \{ stroke-dashoffset: 0; \}\s+to \{ stroke-dashoffset: 100; \}/)
    expect(css).toMatch(/:root\[data-motion='reduce'\] \.back-btn-ring \{\s+display: none;/)
  })

  it('has its text in every language', () => {
    const langs = Object.keys(TRANSLATIONS)
    expect(langs.length).toBe(31)
    for (const lang of langs) expect(TRANSLATIONS[lang].item.backToSpot, lang).toMatch(/\S/)
    expect(TRANSLATIONS.en.item.backToSpot).toBe('Back to where you were')
  })
})
