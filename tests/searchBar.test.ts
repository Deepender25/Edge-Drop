import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const tsx = read('src/components/ShelfSearch.tsx')
const css = read('src/styles/panel.css')

describe('search bar', () => {
  it('has a clear button that never touches focus and is labelled in every language', () => {
    expect(tsx).toContain('className="search-clear"')
    expect(tsx).toContain("aria-label={t('item.clear')}")
    // Can't take focus: press cancelled, out of the tab order.
    expect(tsx).toContain('onPointerDown={(e) => e.preventDefault()}')
    expect(tsx).toContain('onMouseDown={(e) => e.preventDefault()}')
    expect(tsx).toMatch(/className="search-clear"[\s\S]*?tabIndex=\{-1\}/)
    // Only clears. Refocusing the input from here could pull OS focus back
    // from the user's app after an app switch (the OS handover is driven
    // purely by the input's own focus/blur).
    expect(tsx).toContain("onClick={() => setQuery('')}")
    const clearButton = tsx.slice(tsx.indexOf('<button'), tsx.indexOf('</button>'))
    expect(clearButton).toContain('className="search-clear"')
    expect(clearButton).not.toMatch(/focus\(|engage\(/)
    expect(tsx).toContain("className={`search${query ? ' has-query' : ''}`}")
  })

  it('shows the clear button only when there is text', () => {
    expect(css).toMatch(/\.search-clear \{[^}]*visibility: hidden;[^}]*pointer-events: none;/)
    expect(css).toMatch(/\.search\.has-query \.search-clear \{[^}]*visibility: visible;[^}]*pointer-events: auto;/)
  })

  it('shows focus without a border: a lifted fill and a brighter icon', () => {
    expect(css).toMatch(/\.search input:focus \{\s*background: #222222;\s*\}/)
    // Borderless like the rest of the UI: no ring, no border on the field.
    expect(css).not.toMatch(/\.search input[^{]*\{[^}]*(box-shadow|border:\s*1px)/)
    expect(css).toMatch(/\.search:focus-within \.search-icon,\s*\.search\.has-query \.search-icon \{/)
  })

  it('is sized per dock from one rule set: 34px vertical, 30px horizontal', () => {
    expect(css).toMatch(/\.search \{[^}]*--search-h: 34px;/)
    expect(css).toMatch(/\.header-search-center \.search \{[^}]*--search-h: 30px;/)
    expect(css).toMatch(/\.search input \{[^}]*height: var\(--search-h\);[^}]*border: none;/)
  })
})
