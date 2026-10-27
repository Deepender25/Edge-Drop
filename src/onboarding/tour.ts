/**
 * The tour's demos: each step plays the real shelf (Panel and its cards) on
 * example items, by writing the same store state the app itself sets while a
 * user copies, drags, stacks, splits, merges and previews. Store actions that
 * talk to main are never called (they would act on the user's real panel
 * window); state is written with useStore.setState directly.
 *
 * What is not the app itself is drawn here: the pointer, the Ctrl+C keys and
 * the other apps (a browser to copy from, File Explorer to drag a file out of,
 * a notes app to drop a card into). The drag image is the app's own drag
 * ghost (shared/dragGhost).
 */
import { useStore } from '../store/appStore'
import { setEdgeDragPull } from '../lib/edgeDrag'
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
  /** The web page the copy demo selects and copies from. */
  browser: HTMLElement
  /** File Explorer, the drag-in demo's source. */
  explorer: HTMLElement
  /** Welcome: the real shelf in place of the drawn bar on the laptop (the closed bars match exactly). */
  showShelf: (on: boolean) => void
}

const MOVE = 'cubic-bezier(.45,0,.25,1)'
const set = useStore.setState

/** Item states each step starts from, so Back and Continue land on a consistent shelf. */
export function itemsFor(step: string, now = Date.now()): ClipboardItemDto[] {
  // Copied from the page (text, link, image), then the PDF dragged in from File Explorer.
  const three = [demoImage(now - 9000), demoLink(now - 14000), demoText(now - 19000)]
  const four = [demoPdf(now - 4000), ...three]
  // Dragged out into another app, the image counts as used and moves to the front (as in the app).
  const used = [demoImage(now - 500), ...four.filter((it) => it.id !== 'demo-image')]
  const split = [demoSingle(now - 2000, STACK_FILES[0]), demoStack(now - 3000, STACK_FILES.slice(1))]
  switch (step) {
    case 'welcome': return four
    case 'collect': return []
    case 'dropin': return three
    case 'stacks': return four
    case 'drag': return [demoStack(now - 1000), ...four]
    case 'ungroup': return [used[0], demoStack(now - 1000), ...used.slice(1)]
    case 'merge': return [...split, ...used]
    case 'preview':
    case 'settings':
      return [demoMerged(now - 2000, STACK_FILES[0]), split[1], ...four.filter((it) => it.id !== 'demo-image')]
    default: return []
  }
}

/** The other app each step plays in; a step that follows in the same app keeps it up. */
const WINDOW_OF: Record<string, (stage: Stage) => HTMLElement> = {
  collect: (s) => s.browser,
  dropin: (s) => s.explorer,
  stacks: (s) => s.explorer,
  drag: (s) => s.notes
}

/** Clear everything a demo may have left behind (on cancel, Back, Continue); `next` is the step coming up. */
export function resetDemoState(stage: Stage, next?: string): void {
  stage.root.querySelectorAll('.ob-ghost').forEach((el) => el.remove())
  stage.root.querySelectorAll('.force-actions').forEach((el) => el.classList.remove('force-actions'))
  set({
    internalDragReq: null, dropTargetId: null, expandedStackId: null, previewItemId: null, previewItemRect: null,
    copyFlareActive: false, externalDrag: false, dragActive: false
  })
  setEdgeDragPull(0)
  stage.cursor.getAnimations().forEach((a) => a.cancel())
  stage.keys.getAnimations().forEach((a) => a.cancel())
  stage.notesImage.getAnimations().forEach((a) => a.cancel())
  clearMarks(stage)
  const keep = next ? WINDOW_OF[next]?.(stage) : undefined
  for (const w of [stage.notes, stage.browser, stage.explorer]) if (w !== keep) hideWindow(w)
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

/** The other apps open with a short rise; a replay finds them already up. Not tied to a run: on a step change they fade out (hideWindow) instead of vanishing. */
function showWindow(el: HTMLElement) {
  const now = Number(getComputedStyle(el).opacity)
  if (now > 0.99 && !el.dataset.leaving) return
  el.getAnimations().forEach((a) => a.cancel())
  delete el.dataset.leaving
  el.animate([{ opacity: now, transform: now > 0 ? 'none' : 'translateY(14px) scale(.97)' }, { opacity: 1, transform: 'none' }], {
    duration: 420, easing: 'cubic-bezier(.3,.8,.2,1)', fill: 'forwards'
  })
}

function hideWindow(el: HTMLElement) {
  if (!el.getAnimations().length || el.dataset.leaving) return
  const now = getComputedStyle(el).opacity
  el.getAnimations().forEach((a) => a.cancel())
  el.dataset.leaving = '1'
  const a = el.animate([{ opacity: now }, { opacity: 0 }], { duration: 260, easing: 'ease', fill: 'forwards' })
  a.finished.then(() => { if (el.dataset.leaving) { delete el.dataset.leaving; a.cancel() } }).catch(() => {})
}

/** Text selections and the selected file in the other apps (they fade on a rewind). */
const marks = (stage: Stage) => [...stage.root.querySelectorAll<HTMLElement>('.ob-hl')]

function clearMarks(stage: Stage) {
  marks(stage).forEach((el) => el.getAnimations().forEach((a) => a.cancel()))
  stage.root.querySelectorAll('.ob-band').forEach((el) => el.getAnimations().forEach((a) => a.cancel()))
  stage.root.querySelectorAll('.ob-menu, .ob-file.is-on').forEach((el) => el.classList.remove('is-open', 'is-on'))
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
  move(x: number, y: number, ms: number, easing = MOVE) {
    const from = this.at
    this.at = { x, y }
    return this.run.animate(this.el, [{ opacity: 1, transform: this.tf(from) }, { opacity: 1, transform: this.tf(this.at) }], { duration: ms, easing })
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
  move(x: number, y: number, ms: number, easing = MOVE) {
    const from = this.at
    this.at = { x, y }
    return this.run.animate(this.el, [{ transform: this.tf(from) }, { transform: this.tf(this.at) }], { duration: ms, easing })
  }
  /** Dropped: the drag image goes the moment the drop lands. */
  drop() {
    this.el.remove()
  }
}

/**
 * What Windows shows while a file is dragged out of File Explorer: the file's icon, see-through, riding
 * just above the pointer, and a "+ Copy" label once it is over a place that takes it.
 */
class FileGhost {
  readonly el: HTMLDivElement
  constructor(private run: Run, stage: Stage, kind: FileKind, private at: { x: number; y: number }) {
    this.el = document.createElement('div')
    this.el.className = 'ob-ghost ob-file-ghost'
    this.el.innerHTML = `<img src="${fileIconUrl(kind)}" alt=""><span>+ Copy</span>`
    this.el.style.transform = this.tf(at)
    stage.root.append(this.el)
    run.animate(this.el, [{ opacity: 0 }, { opacity: 1 }], { duration: 140, fill: 'none' }).catch(() => {})
  }
  private tf(p: { x: number; y: number }) {
    return `translate(${p.x - 20}px, ${p.y - 34}px)`
  }
  move(x: number, y: number, ms: number, easing = MOVE) {
    const from = this.at
    this.at = { x, y }
    return this.run.animate(this.el, [{ transform: this.tf(from) }, { transform: this.tf(this.at) }], { duration: ms, easing })
  }
  copying(on: boolean) {
    this.el.classList.toggle('is-copy', on)
  }
  drop() {
    this.el.remove()
  }
}

/** Ctrl+C on screen: centred, or (`at`) beside the app being copied from. */
async function keys(run: Run, stage: Stage, label: string, at?: { x: number; y: number }) {
  stage.keysLabel.textContent = label
  stage.keys.style.left = at ? `${at.x}px` : ''
  stage.keys.style.right = at ? 'auto' : ''
  stage.keys.style.top = at ? `${at.y}px` : ''
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

/** The selection highlight behind an element (a line of the page, the address). */
const hl = (el: Element) => el.querySelector<HTMLElement>('.ob-hl')!

/**
 * Copy from a web page the way people do, with the shelf closed: select a sentence and press Ctrl+C,
 * click the address and press Ctrl+C, right-click the photo and choose Copy image. Each copy lights the
 * edge; then the pointer opens the shelf and all three are there.
 */
export async function demoCollect(run: Run, stage: Stage) {
  const p = new Pointer(run, stage.cursor)
  const page = stage.browser
  clearMarks(stage)
  showWindow(page)
  await run.sleep(250)
  const box = page.getBoundingClientRect()
  // Ctrl+C beside the browser, out of the way of what is being copied
  const side = { x: box.right + 18, y: box.top + box.height / 2 - 34 }
  const now = Date.now()

  // 1. a sentence: press at its start and drag to its end, the selection following the pointer line by line
  const lines = [...page.querySelectorAll<HTMLElement>('.ob-line')]
  const r0 = lines[0].getBoundingClientRect()
  await p.show(box.left + box.width * 0.55, box.bottom - 30)
  await p.move(r0.left, r0.top + r0.height / 2, 650)
  await p.press()
  for (const [k, line] of lines.entries()) {
    const r = line.getBoundingClientRect()
    const ms = k === 0 ? 520 : 300
    await Promise.all([
      p.move(r.right, r.top + r.height / 2, ms, 'linear'),
      run.animate(hl(line), [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: ms, easing: 'linear' })
    ])
  }
  await run.sleep(150)
  await keys(run, stage, '', side)
  capture(demoText(now))
  copyFlare(run)
  await run.sleep(450)

  // 2. the link: a click in the address bar selects it all
  const url = page.querySelector<HTMLElement>('.ob-url')!
  const u = url.getBoundingClientRect()
  await p.move(u.left + u.width * 0.6, u.top + u.height / 2, 600)
  await p.press()
  run.animate(hl(url), [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 140 }).catch(() => {})
  await run.sleep(250)
  await keys(run, stage, '', side)
  capture(demoLink(now))
  copyFlare(run)
  await run.sleep(450)

  // 3. the photo: right-click, Copy image
  const photo = page.querySelector<HTMLElement>('.ob-photo')!
  const ph = photo.getBoundingClientRect()
  await p.move(ph.left + ph.width * 0.45, ph.top + ph.height * 0.55, 600)
  await p.press()
  const menu = page.querySelector<HTMLElement>('.ob-menu')!
  // at the pointer, flipped to the other side where it would not fit in the window (as real menus do)
  const mx = ph.left + ph.width * 0.45 - box.left
  const my = ph.top + ph.height * 0.55 - box.top
  const fitsRight = mx + 4 + menu.offsetWidth <= box.width - 6
  const fitsBelow = my + 4 + menu.offsetHeight <= box.height - 6
  menu.style.left = `${fitsRight ? mx + 4 : mx - 4 - menu.offsetWidth}px`
  menu.style.top = `${fitsBelow ? my + 4 : my - 4 - menu.offsetHeight}px`
  menu.style.transformOrigin = `${fitsRight ? 0 : 100}% ${fitsBelow ? 0 : 100}%`
  menu.classList.add('is-open')
  await run.sleep(260)
  const item = menu.querySelector<HTMLElement>('.is-copy')!
  const it = item.getBoundingClientRect()
  await p.move(it.left + 34, it.top + it.height / 2, 380)
  item.classList.add('is-hover')
  await run.sleep(180)
  await p.press()
  menu.classList.remove('is-open')
  item.classList.remove('is-hover')
  capture(demoImage(now))
  copyFlare(run)
  await run.sleep(700)

  // all of it is on the shelf
  await p.move(400, TOUR_SCREEN_TOP + 5, 750)
  set({ open: true })
  await run.sleep(900)
  await p.move(560, 380, 600)
  await p.hide()
}

/**
 * Drag a file in from File Explorer: as it nears the edge the bar swells (the app's own pull, in steps),
 * at the bar the shelf opens into its drop zone, over the shelf the zone lights, and the drop lands as a card.
 */
export async function demoDropIn(run: Run, stage: Stage) {
  const p = new Pointer(run, stage.cursor)
  const win = stage.explorer
  clearMarks(stage)
  showWindow(win)
  await run.sleep(250)
  const row = win.querySelector<HTMLElement>('.ob-file.is-pdf')!
  const icon = row.querySelector('img')!
  const c = centre(icon)
  await p.show(560, 380)
  await p.move(c.x, c.y, 650)
  row.classList.add('is-on')
  await p.press()
  await p.move(c.x + 6, c.y + 8, 120)
  set({ externalDrag: true })
  const g = new FileGhost(run, stage, 'pdf', { x: c.x + 6, y: c.y + 8 })
  // toward the bar: one smooth glide in three legs, the swell growing at each
  const from = { x: c.x + 6, y: c.y + 8 }
  const bar = { x: 400, y: TOUR_SCREEN_TOP + 6 }
  const legs: Array<[number, number, string, number]> = [
    [0.4, 420, 'cubic-bezier(.45,0,1,1)', 0.3],
    [0.75, 300, 'linear', 0.6],
    [1, 360, 'cubic-bezier(0,0,.3,1)', 0.9]
  ]
  for (const [t, ms, easing, pull] of legs) {
    const x = from.x + (bar.x - from.x) * t
    const y = from.y + (bar.y - from.y) * t
    await Promise.all([p.move(x, y, ms, easing), g.move(x, y, ms, easing)])
    setEdgeDragPull(pull)
  }
  // at the bar: the shelf opens straight into its drop zone
  set({ open: true })
  await run.sleep(420)
  const over = { x: 400, y: TOUR_SCREEN_TOP + 62 }
  await Promise.all([p.move(over.x, over.y, 380), g.move(over.x, over.y, 380)])
  set({ dragActive: true })
  g.copying(true)
  await run.sleep(420)
  // the drop: the zone takes it in (DropOverlay listens for the drop), then the card is there
  g.drop()
  document.dispatchEvent(new Event('drop'))
  set({ externalDrag: false, dragActive: false })
  setEdgeDragPull(0)
  await run.sleep(260)
  capture(demoPdf(Date.now()))
  await run.sleep(500)
  row.classList.remove('is-on')
  await p.move(560, 380, 600)
  await p.hide()
}

/** Drag the image card out of the shelf into another app. */
export async function demoDrag(run: Run, stage: Stage) {
  const p = new Pointer(run, stage.cursor)
  showWindow(stage.notes)
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
  // a card dragged out into another app counts as used: it moves to the front (main: movePastedToTop)
  const items = useStore.getState().items
  set({ items: [...items.filter((it) => it.id === 'demo-image').map((it) => ({ ...it, capturedAt: Date.now() })), ...items.filter((it) => it.id !== 'demo-image')] })
  await run.sleep(300)
  await p.hide()
}

/**
 * Select three files in File Explorer (a selection box drawn across them, as on the desktop) and press
 * Ctrl+C: they land on the shelf as one stack.
 */
export async function demoStacks(run: Run, stage: Stage) {
  const p = new Pointer(run, stage.cursor)
  const win = stage.explorer
  clearMarks(stage)
  showWindow(win)
  await run.sleep(250)
  const list = win.querySelector<HTMLElement>('.ob-files')!
  const band = list.querySelector<HTMLElement>('.ob-band')!
  const rows = [...list.querySelectorAll<HTMLElement>('.ob-file:not(.is-pdf)')]
  const lb = list.getBoundingClientRect()
  const box = win.getBoundingClientRect()
  const top = rows[0].getBoundingClientRect()
  const bottom = rows[rows.length - 1].getBoundingClientRect()
  // from the empty space under the list, up and to the left across the three files
  const from = { x: lb.right - 24, y: bottom.bottom + 14 }
  const to = { x: top.left + top.width * 0.42, y: top.top + top.height * 0.5 }
  await p.show(box.right - 40, box.bottom + 30)
  await p.move(from.x, from.y, 600)
  await p.press()
  const T = 900
  const rect = (x: number, y: number) => ({ left: `${x - lb.left}px`, top: `${y - lb.top}px` })
  run.animate(band, [
    { ...rect(from.x, from.y), width: '0px', height: '0px', opacity: 1 },
    { ...rect(to.x, to.y), width: `${from.x - to.x}px`, height: `${from.y - to.y}px`, opacity: 1 }
  ], { duration: T, easing: 'linear' }).catch(() => {})
  // each file joins the selection as the box's edge reaches it
  for (const row of rows) {
    const reach = (from.y - (row.getBoundingClientRect().bottom - 4)) / (from.y - to.y)
    run.sleep(Math.max(0, reach) * T).then(() => row.classList.add('is-on')).catch(() => {})
  }
  await p.move(to.x, to.y, T, 'linear')
  // let go: the box goes, the three stay selected
  run.animate(band, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).catch(() => {})
  await run.sleep(300)
  await keys(run, stage, '', { x: box.right + 18, y: box.top + box.height / 2 - 34 })
  capture(demoStack(Date.now()))
  copyFlare(run)
  await run.sleep(600)
  await p.move(box.right - 40, box.bottom + 30, 600)
  await p.hide()
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
  dropin: demoDropIn,
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
  for (const m of marks(stage)) {
    if (!m.getAnimations().length) continue
    m.getAnimations().forEach((a) => a.cancel())
    run.animate(m, [{ transform: 'scaleX(1)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 0 }], { duration: 400, easing: 'ease' }).catch(() => {})
  }
  stage.root.querySelectorAll('.ob-file.is-on').forEach((el) => el.classList.remove('is-on'))
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
 * gently and plays again, for as long as the step is up. Next moves on at any moment. `played` is told
 * each time the demo reaches its end (autoplay times the step on it).
 */
export async function playLooped(run: Run, stage: Stage, step: string, open: boolean, demo: (run: Run, stage: Stage) => Promise<void>, played?: () => void) {
  for (;;) {
    await demo(run, stage)
    if (!run.dead) played?.()
    await idleFor(run, REPLAY_IDLE)
    await rewind(run, stage, step, open)
  }
}
