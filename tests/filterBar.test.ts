import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..')

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

describe('filter bar (SegmentedControl)', () => {
  const tsx = read('src/components/SegmentedControl.tsx')
  const css = read('src/styles/SegmentedControl.css')

  it('replaces RubberSegment everywhere', () => {
    expect(existsSync(join(root, 'src/components/RubberSegment.tsx'))).toBe(false)
    expect(existsSync(join(root, 'src/styles/RubberSegment.css'))).toBe(false)
    expect(read('src/components/Header.tsx')).toContain('<SegmentedControl')
    expect(read('src/components/EmojiCategoryBar.tsx')).toContain('<SegmentedControl')
  })

  it('has no per-frame JS: no framer-motion, no measuring loop', () => {
    expect(tsx).not.toContain('framer-motion')
    expect(tsx).not.toContain('requestAnimationFrame')
    expect(tsx).not.toContain('ResizeObserver')
  })

  it('places the thumb by pure CSS geometry from the selected index', () => {
    expect(tsx).toContain("'--i': shown")
    expect(css).toContain('grid-auto-columns: var(--seg-slot);')
    expect(css).toContain('translate: calc(var(--i) * var(--seg-slot)) 0;')
    // The black icon copy moves the opposite way with the same spring, so it stays on the slots.
    expect(css).toContain('translate: calc(var(--i) * var(--seg-slot) * -1) 0;')
    expect(css.match(/translate var\(--seg-motion\)/g)?.length).toBe(2)
  })

  it('is borderless and uses the search field surface', () => {
    const track = css.match(/\.seg \{([^}]*)\}/)?.[1] ?? ''
    expect(track).toContain('background: var(--bg-card, #141414);')
    expect(track).not.toMatch(/\bborder:/)
  })

  it('commits on release from a ref, so a fast click can never be lost', () => {
    expect(tsx).toContain('const target = press.current.at')
    expect(tsx).toContain('setPointerCapture')
    expect(tsx).toContain("onClick={(e) => { if (e.detail === 0) commit(i) }}")
  })

  it('honours Reduce motion', () => {
    expect(tsx).toContain("reduceMotion ? ' seg--instant' : ''")
    expect(css).toMatch(/\.seg--instant \.seg__thumb,\s*\.seg--instant \.seg__ink \{\s*transition: none;/)
    expect(read('src/components/Header.tsx')).toContain('reduceMotion={reduceMotion}')
  })

  it('header: filters exclude emoji, which is its own toggle; no thumb while the picker is open', () => {
    const header = read('src/components/Header.tsx')
    expect(header).not.toContain("id: 'emoji'")
    expect(header).toContain('value={emojiOpen ? null : typeFilter}')
    expect(header).toContain('className={`emoji-mode-btn${emojiOpen ? \' active\' : \'\'}`}')
    expect(header).toContain('setEmojiOpen(!emojiOpen)')
  })

  it('Header renders EmojiCategoryBar centered in place of search in horizontal dock when emojiOpen', () => {
    expect(read('src/components/Header.tsx')).toContain('<EmojiCategoryBar isHorizontal={true}')
  })

  it('EmojiPicker renders EmojiCategoryBar only in vertical dock mode and delegates horizontal to Header', () => {
    const src = read('src/components/EmojiPicker.tsx')
    expect(src).toContain('!isHorizontal && <EmojiCategoryBar isHorizontal={false}')
    expect(src).not.toContain('emoji-cat-btn')
  })
})
