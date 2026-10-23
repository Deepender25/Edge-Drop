import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('hover follows cards that move under a still pointer', () => {
  const hook = read('src/hooks/useHoverResync.ts')
  const win = read('electron/main/window.ts')

  it('re-checks after cards are added, removed or reordered, and when the shelf opens', () => {
    expect(hook).toContain('observer.observe(root, { childList: true, subtree: true })')
    expect(hook).toContain('if (s.open && !prev.open) schedule()')
    expect(hook).toMatch(/RESYNC_DELAYS_MS = \[60, 400\] as const/)
    // one pending round covers a burst of changes
    expect(hook).toContain('if (timers.length > 0) return')
    expect(read('src/App.tsx')).toMatch(/useHoverResync\(/)
  })

  it('re-checks once a wheel or trackpad scroll settles, not on every scroll step', () => {
    expect(hook).toContain("doc.addEventListener('scroll', onScroll, { capture: true, passive: true })")
    expect(hook).toMatch(/window\.clearTimeout\(scrollTimer\)\s+scrollTimer = window\.setTimeout\(fire, SCROLL_SETTLE_MS\)/)
    expect(hook).toMatch(/SCROLL_SETTLE_MS = 80\b/)
    expect(hook).toContain("doc.removeEventListener('scroll', onScroll, true)")
  })

  it('never fires while closed, pressing or dragging', () => {
    expect(hook).toContain('if (!s.open || pressed || s.dragActive || s.internalDragReq) return')
    for (const ev of ['pointerdown', 'pointerup', 'pointercancel']) {
      expect(hook).toContain(`window.addEventListener('${ev}'`)
      expect(hook).toContain(`window.removeEventListener('${ev}'`)
    }
    expect(hook).toContain('observer.disconnect()')
  })

  it('main sends one mouse move at the cursor, only when it is over the clickable window', () => {
    const fn = win.match(/export function resyncHover\(\)[\s\S]*?\r?\n\}\r?\n/)?.[0] ?? ''
    expect(fn).toContain('!interactive) return')
    expect(fn).toContain('if (x < 0 || y < 0 || x >= b.width || y >= b.height) return')
    expect(fn).toContain("sendInputEvent({ type: 'mouseMove', x, y })")
    expect(fn).not.toMatch(/mouseDown|mouseUp|click/)
  })

  it('is wired through one send channel', () => {
    expect(read('shared/ipc.ts')).toContain("'window:resync-hover': { args: [] }")
    expect(read('electron/preload/index.ts')).toContain("resyncHover: () => send('window:resync-hover')")
    expect(read('electron/main/ipc.ts')).toMatch(/on\('window:resync-hover', \(\) => \{\s+resyncHover\(\)/)
  })
})
