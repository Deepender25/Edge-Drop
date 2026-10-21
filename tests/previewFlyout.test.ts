import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const flyout = read('src/components/PreviewFlyout.tsx')
const css = read('src/styles/previewFlyout.css')

const keyframes = (name: string) => {
  const m = css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))
  return m?.[1] ?? ''
}

describe('preview flyout motion runs on the compositor', () => {
  it('uses CSS motion, not per-frame JavaScript', () => {
    expect(flyout).not.toContain('framer-motion')
    expect(flyout).not.toContain('requestAnimationFrame')
    expect(flyout).toContain("import '../styles/previewFlyout.css'")
  })

  it('every keyframe animates only opacity and transform', () => {
    const names = [...css.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1])
    expect(names.length).toBeGreaterThanOrEqual(10)
    for (const name of names) {
      const props = [...keyframes(name).matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
      expect(props.length, name).toBeGreaterThan(0)
      for (const p of props) expect(['opacity', 'transform'], `${name}: ${p}`).toContain(p)
    }
  })

  it('the anchor slide animates translate only, with the same spring', () => {
    expect(flyout).toMatch(/el\.animate\(\[\{ translate: `\$\{dx\}px 0` \}, \{ translate: '0 0' \}\]/)
    const tsSpring = flyout.match(/const PF_SPRING = '(linear\([^']+\))'/)?.[1]
    const cssSpring = css.match(/--pf-spring: (linear\([^;]+\));/)?.[1]
    expect(tsSpring).toBeTruthy()
    expect(tsSpring).toBe(cssSpring)
  })

  it('the spring settles exactly on 1 and barely overshoots', () => {
    const pts = css.match(/--pf-spring: linear\(([^;]+)\);/)![1].split(',').map(Number)
    expect(pts[0]).toBe(0)
    expect(pts[pts.length - 1]).toBe(1)
    expect(Math.max(...pts)).toBeLessThanOrEqual(1.01)
  })

  it('stays mounted exactly as long as the exit animations run', () => {
    const exitMs = Number(flyout.match(/export const PREVIEW_EXIT_MS = (\d+)/)?.[1])
    const batchMs = Number(flyout.match(/const BATCH_EXIT_MS = (\d+)/)?.[1])
    for (const dir of ['left', 'right', 'top']) {
      expect(css).toContain(`.pf-wrap.from-${dir}.is-leaving {\n  animation: pf-out-${dir} ${exitMs}ms`)
    }
    expect(css).toContain(`.pf-batch.is-leaving {\n  animation: pf-batch-out ${batchMs}ms`)
    // the panel closes 240ms after the preview (App / useEdgeHover): the exit must finish first
    expect(exitMs).toBeLessThan(240)
  })

  it('reduced motion is a plain fade', () => {
    expect(flyout).toContain("reduceMotion ? 'is-reduced' : fromClass")
    expect(css).toMatch(/\.pf-wrap\.is-reduced \{\n  animation: pf-fade-in 120ms linear both;/)
    expect(css).toMatch(/\.pf-wrap\.is-reduced\.is-leaving \{\n  animation: pf-fade-out 120ms linear both;/)
  })

  it('no permanent will-change layer on the shell', () => {
    expect(flyout).not.toContain('willChange')
    expect(css).not.toContain('will-change')
  })
})

describe('preview flyout keeps its behaviour', () => {
  it('leaves preview mode only after the close finished and nothing reopened', () => {
    expect(flyout).toMatch(/usePresence\(!!liveItem, PREVIEW_EXIT_MS, \(\) => \{\s+if \(!useStore\.getState\(\)\.previewItemId\) \{\s+window\.edge\.setPreviewMode\(false\)/)
  })

  it('closes where it is: position and grow-point keep the last card rect during the exit', () => {
    expect(flyout).toContain('if (liveItem) lastItemRectRef.current = liveItemRect')
    expect(flyout).toContain('const previewItemRect = liveItem ? liveItemRect : lastItemRectRef.current')
    // the only read of the store rect is the live one above
    expect(flyout.match(/useStore\(\(s\) => s\.previewItemRect\)/g)?.length).toBe(1)
  })

  it('the hover keep-alive zone follows the live item, not the closing one', () => {
    expect(flyout).toMatch(/if \(!liveItem \|\| !flyoutRef\.current\) \{\s+useStore\.getState\(\)\.setPreviewFlyoutRect\(null\)/)
  })

  it('a closing flyout ignores clicks and drops', () => {
    expect(flyout).toContain("pointerEvents: leaving ? 'none' : 'auto'")
    expect(flyout).toContain('if (liveItem && activeDrag && activeDrag.id !== liveItem.id)')
  })

  it('every kind gets the header row and keeps click-to-paste', () => {
    expect(flyout.match(/return frame\(/g)?.length).toBe(9)
    expect(flyout.match(/onClick=\{pasteOnClick\}/g)?.length).toBe(4)
  })

  it('color previews list every format, copied without a new card', () => {
    for (const f of ['HEX', 'RGB', 'HSL']) expect(flyout).toContain(`<ColorFormatRow name="${f}"`)
    expect(flyout).toContain('copyText(value, { quiet: true })')
  })

  it('the inline style does not hide the stylesheet rim', () => {
    expect(flyout).toContain("boxShadow: dragOver ? '0 0 35px rgba(76, 175, 80, 0.3)' : undefined")
    expect(css).toMatch(/\.preview-flyout \{\n  box-shadow: inset 0 0 0 1px var\(--edge-light\);/)
  })
})
