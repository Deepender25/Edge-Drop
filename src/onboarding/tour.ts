/**
 * The tour's demos: each step plays the real shelf (Panel and its cards) on
 * example items, by writing the same store state the app itself sets while a
 * user copies, drags, stacks, splits, merges and previews. Store actions that
 * talk to main are never called (they would act on the user's real panel
 * window); state is written with useStore.setState directly.
 *
 * What is not the app itself is drawn here: the pointer, the Ctrl+C keys and
 * the other app the card is dropped into. The drag image is the app's own
 * drag ghost (shared/dragGhost).
 */
import { useStore } from '../store/appStore'
import type { ClipboardItemDto } from '../../shared/types'
import { dragGhostSvg } from '../../shared/dragGhost'
import { fileIconUrl, fileKindOf, type FileKind } from '../lib/fileKind'
import { LAPTOP_SCREEN, SHELF_SCALE, TOUR_SCREEN_TOP, toShelfLayer } from './edgeBar'
import {
  demoText, demoLink, demoImage, demoPdf, demoStack, demoSingle, demoMerged, STACK_FILES, DEMO_DIR
} from './demoItems'

export const STOP = Symbol('stop')

/** One running demo; cancelling it stops every pending wait and animation. */
export class Run {
  dead = false
  private timers: number[] = []
  private anims: Animation[] = []

  sleep(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.timers.push(window.setTimeout(() => (this.dead ? reject(STOP) : resolve()), ms))
    })
  }

  animate(el: Element, keyframes: Keyframe[], opts: KeyframeAnimationOptions): Promise<void> {
    const a = el.animate(keyframes, { fill: 'forwards', easing: 'cubic-bezier(.3,.8,.2,1)', ...opts })
    this.anims.push(a)
    return a.finished.then(
      () => { if (this.dead) throw STOP },
      () => { throw STOP }
    )
  }

  cancel(): void {
    this.dead = true
    this.timers.forEach(clearTimeout)
    this.anims.forEach((a) => a.cancel())
  }
}

/** The parts of the onboarding stage the demos move. */
export interface Stage {
  root: HTMLElement
  cursor: HTMLElement
  keys: HTMLElement
  keysLabel: HTMLElement
  notes: HTMLElement
  notesImage: HTMLElement
  /** Welcome: the real shelf in place of the drawn bar on the laptop (the closed bars match exactly). */
  showShelf: (on: boolean) => void
}

const MOVE = 'cubic-bezier(.45,0,.25,1)'
const set = useStore.setState

/** Item states each step starts from, so Back and Continue land on a consistent shelf. */
export function itemsFor(step: string, now = Date.now()): ClipboardItemDto[] {
  const four = [demoText(now - 4000), demoImage(now - 9000), demoLink(now - 14000), demoPdf(now - 19000)]
  const split = [demoSingle(now - 2000, STACK_FILES[0]), demoStack(now - 3000, STACK_FILES.slice(1))]
  switch (step) {
    case 'welcome': return four
    case 'collect': return []
    case 'drag': return four
    case 'stacks': return four
    case 'ungroup': return [demoStack(now - 1000), ...four]
    case 'merge': return [...split, ...four]
    case 'preview':
    case 'settings':
      return [demoMerged(now - 2000, STACK_FILES[0]), split[1], four[0], four[2], four[3]]
    default: return []
  }
}

/** Clear everything a demo may have left behind (on cancel, Back, Continue). */
export function resetDemoState(stage: Stage): void {
  stage.root.querySelectorAll('.ob-ghost').forEach((el) => el.remove())
  stage.root.querySelectorAll('.force-actions').forEach((el) => el.classList.remove('force-actions'))
  set({ internalDragReq: null, dropTargetId: null, expandedStackId: null, previewItemId: null, previewItemRect: null, copyFlareActive: false })
  stage.cursor.getAnimations().forEach((a) => a.cancel())
  stage.keys.getAnimations().forEach((a) => a.cancel())
  stage.notes.getAnimations().forEach((a) => a.cancel())
  stage.notesImage.getAnimations().forEach((a) => a.cancel())
  stage.root.querySelector('.ob-shelf')?.getAnimations().forEach((a) => a.cancel())
}

// ---------- helpers ----------

function card(stage: Stage, id: string): HTMLElement {
  const el = stage.root.querySelector<HTMLElement>(`.item-main[data-id="${id}"]`)
  if (!el) throw STOP
  return el
}

const centre = (el: Element) => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

class Pointer {
  private at = { x: 560, y: 380 }
  constructor(private run: Run, private el: HTMLElement) {}
  private tf(p: { x: number; y: number }, extra = '') {
    // The arrow's tip (see .ob-cursor) is the hotspot.
    return `translate(${p.x - 2}px, ${p.y - 2}px) ${extra}`
  }
  show(x: number, y: number) {
    this.at = { x, y }
    return this.run.animate(this.el, [{ opacity: 0, transform: this.tf(this.at) }, { opacity: 1, transform: this.tf(this.at) }], { duration: 200 })
  }
  hide() {
    return this.run.animate(this.el, [{ opacity: 1, transform: this.tf(this.at) }, { opacity: 0, transform: this.tf(this.at) }], { duration: 250 })
  }
  move(x: number, y: number, ms: number) {
    const from = this.at
    this.at = { x, y }
    return this.run.animate(this.el, [{ opacity: 1, transform: this.tf(from) }, { opacity: 1, transform: this.tf(this.at) }], { duration: ms, easing: MOVE })
  }
  press() {
    return this.run.animate(
      this.el,
      [{ opacity: 1, transform: this.tf(this.at) }, { opacity: 1, transform: this.tf(this.at, 'scale(.82)') }, { opacity: 1, transform: this.tf(this.at) }],
      { duration: 220 }
    )
  }
}

/**
 * The drag image Windows shows under the pointer during a drag out of the
 * shelf: the app's own drag ghost (shared/dragGhost, the same layout main
 * rasterizes for the real drag), file-kind art with a "+N" badge for stacks.
 */
class DragImage {
  readonly el: HTMLDivElement
  /** Drawn at the drag ghost's real size relative to the shelf (122px, 142px with a badge). */
  private w = 122 * SHELF_SCALE
  private h = 122 * SHELF_SCALE
  constructor(private run: Run, stage: Stage, kinds: FileKind[], count: number, private at: { x: number; y: number }) {
    this.el = document.createElement('div')
    this.el.className = 'ob-ghost'
    this.el.innerHTML = dragGhostSvg(kinds.map((k) => fileIconUrl(k)), count)
    if (count > 1) this.w = this.h = 142 * SHELF_SCALE
    const svg = this.el.firstElementChild as SVGElement | null
    svg?.setAttribute('width', String(this.w))
    svg?.setAttribute('height', String(this.h))
    this.el.style.transform = this.tf(at)
    stage.root.append(this.el)
    run.animate(this.el, [{ opacity: 0 }, { opacity: 1 }], { duration: 90, fill: 'none' }).catch(() => {})
  }
  private tf(p: { x: number; y: number }) {
    return `translate(${p.x - this.w / 2}px, ${p.y - this.h / 2}px)`
  }
  move(x: number, y: number, ms: number) {
    const from = this.at
    this.at = { x, y }
    return this.run.animate(this.el, [{ transform: this.tf(from) }, { transform: this.tf(this.at) }], { duration: ms, easing: MOVE })
  }
  /** Dropped: the drag image goes the moment the drop lands. */
  drop() {
    this.el.remove()
  }
}

async function keys(run: Run, stage: Stage, label: string) {
  stage.keysLabel.textContent = label
  await run.animate(stage.keys, [{ opacity: 0, transform: 'translateY(10px) scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: 160 })
  await run.sleep(300)
  run.animate(stage.keys, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 200 }).catch(() => {})
}

/** The app's copy confirmation at the edge (what `ui:copy-flare` shows, held 780ms). */
function copyFlare(run: Run) {
  set({ copyFlareActive: true, flareKey: Date.now() })
  run.sleep(780).then(() => set({ copyFlareActive: false })).catch(() => {})
}

function capture(item: ClipboardItemDto) {
  set({ items: [item, ...useStore.getState().items.filter((it) => it.id !== item.id)] })
}

// ---------- the demos ----------

/** Welcome: the pointer goes to the bar on the edge and the shelf opens; it moves away and the shelf hides. */
export async function demoWelcome(run: Run, stage: Stage) {
  const p = new Pointer(run, stage.cursor)
  set({ items: itemsFor('welcome'), open: false })
  stage.showShelf(true)
  await p.show(540, 250)
  await p.move(400, LAPTOP_SCREEN.top + 3, 800)
  set({ open: true })
  await run.sleep(1200)
  await p.move(520, 330, 650)
  set({ open: false })
  await run.sleep(400)
  await p.hide()
}

/** Copy four things while the shelf is closed, then open it: everything is there. */
export async function demoCollect(run: Run, stage: Stage) {
  const p = new Pointer(run, stage.cursor)
  const now = Date.now()
  for (const [item, label] of [
    [demoPdf(now), 'Itinerary.pdf'],
    [demoLink(now), 'A link'],
    [demoImage(now), 'A photo'],
    [demoText(now), 'A note']
  ] as const) {
    await keys(run, stage, label)
    capture(item)
    copyFlare(run)
    await run.sleep(500)
  }
  await p.show(560, 300)
  await p.move(400, TOUR_SCREEN_TOP + 5, 700)
  set({ open: true })
  await run.sleep(600)
  await p.move(520, 330, 600)
  await p.hide()
}

/** Drag the image card out of the shelf into another app. */
export async function demoDrag(run: Run, stage: Stage) {
  const p = new Pointer(run, stage.cursor)
  // the other app opens once; a replay finds it already there
  if (!stage.notes.getAnimations().length) {
    run.animate(stage.notes, [{ opacity: 0, transform: 'translateY(14px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 420 }).catch(() => {})
  }
  await p.show(600, 400)
  const src = card(stage, 'demo-image')
  const c = centre(src)
  await p.move(c.x, c.y, 700)
  await p.press()
  set({ internalDragReq: { id: 'demo-image' } })
  await p.move(c.x + 6, c.y + 8, 120)
  const g = new DragImage(run, stage, ['image'], 1, { x: c.x + 6, y: c.y + 8 })
  // drop where the picture lands in the document
  const { x: tx, y: ty } = centre(stage.notesImage)
  await Promise.all([p.move(tx, ty, 850), g.move(tx, ty, 850)])
  g.drop()
  set({ internalDragReq: null })
  await run.animate(stage.notesImage, [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], { duration: 300 })
  await run.sleep(300)
  await p.hide()
}

/** Copy three files at once: they arrive as one stack. */
export async function demoStacks(run: Run, stage: Stage) {
  await keys(run, stage, '3 files')
  capture(demoStack(Date.now()))
  copyFlare(run)
}

/** Open the stack, drag one file to the edge light, and it becomes its own card. */
export async function demoUngroup(run: Run, stage: Stage) {
  const p = new Pointer(run, stage.cursor)
  await p.show(560, 380)
  const stackCard = card(stage, 'demo-stack')
  const c = centre(stackCard)
  await p.move(c.x, c.y, 650)
  await p.press()
  set({ expandedStackId: 'demo-stack' })
  await run.sleep(550)
  // The expanded stack's first file row (StackItems).
  const tile = stage.root.querySelector<HTMLElement>('.item-main[data-id="demo-stack"] .stack-row')
  if (!tile) throw STOP
  const t = centre(tile)
  await p.move(t.x, t.y, 500)
  await p.press()
  const path = DEMO_DIR + STACK_FILES[0][0]
  set({ internalDragReq: { id: 'demo-stack', paths: [path] } })
  await p.move(t.x + 6, t.y + 8, 120)
  const g = new DragImage(run, stage, [fileKindOf(path)], 1, { x: t.x + 6, y: t.y + 8 })
  const ex = 400, ey = TOUR_SCREEN_TOP + 5
  await Promise.all([p.move(ex, ey, 900), g.move(ex, ey, 900)])
  await run.sleep(500) // the edge light answers the drag
  g.drop()
  set({ internalDragReq: null, expandedStackId: null })
  const now = Date.now()
  set({ items: [demoSingle(now, STACK_FILES[0]), demoStack(now - 1000, STACK_FILES.slice(1)), ...useStore.getState().items.filter((it) => it.id !== 'demo-stack')] })
  await run.sleep(400)
  await p.hide()
}

/** Drop the image onto the single file: they become one stack. */
export async function demoMerge(run: Run, stage: Stage) {
  const p = new Pointer(run, stage.cursor)
  await p.show(600, 380)
  const src = card(stage, 'demo-image')
  const c = centre(src)
  await p.move(c.x, c.y, 650)
  await p.press()
  set({ internalDragReq: { id: 'demo-image' } })
  await p.move(c.x + 6, c.y + 8, 120)
  const g = new DragImage(run, stage, ['image'], 1, { x: c.x + 6, y: c.y + 8 })
  const target = card(stage, 'demo-single')
  const tc = centre(target)
  await Promise.all([p.move(tc.x, tc.y, 950), g.move(tc.x, tc.y, 950)])
  set({ dropTargetId: 'demo-single' })
  await run.sleep(450)
  g.drop()
  const now = Date.now()
  set({
    internalDragReq: null,
    dropTargetId: null,
    items: [demoMerged(now, STACK_FILES[0]), ...useStore.getState().items.filter((it) => it.id !== 'demo-single' && it.id !== 'demo-image')]
  })
  await run.sleep(400)
  await p.hide()
}

/** Press preview on a card: the flyout opens with the whole stack. */
export async function demoPreview(run: Run, stage: Stage) {
  const p = new Pointer(run, stage.cursor)
  await p.show(600, 380)
  const target = card(stage, 'demo-single')
  const c = centre(target)
  await p.move(c.x, c.y, 650)
  target.classList.add('force-actions')
  await run.sleep(250)
  const btn = target.querySelector<HTMLElement>('.act.preview-expand')
  if (btn) {
    const b = centre(btn)
    await p.move(b.x, b.y, 380)
  }
  await p.press()
  const r = target.getBoundingClientRect()
  set({ previewItemId: 'demo-single', previewItemRect: toShelfLayer(r) })
  await run.sleep(500)
  target.classList.remove('force-actions')
  await p.hide()
}

export const DEMOS: Record<string, ((run: Run, stage: Stage) => Promise<void>) | undefined> = {
  welcome: demoWelcome,
  collect: demoCollect,
  drag: demoDrag,
  stacks: demoStacks,
  ungroup: demoUngroup,
  merge: demoMerge,
  preview: demoPreview
}

// ---------- replays ----------

/** How long the viewer has to be idle on a finished demo before it plays again. */
const REPLAY_IDLE = 4000

let lastActive = 0

/** Tracks the viewer's activity (pointer, wheel, keys), so a replay waits while they are busy. */
export function watchActivity(): () => void {
  const mark = () => { lastActive = performance.now() }
  const events = ['pointermove', 'pointerdown', 'wheel', 'keydown'] as const
  events.forEach((e) => window.addEventListener(e, mark, { passive: true }))
  return () => events.forEach((e) => window.removeEventListener(e, mark))
}

/** Resolves once the viewer has been idle for `ms` since `from` (activity restarts the count). */
async function idleFor(run: Run, ms: number) {
  const from = performance.now()
  while (performance.now() - Math.max(from, lastActive) < ms) await run.sleep(200)
}

const shelfLayer = (stage: Stage) => stage.root.querySelector<HTMLElement>('.ob-shelf')

/**
 * Back to the step's start for a replay, gently: the preview closes, the dropped picture fades from the
 * other app, and when the cards differ the shelf fades out, takes the step's cards back and fades in
 * (a step that starts closed folds its shelf into the bar instead, its own start).
 */
async function rewind(run: Run, stage: Stage, step: string, open: boolean) {
  const st = useStore.getState()
  set({ previewItemId: null, previewItemRect: null, expandedStackId: null })
  if (stage.notesImage.getAnimations().length) {
    stage.notesImage.getAnimations().forEach((a) => a.cancel())
    await run.animate(stage.notesImage, [{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: 'ease' })
  }
  const start = itemsFor(step)
  const same = start.length === st.items.length && start.every((it, i) => it.id === st.items[i].id)
  if (same) {
    await run.sleep(400)
  } else if (!open) {
    set({ open: false })
    await run.sleep(600)
    set({ items: start })
  } else {
    const layer = shelfLayer(stage)
    if (layer) await run.animate(layer, [{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: 'ease-in' })
    set({ items: start, open: true })
    await run.sleep(120)
    // fill 'none': once faded in, the layer's own class (is-hidden) decides again
    layer?.getAnimations().forEach((a) => a.cancel())
    if (layer) await run.animate(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: 480, easing: 'ease-out', fill: 'none' })
  }
  await run.sleep(700)
}

/**
 * A step's demo plays once and rests on its result; after the viewer has been idle a while it rewinds
 * gently and plays again, for as long as the step is up. Next moves on at any moment.
 */
export async function playLooped(run: Run, stage: Stage, step: string, open: boolean, demo: (run: Run, stage: Stage) => Promise<void>) {
  for (;;) {
    await demo(run, stage)
    await idleFor(run, REPLAY_IDLE)
    await rewind(run, stage, step, open)
  }
}
