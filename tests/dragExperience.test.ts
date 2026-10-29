import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DRAG_CATCH_DEPTH_PX,
  DRAG_CATCH_DEPTH_TOP_PX,
  DRAG_CATCH_SLACK_PX,
  DRAG_PULL_RANGE_PX,
  edgeDragPull,
  inEdgeDragCatch,
  registerEdgeDragCue,
  setEdgeDragPull,
  pullStep,
  DRAG_PULL_STEP_AT,
  type EdgeDragLane
} from '../src/lib/edgeDrag'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n')

// ── main: is a drag from another app in progress? ──────────────────────────
const user32 = vi.hoisted(() => ({ buttons: new Set<number>(), dragWindow: 0 as number, calls: [] as string[] }))
vi.mock('koffi', () => ({
  default: {
    load: () => ({
      func: (sig: string) => {
        if (sig.includes('GetAsyncKeyState')) return (vk: number) => { user32.calls.push('key'); return user32.buttons.has(vk) ? -32768 : 0 }
        if (sig.includes('FindWindowW')) return (cls: string) => { user32.calls.push('find:' + cls); return user32.dragWindow }
        throw new Error('unexpected ' + sig)
      }
    })
  }
}))

describe('main: a drag from another app (externalDrag.ts)', () => {
  let mod: typeof import('../electron/main/externalDrag')
  const platform = process.platform
  beforeEach(async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    vi.resetModules()
    mod = await import('../electron/main/externalDrag')
    user32.buttons.clear(); user32.dragWindow = 0; user32.calls.length = 0
  })
  afterEach(() => { Object.defineProperty(process, 'platform', { value: platform }) })

  it('is a held button plus the shell drag-image window', () => {
    user32.buttons.add(1); user32.dragWindow = 0x1234
    expect(mod.isExternalDragActive()).toBe(true)
    expect(user32.calls).toContain('find:SysDragImage')
  })

  it('a right-button drag counts too', () => {
    user32.buttons.add(2); user32.dragWindow = 0x1234
    expect(mod.isExternalDragActive()).toBe(true)
  })

  it('no button held: no drag, and the window is not even looked up (cheap idle ticks)', () => {
    user32.dragWindow = 0x1234
    expect(mod.isExternalDragActive()).toBe(false)
    expect(user32.calls.filter((c) => c.startsWith('find'))).toHaveLength(0)
  })

  it('a held button without a drag image (window drag, text selection, slider) is no drag', () => {
    user32.buttons.add(1)
    expect(mod.isExternalDragActive()).toBe(false)
  })

  it('our own drag-out never reads as an incoming drag, including its short tail', () => {
    user32.buttons.add(1); user32.dragWindow = 0x1234
    mod.setOwnDragActive(true)
    expect(mod.isExternalDragActive()).toBe(false)
    mod.setOwnDragActive(false)
    expect(mod.isExternalDragActive(Date.now() + 100)).toBe(false)
    expect(mod.isExternalDragActive(Date.now() + 2000)).toBe(true)
  })

  it('the cursor poll sends the flag, and when it flips even far from the edge', () => {
    const win = read('electron/main/window.ts')
    expect(win).toContain("import { isExternalDragActive } from './externalDrag'")
    expect(win).toContain('|| drag !== _lastSentDrag')
    expect(win).toMatch(/sendToMainWindow\('window:cursor-edge', \{[\s\S]*?\n      drag,/)
  })

  it('drag-outs from the shelf are bracketed, also when startDrag throws', () => {
    const ipc = read('electron/main/ipc.ts')
    expect(ipc).toMatch(/setOwnDragActive\(true\)\n    let dragStarted: boolean\n    try \{\n      dragStarted = startDragOut\(sender, data, capturedAt, subIndex\)\n    \} finally \{\n      setOwnDragActive\(false\)\n    \}/)
  })
})

// ── renderer: ready, pull, catch ─────────────────────────────────────────────
describe('edge bar pull and catch (lib/edgeDrag.ts)', () => {
  const left: EdgeDragLane = { stickPosition: 'left', start: 400, end: 700, displayWidth: 1920 }
  const right: EdgeDragLane = { stickPosition: 'right', start: 400, end: 700, displayWidth: 1920 }
  const top: EdgeDragLane = { stickPosition: 'top', start: 800, end: 1100, displayWidth: 1920 }

  it('pull: 0 out of range, 1 at the bar, growing steadily as the drag comes closer', () => {
    expect(edgeDragPull(left, DRAG_PULL_RANGE_PX + 1, 550)).toBe(0)
    expect(edgeDragPull(left, 0, 550)).toBe(1)
    const steps = [300, 200, 120, 60, 20].map((d) => edgeDragPull(left, d, 550))
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1])
    // past the ends of the bar counts as distance too
    expect(edgeDragPull(left, 0, 700 + DRAG_PULL_RANGE_PX + 1)).toBe(0)
    expect(edgeDragPull(left, 0, 760)).toBeLessThan(1)
  })

  it('each dock measures from its own edge', () => {
    expect(edgeDragPull(right, 1920, 550)).toBe(1)
    expect(edgeDragPull(right, 1920 - 100, 550)).toBeCloseTo(edgeDragPull(left, 100, 550))
    expect(edgeDragPull(top, 950, 0)).toBe(1)
    expect(edgeDragPull(top, 950, 100)).toBeCloseTo(edgeDragPull(left, 100, 550))
  })

  it('catch: only right at the bar, with a little slack past its ends', () => {
    expect(inEdgeDragCatch(left, DRAG_CATCH_DEPTH_PX, 550)).toBe(true)
    expect(inEdgeDragCatch(left, DRAG_CATCH_DEPTH_PX + 1, 550)).toBe(false)
    expect(inEdgeDragCatch(left, 10, 400 - DRAG_CATCH_SLACK_PX)).toBe(true)
    expect(inEdgeDragCatch(left, 10, 400 - DRAG_CATCH_SLACK_PX - 1)).toBe(false)
    expect(inEdgeDragCatch(right, 1920 - 10, 550)).toBe(true)
    expect(inEdgeDragCatch(right, 10, 550)).toBe(false)
    // the top dock catches a little shallower (browser tab strips live up there)
    expect(inEdgeDragCatch(top, 950, DRAG_CATCH_DEPTH_TOP_PX)).toBe(true)
    expect(inEdgeDragCatch(top, 950, DRAG_CATCH_DEPTH_TOP_PX + 1)).toBe(false)
    expect(DRAG_CATCH_DEPTH_TOP_PX).toBeLessThan(DRAG_CATCH_DEPTH_PX)
  })

  it('the bar moves in three steps (~240, ~160, ~90px), not with every cursor update', () => {
    expect(pullStep(edgeDragPull(left, 300, 550), 0)).toBe(0)
    expect(pullStep(edgeDragPull(left, 230, 550), 0)).toBe(1)
    expect(pullStep(edgeDragPull(left, 150, 550), 1)).toBe(2)
    expect(pullStep(edgeDragPull(left, 80, 550), 2)).toBe(3)
    // a fast approach can skip steps
    expect(pullStep(edgeDragPull(left, 40, 550), 0)).toBe(3)
    // hovering on an edge does not flicker between two steps
    expect(pullStep(DRAG_PULL_STEP_AT[1] + 0.02, 1)).toBe(1)
    expect(pullStep(DRAG_PULL_STEP_AT[1] - 0.02, 2)).toBe(2)
    expect(pullStep(DRAG_PULL_STEP_AT[1] + 0.05, 1)).toBe(2)
  })

  it('the step is written onto the cue element only, and only when it changes', () => {
    const style = new Map<string, string>()
    const set = vi.fn((k: string, v: string) => style.set(k, v))
    const el = { style: { setProperty: set } } as unknown as HTMLElement
    registerEdgeDragCue(el)
    setEdgeDragPull(0.6)
    expect(style.get('--pull')).toBe(String(2 / 3))
    const n = set.mock.calls.length
    setEdgeDragPull(0.62) // same step: nothing written
    expect(set.mock.calls.length).toBe(n)
    setEdgeDragPull(1)
    expect(style.get('--pull')).toBe('1')
    setEdgeDragPull(0)
    expect(style.get('--pull')).toBe('0')
    registerEdgeDragCue(null)
  })
})

describe('edge hover: a drag from another app', () => {
  const hook = read('src/hooks/useEdgeHover.ts')
  it('follows the hover setting and ignores our own drags', () => {
    expect(hook).toContain("const drag = !!data.drag && !state.internalDragReq && (state.settings.hoverActivation ?? true)")
  })
  it('opens only after resting in the catch, and only while the drag is still on', () => {
    expect(hook).toMatch(/if \(inEdgeDragCatch\(lane, data\.x, data\.y\)\) \{\n\s+if \(dragOpenTimer === undefined\) \{\n\s+dragOpenTimer = window\.setTimeout\(\(\) => \{\n\s+dragOpenTimer = undefined\n\s+if \(useStore\.getState\(\)\.externalDrag\) openPanel\(\)\n\s+\}, DRAG_CATCH_DWELL_MS\)/)
    expect(hook).toContain('window.clearTimeout(dragOpenTimer)')
  })
})

// ── store ────────────────────────────────────────────────────────────────────
describe('store: drag state', () => {
  it('setters only notify on a real change; ending an in-app drag clears the stack target', async () => {
    vi.resetModules()
    vi.doMock('../src/lib/edge', () => ({ edge: new Proxy({}, { get: () => () => Promise.resolve(undefined) }) }))
    const { useStore } = await import('../src/store/appStore')
    let n = 0
    const unsub = useStore.subscribe(() => { n++ })
    useStore.getState().setExternalDrag(false)
    useStore.getState().setDropTargetId(null)
    expect(n).toBe(0)
    useStore.getState().setExternalDrag(true)
    useStore.getState().setDropTargetId('a')
    useStore.getState().setDropTargetId('a')
    expect(n).toBe(2)
    useStore.getState().setInternalDragReq({ id: 'b' })
    useStore.getState().setInternalDragReq(null)
    expect(useStore.getState().dropTargetId).toBeNull()
    unsub()
    vi.doUnmock('../src/lib/edge')
  })
})

// ── looks ────────────────────────────────────────────────────────────────────
describe('drag looks', () => {
  const panelCss = read('src/styles/panel.css')
  const itemCss = read('src/styles/item.css')
  const panel = read('src/components/Panel.tsx')

  it('drop zone: solid black, a bold dashed well, the tray icon on its own (no box, no glass)', () => {
    expect(panelCss).toMatch(/\.drop-overlay \{[^}]*z-index: 320;[^}]*background: #000000;/)
    // the shared dashed line: 2px stroke, 10px round dashes, 8px gaps
    const dash = panelCss.match(/\n\.dashed-outline-shape \{([^}]*)\}/)![1]
    expect(dash).toContain('stroke-width: 2px;')
    expect(dash).toContain('stroke-linecap: round;')
    expect(dash).toContain('stroke-dasharray: 8 10;')
    expect(panel).toContain('<DashedOutline radius={16} />')
    const well = panelCss.match(/\.drop-well \{([^}]*)\}/)![1]
    expect(well).not.toMatch(/background|border:/)
    const icon = panelCss.match(/\.drop-icon \{([^}]*)\}/)![1]
    expect(icon).not.toMatch(/background|box-shadow|border/)
    // over the shelf the dashes brighten softly, with no change of size from the zone at the edge (a pop)
    expect(panelCss).toContain('.drop-overlay.is-over .drop-well {\n  --dash-color: rgba(255, 255, 255, 0.78);\n}')
    expect(well).toContain('--dash-color: rgba(255, 255, 255, 0.55);')
    expect(well).not.toMatch(/transform: scale/)
    expect(panelCss).toMatch(/\.drop-overlay\.is-accepted \.drop-well \{[^}]*transform: scale\(0\.97\);/)
    expect(panelCss).toContain('.drop-overlay.is-horizontal .drop-well {\n  flex-direction: row;')
    // shown as soon as a drag from another app is on, not only once it is over the window
    expect(panel).toContain('const incoming = useStore((s) => !s.internalDragReq && (s.externalDrag || s.dragActive))')
    expect(panel).not.toContain("background: 'rgba(6, 6, 8, 0.95)'")
  })

  it('drop zone: when the drag goes away without a drop, it stays through the shelf collapse (no cards show)', () => {
    // held once up; released 320ms after the shelf closed (the close is 289ms), or 450ms later if it stays open
    expect(panel).toContain('if (open && incoming) {\n      if (!held) setHeld(true)')
    expect(panel).toContain('const timer = window.setTimeout(() => setHeld(false), open ? 450 : 320)')
    expect(panel).toContain('const visible = held || (open && incoming)')
    // a drop hands over to the accept animation instead
    expect(panel).toContain('if (accepted) {\n      if (held) setHeld(false)')
  })

  it('edge bar cue: the bar itself (solid black, no border) growing in steps, no loop, honours reduced motion', () => {
    const cue = panelCss.match(/\.edge-drag-cue \{([^}]*)\}/)![1]
    expect(cue).toContain('background-color: #000000;')
    expect(cue).not.toMatch(/box-shadow|border/)
    // bar + 3px when ready, bar + 10px at the bar; 104% -> 114% long; done as a transform on its own layer
    expect(cue).toContain('--cue-thick: calc((var(--barn) + 3 + 7 * var(--pull)) / (var(--barn) + 10));')
    expect(cue).toContain('--cue-long: calc((1.04 + 0.1 * var(--pull)) / 1.14);')
    expect(cue).toContain('will-change: transform;')
    expect(cue).toContain('transition: transform 240ms')
    expect(panelCss).toContain('.edge-drag-cue.side-left,\n.edge-drag-cue.side-right {\n  top: 50%;\n  width: calc(var(--bar) + 10px);\n  height: 114%;\n  transform: translateY(-50%) scale(var(--cue-thick), var(--cue-long));')
    expect(panelCss).toMatch(/\.edge-drag-cue\.side-top \{[^}]*transform: translateX\(-50%\) scale\(var\(--cue-long\), var\(--cue-thick\)\);/)
    expect(panel).toContain("style={{ '--bar': `${barPx}px`, '--barn': barPx } as React.CSSProperties}")
    expect(panelCss).not.toMatch(/edge-drag-cue[^{]*\{[^}]*infinite/)
    expect(panelCss).toContain("[data-motion='reduce'] .edge-drag-cue {\n  transition: none;\n  animation: none;")
    // never over a shelf that is still drawing back
    expect(panel).toContain('const showDragCue = externalDrag && !open && closeSettled && !startupBeacon')
    expect(panel).toMatch(/const timer = window\.setTimeout\(\(\) => setCloseSettled\(true\), 320\)/)
  })

  it('stacking: the same dashed ring over every layer of the target card, no badge; the dragged card dims', () => {
    const item = read('src/components/ClipboardItem.tsx')
    expect(item).toContain('<div className="drop-target-ring" aria-hidden="true">\n          <DashedOutline radius={14} />')
    expect(item).not.toContain('drop-target-chip')
    expect(itemCss).not.toContain('drop-target-chip')
    expect(itemCss).toMatch(/\.drop-target-ring \{[^}]*z-index: 25;/)
    expect(itemCss).toMatch(/\.item\.is-drag-source::after \{[^}]*z-index: 25;/)
    const list = read('src/components/ItemList.tsx')
    expect(list).toContain("s.setDropTargetId(target && target.data.kind !== 'text' ? target.id : null)")
  })

  it('detach zone: a light on the screen edge (bright core, blue bloom), in the place of the edge bar, no text, no orange', () => {
    expect(itemCss).not.toMatch(/249, 115, 22|#f97316|#ff8a3d|glow-line|split-well|split-label|split-line|split-cue/)
    expect(panel).not.toContain('split-label')
    expect(panel).not.toContain('DashedLine')
    expect(panel).toContain('<div className={`split-glow side-${stickPosition}`} />')
    // as long as the closed edge bar and aligned like it
    expect(panel).toContain('lineStart={isHorizontal ? insetLeft : insetTop}')
    expect(panel).toContain('lineEnd={isHorizontal ? insetRight : insetBottom}')
    expect(panel).toContain("? { left: `max(0px, ${lineStart})`, right: `max(0px, ${lineEnd})` }")
    expect(panel).toContain(": { top: `max(0px, ${lineStart})`, bottom: `max(0px, ${lineEnd})` }")
    // the light starts on the screen edge itself: a near-white core, then a system-blue glow and bloom into the shelf
    for (const dir of ['to right', 'to left', 'to bottom']) {
      expect(itemCss).toContain(`background: linear-gradient(\n    ${dir},\n    rgba(222, 240, 255, 1) 0,\n    rgba(222, 240, 255, 0.95) 1.5px,\n    rgba(10, 132, 255, 0.85) 3px,`)
    }
    expect(itemCss).toContain('rgba(10, 132, 255, 0) 48px')
    // its ends fade out along the edge
    expect(itemCss).toContain('mask-image: linear-gradient(to bottom, transparent, #000 24%, #000 76%, transparent);')
    expect(itemCss).toContain('mask-image: linear-gradient(to right, transparent, #000 24%, #000 76%, transparent);')
    // dimmer and reaching less while dragging, full over the strip, by transform and opacity only
    expect(itemCss).toMatch(/\.split-glow \{\n  position: absolute;\n  opacity: 0\.6;/)
    expect(itemCss).toMatch(/transition: transform 260ms cubic-bezier\(0\.22, 1, 0\.36, 1\), opacity 260ms cubic-bezier\(0\.22, 1, 0\.36, 1\);/)
    expect(itemCss).toMatch(/\.split-dropzone\.active \.split-glow \{\n  opacity: 1;\n  transform: none;/)
    // the strip that takes the drop stays inside the reach of Panel's internal-drop fallback (80px top, 100px sides)
    expect(itemCss).toMatch(/\.split-dropzone\.pos-top \{[^}]*height: 64px;/)
    expect(itemCss).toMatch(/\.split-dropzone\.pos-left,\n\.split-dropzone\.pos-right \{[^}]*width: 88px;/)
    expect(panel).toContain('(isTop && pos.y <= 80)')
    expect(panel).toContain('(!isTop && !isRight && pos.x <= 100)')
  })

  it('the detach help text no longer names a colour, in every language', () => {
    const tr = read('src/i18n/translations.ts')
    expect(tr).not.toMatch(/coral|Coral|corail|Koralle|corallo|珊瑚|коралл|кораловий|코랄|कोरल|مرجان|কোরাল|mercan|san hô|koral|κοραλί|korál/)
  })
})
