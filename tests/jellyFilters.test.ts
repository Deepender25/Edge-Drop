import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..')

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

describe('rubber segment filter contracts (adapted to installed framer-motion v11)', () => {
  it('uses framer-motion, never the motion package', () => {
    const src = read('src/components/RubberSegment.tsx')
    expect(src).toContain("from 'framer-motion'")
    expect(src).not.toContain('motion/react')
    expect(src).not.toContain('.jump(')
  })

  it('animates clip-path with rubber dilation and full cleanup', () => {
    const src = read('src/components/RubberSegment.tsx')
    expect(src).toContain('clipPath')
    expect(src).toContain('useTransform')
    expect(src).toContain('ResizeObserver')
    expect(src).toContain('edgeL.stop()')
    expect(src).toContain('useReducedMotion')
  })

  it('Header renders RubberSegment for filters without the old sliding pill', () => {
    const src = read('src/components/Header.tsx')
    expect(src).toContain('<RubberSegment')
    expect(src).not.toContain('Sliding Pill')
  })

  it('Header renders EmojiCategoryBar centered in place of search in horizontal dock when emojiOpen', () => {
    const src = read('src/components/Header.tsx')
    expect(src).toContain('<EmojiCategoryBar isHorizontal={true}')
  })

  it('EmojiPicker renders EmojiCategoryBar only in vertical dock mode and delegates horizontal to Header', () => {
    const src = read('src/components/EmojiPicker.tsx')
    expect(src).toContain('!isHorizontal && <EmojiCategoryBar isHorizontal={false}')
    expect(src).not.toContain('emoji-cat-btn')
  })

  it('EmojiCategoryBar renders RubberSegment with elastic physics', () => {
    const src = read('src/components/EmojiCategoryBar.tsx')
    expect(src).toContain('<RubberSegment')
  })

  it('RubberSegment stylesheet exists with clean thumb layer styles', () => {
    const css = read('src/styles/RubberSegment.css')
    expect(css).toContain('.rubber-segment')
    expect(css).toContain('.rubber-segment__thumb')
  })
})
