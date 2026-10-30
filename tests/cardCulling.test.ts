import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Cards are culled with content-visibility: auto, but the ones in or near the
// list's view are always drawn. Left to content-visibility alone, the top dock
// painted its cards as empty boxes on every open until the open motion ended.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
const list = read('src/components/ItemList.tsx')
const css = read('src/styles/item.css')

describe('cards in view stay drawn while the shelf is closed', () => {
  it('culls cards, except those marked data-near', () => {
    expect(css).toMatch(/\.list-stack \.item \{\s*content-visibility: auto;/)
    expect(css).toMatch(/\.list-stack \.item\[data-near\] \{\s*content-visibility: visible;/)
  })

  it('marks cards near the view measured against the list, not the window (the closed clip does not touch it)', () => {
    expect(list).toContain('new IntersectionObserver(')
    expect(list).toContain("{ root: list, rootMargin: isHorizontal ? '0px 100% 0px 100%' : '100% 0px 100% 0px' }")
    expect(list).toContain("if (e.isIntersecting) e.target.setAttribute('data-near', '')")
    expect(list).toContain("else e.target.removeAttribute('data-near')")
  })

  it('watches cards as they come and go, and lets go of them on unmount', () => {
    expect(list).toContain("const cards = new Set(stack.querySelectorAll('.item'))")
    expect(list).toContain('added.observe(stack, { childList: true, subtree: true })')
    expect(list).toMatch(/added\.disconnect\(\)\s*near\.disconnect\(\)/)
  })
})
