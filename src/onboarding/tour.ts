/**
 * The tour's demos: each step plays the real shelf (Panel and its cards) on
 * example items, by writing the same store state the app itself sets while a
 * user copies, drags, stacks, splits, merges and previews. Store actions that
 * talk to main are never called (they would act on the user's real panel
 * window); state is written with useStore.setState directly.
 *
 * The camera (lens.ts) pushes in where a step's action starts and pulls
 * back with the pointer as it reaches its destination; every position here is
 * in scene pixels (rect, centre), which the camera does not change.
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
import { aim, REST, toLocal, toScreen, zoomRest, zoomTo, type Rect, type View } from './lens'
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

  /** An animation made elsewhere, stopped with the run. */
  keep(a: Animation): Animation {
    this.anims.push(a)
    return a
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
  /** The camera over all of the above (lens.ts). */
  lens: HTMLElement
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
  document.body.classList.remove('ob-preview-pan')
  stage.keys.getAnimations().forEach((a) => a.cancel())
  stage.notesImage.getAnimations().forEach((a) => a.cancel())
  clearMarks(stage)
  stage.root.querySelector('.ob-cam')?.classList.remove('is-push')
  const view = openingView(next)
  if (view) zoomTo(stage.lens, view, 900)
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

/** An element's box in scene pixels. */
const rect = (stage: Stage, el: Element): Rect => toLocal(stage.lens, el.getBoundingClientRect())

const centre = (stage: Stage, el: Element) => {
  const r = rect(stage, el)
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

// ---------- the camera's framings (lens.ts) ----------

/** How far the camera pushes in on a window or a card. */
const PUSH = 1.3

/** The shelf close-up: the whole row of cards, bigger, with the screen's top edge (the bar, its light) in frame. */
const SHELF_CLOSE: View = aim(1.35, { x: 400, y: 0 }, { x: 400, y: -15 })

/** Pushed in with the screen's top edge kept in frame (the bar, the copy flare), `focusX` staying at `atX`. */
const withEdge = (k: number, focusX: number, atX = 400): View => aim(k, { x: focusX, y: 0 }, { x: atX, y: -15 })

/** Pushed in on a window, centred in the space above the step's text. */
const onWindow = (box: Rect): View => aim(PUSH, { x: box.left + box.width / 2, y: box.top + box.height / 2 }, { x: 400, y: 236 })

/**
 * The framing a step opens on: the shelf close-up for the steps that play on the row of cards (the
 * camera stays there from one to the next), the whole scene otherwise. Preview keeps what it gets and
 * pulls back as its pointer comes in (its flyout opens outside the camera, at rest).
 */
function openingView(step?: string): View | null {
  if (step === 'ungroup' || step === 'merge') return SHELF_CLOSE
  if (step === 'preview') return null
  return REST
}

/**
 * The other apps open with a short rise and close with a fade (a class: .is-up). Not tied to a run: on a
 * step change they fade out instead of vanishing, and a replay finds them already up. Not a held
 * animation either: the browser may drop a finished animation nobody references and leave its last
 * value stuck, which kept a window on screen after its step.
 */
function showWindow(el: HTMLElement) {
  el.classList.add('is-up')
}

function hideWindow(el: HTMLElement) {
  el.classList.remove('is-up')
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
    stage.lens.append(this.el)
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
    stage.lens.append(this.el)
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

/**
 * Ctrl+C on screen: centred, or beside the window being copied from (`beside`, in scene pixels), as that
 * window is framed on screen: to its right, or to its left where the right has no room.
 */
async function keys(run: Run, stage: Stage, label: string, beside?: Rect) {
  stage.keysLabel.textContent = label
  stage.keys.style.right = beside ? 'auto' : ''
  stage.keys.style.left = beside ? '0px' : ''
  stage.keys.style.top = ''
  if (beside) {
    const a = toScreen(stage.lens, { x: beside.left, y: beside.top })
    const b = toScreen(stage.lens, { x: beside.right, y: beside.bottom })
    const w = stage.keys.offsetWidth
    const x = b.x + 14 + w <= 792 ? b.x + 14 : a.x - 14 - w
    stage.keys.style.left = `${Math.round(x)}px`
    stage.keys.style.top = `${Math.round((a.y + b.y) / 2 - 34)}px`
  }
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
  // the camera pushes in on the bar with the pointer; the laptop's lower half (bezel, taskbar, base) fades
  // as it would run down under the text
  // (under reduced motion the camera stays put, and so does the laptop)
  const cam = document.documentElement.dataset.motion === 'reduce' ? null : stage.root.querySelector('.ob-cam')
  cam?.classList.add('is-push')
  zoomTo(stage.lens, aim(PUSH, { x: 400, y: LAPTOP_SCREEN.top }, { x: 400, y: 44 }, true), 800, MOVE)
  await p.move(400, LAPTOP_SCREEN.top + 3, 800)
  set({ open: true })
  await run.sleep(1200)
  zoomRest(stage.lens, 1000)
  cam?.classList.remove('is-push')
  await p.move(520, 330, 650)
  set({ open: false })
  await run.sleep(400)
  await p.hide()
  await run.sleep(300)
}

/** The selection highlight behind an element (a line of the page, the address). */
const hl = (el: Element) => el.querySelector<HTMLElement>('.ob-hl')!

/**
 * A text selection made by dragging, following the pointer frame by frame: a line above the pointer is
 * selected in full, the line it is on up to the pointer, the lines below not yet.
 */
function selectAlong(run: Run, stage: Stage, lines: HTMLElement[], rows: Rect[]) {
  const bars = lines.map((l) => {
    const a = run.keep(hl(l).animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 1000, fill: 'forwards' }))
    a.pause()
    a.currentTime = 0
    return a
  })
  let on = true
  const frame = () => {
    if (!on || run.dead) return
    const m = new DOMMatrixReadOnly(getComputedStyle(stage.cursor).transform)
    // the arrow's tip (Pointer.tf)
    const x = m.e + 2
    const y = m.f + 2
    rows.forEach((r, i) => {
      const f = y >= r.bottom ? 1 : y < r.top ? 0 : Math.min(1, Math.max(0, (x - r.left) / r.width))
      bars[i].currentTime = f * 1000
    })
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  return {
    stop() {
      on = false
      // the drag ends at the sentence's end: all of it is selected
      bars.forEach((a) => { a.currentTime = 1000 })
    }
  }
}

/** A selection ends: its highlight goes. */
function deselect(run: Run, el: HTMLElement) {
  if (!el.getAnimations().length) return
  run.animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease' }).catch(() => {})
}

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
  const box = rect(stage, page)
  const now = Date.now()

  // 1. a sentence: press at its start and drag to its end, the selection following the pointer line by line
  const lines = [...page.querySelectorAll<HTMLElement>('.ob-line')]
  const r0 = rect(stage, lines[0])
  // the camera pushes in on the page as the pointer comes in, the screen's edge (where each copy lights) in frame
  zoomTo(stage.lens, withEdge(PUSH, box.left + box.width / 2), 1000)
  await p.show(box.left + box.width * 0.55, box.bottom - 30)
  await p.move(r0.left, r0.top + r0.height / 2, 650)
  await p.press()
  // drag along the first line, then down to the end of the sentence; the selection is where the pointer is
  const rows = lines.map((l) => rect(stage, l))
  const last = rows[rows.length - 1]
  const selecting = selectAlong(run, stage, lines, rows)
  await p.move(rows[0].right, rows[0].top + rows[0].height / 2 + 1, 560, 'cubic-bezier(.35,0,.65,1)')
  await p.move(last.right + 2, last.top + last.height / 2, 520, 'cubic-bezier(.35,0,.25,1)')
  selecting.stop()
  await run.sleep(150)
  await keys(run, stage, '', box)
  capture(demoText(now))
  copyFlare(run)
  await run.sleep(450)

  // 2. the link: a click in the address bar selects it all
  const url = page.querySelector<HTMLElement>('.ob-url')!
  const u = rect(stage, url)
  await p.move(u.left + u.width * 0.6, u.top + u.height / 2, 600)
  await p.press()
  // a click elsewhere ends the page's selection; the address selects all at once
  lines.forEach((l) => deselect(run, hl(l)))
  run.animate(hl(url), [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 140 }).catch(() => {})
  await run.sleep(250)
  await keys(run, stage, '', box)
  capture(demoLink(now))
  copyFlare(run)
  await run.sleep(450)

  // 3. the photo: right-click, Copy image
  const photo = page.querySelector<HTMLElement>('.ob-photo')!
  const ph = rect(stage, photo)
  await p.move(ph.left + ph.width * 0.45, ph.top + ph.height * 0.55, 600)
  await p.press()
  deselect(run, hl(url))
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
  const it = rect(stage, item)
  await p.move(it.left + 34, it.top + it.height / 2, 380)
  item.classList.add('is-hover')
  await run.sleep(180)
  await p.press()
  menu.classList.remove('is-open')
  item.classList.remove('is-hover')
  capture(demoImage(now))
  copyFlare(run)
  await run.sleep(700)

  // all of it is on the shelf: the camera pulls back as the pointer rides up, so the shelf opens in full view
  zoomRest(stage.lens, 750, MOVE)
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
  const c = centre(stage, icon)
  const box = rect(stage, win)
  zoomTo(stage.lens, onWindow(box), 1000)
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
  // the camera pulls back as the file rides up, so the bar swelling and the shelf opening are in full view
  zoomRest(stage.lens, 1080, MOVE)
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
  const c = centre(stage, src)
  zoomTo(stage.lens, withEdge(PUSH, c.x, c.x), 900)
  await p.move(c.x, c.y, 700)
  await p.press()
  set({ internalDragReq: { id: 'demo-image' } })
  await p.move(c.x + 6, c.y + 8, 120)
  const g = new DragImage(run, stage, ['image'], 1, { x: c.x + 6, y: c.y + 8 })
  // drop where the picture lands in the document, the camera following the drag down to it
  const { x: tx, y: ty } = centre(stage, stage.notesImage)
  const notes = rect(stage, stage.notes)
  const nx = notes.left + notes.width / 2
  zoomTo(stage.lens, aim(PUSH, { x: nx, y: notes.bottom }, { x: nx, y: 430 }), 850, MOVE)
  await Promise.all([p.move(tx, ty, 850), g.move(tx, ty, 850)])
  g.drop()
  set({ internalDragReq: null })
  await run.animate(stage.notesImage, [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], { duration: 300 })
  // a card dragged out into another app counts as used: it moves to the front (main: movePastedToTop)
  const items = useStore.getState().items
  set({ items: [...items.filter((it) => it.id === 'demo-image').map((it) => ({ ...it, capturedAt: Date.now() })), ...items.filter((it) => it.id !== 'demo-image')] })
  zoomRest(stage.lens, 1000)
  await run.sleep(300)
  await p.hide()
  await run.sleep(450)
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
  const lb = rect(stage, list)
  const box = rect(stage, win)
  const top = rect(stage, rows[0])
  const bottom = rect(stage, rows[rows.length - 1])
  // from the empty space under the list, up and to the left across the three files
  const from = { x: lb.right - 24, y: bottom.bottom + 14 }
  const to = { x: top.left + top.width * 0.42, y: top.top + top.height * 0.5 }
  zoomTo(stage.lens, onWindow(box), 1000)
  await p.show(box.right - 40, box.bottom + 30)
  await p.move(from.x, from.y, 600)
  await p.press()
  const T = 900
  const bandAt = (x: number, y: number) => ({ left: `${x - lb.left}px`, top: `${y - lb.top}px` })
  run.animate(band, [
    { ...bandAt(from.x, from.y), width: '0px', height: '0px', opacity: 1 },
    { ...bandAt(to.x, to.y), width: `${from.x - to.x}px`, height: `${from.y - to.y}px`, opacity: 1 }
  ], { duration: T, easing: 'linear' }).catch(() => {})
  // each file joins the selection as the box's edge reaches it
  for (const row of rows) {
    const reach = (from.y - (rect(stage, row).bottom - 4)) / (from.y - to.y)
    run.sleep(Math.max(0, reach) * T).then(() => row.classList.add('is-on')).catch(() => {})
  }
  await p.move(to.x, to.y, T, 'linear')
  // let go: the box goes, the three stay selected
  run.animate(band, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).catch(() => {})
  await run.sleep(300)
  await keys(run, stage, '', box)
  capture(demoStack(Date.now()))
  copyFlare(run)
  // the stack lands at the front of the shelf: the camera pulls back to show it there
  zoomRest(stage.lens, 900)
  await run.sleep(900)
  await p.move(box.right - 40, box.bottom + 30, 600)
  await p.hide()
}

/** Open the stack, drag one file to the edge light, and it becomes its own card. */
export async function demoUngroup(run: Run, stage: Stage) {
  const p = new Pointer(run, stage.cursor)
  await p.show(560, 380)
  const stackCard = card(stage, 'demo-stack')
  const c = centre(stage, stackCard)
  await p.move(c.x, c.y, 650)
  await p.press()
  set({ expandedStackId: 'demo-stack' })
  await run.sleep(550)
  // The expanded stack's first file row (StackItems).
  const tile = stage.root.querySelector<HTMLElement>('.item-main[data-id="demo-stack"] .stack-row')
  if (!tile) throw STOP
  const t = centre(stage, tile)
  await p.move(t.x, t.y, 500)
  await p.press()
  const path = DEMO_DIR + STACK_FILES[0][0]
  set({ internalDragReq: { id: 'demo-stack', paths: [path] } })
  await p.move(t.x + 6, t.y + 8, 120)
  const g = new DragImage(run, stage, [fileKindOf(path)], 1, { x: t.x + 6, y: t.y + 8 })
  // up to the light on the edge (in frame: the close-up keeps the screen's edge)
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
  const c = centre(stage, src)
  await p.move(c.x, c.y, 650)
  await p.press()
  set({ internalDragReq: { id: 'demo-image' } })
  await p.move(c.x + 6, c.y + 8, 120)
  const g = new DragImage(run, stage, ['image'], 1, { x: c.x + 6, y: c.y + 8 })
  const target = card(stage, 'demo-single')
  const tc = centre(stage, target)
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

/**
 * How far the camera pans the screen up while the preview is open, so all of it (the app's 460px, at the
 * shelf's scale: y 179 to 510) is in view above the step's text, which starts at 444 (it ends at 418); .ob-preview-pan moves the flyout (outside the camera)
 * the same way.
 */
export const PREVIEW_PAN = 92

/** Press preview on a stack: the flyout opens with every file in it, and the camera pans up to show all of it. */
export async function demoPreview(run: Run, stage: Stage) {
  const p = new Pointer(run, stage.cursor)
  await p.show(600, 380)
  const target = card(stage, 'demo-stack')
  const c = centre(stage, target)
  document.body.classList.remove('ob-preview-pan')
  zoomRest(stage.lens, 900)
  await p.move(c.x, c.y, 650)
  target.classList.add('force-actions')
  await run.sleep(250)
  const btn = target.querySelector<HTMLElement>('.act.preview-expand')
  if (btn) {
    const b = centre(stage, btn)
    await p.move(b.x, b.y, 380)
  }
  await p.press()
  const r = target.getBoundingClientRect()
  set({ previewItemId: 'demo-stack', previewItemRect: toShelfLayer(r) })
  await run.sleep(450)
  target.classList.remove('force-actions')
  await p.hide()
  // the camera pans the screen up so the whole preview is in view, and stays there while the step is up
  // (a replay or the next step brings it back)
  if (document.documentElement.dataset.motion !== 'reduce') {
    document.body.classList.add('ob-preview-pan')
    zoomTo(stage.lens, { k: 1, x: 0, y: -PREVIEW_PAN }, 750)
    await run.sleep(800)
  }
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
  // a preview's pan comes back down as the preview closes
  if (document.body.classList.contains('ob-preview-pan')) {
    document.body.classList.remove('ob-preview-pan')
    zoomRest(stage.lens, 750)
  }
  for (const m of marks(stage)) {
    if (!m.getAnimations().length) continue
    // from where it is (a selection already ended stays gone)
    const cs = getComputedStyle(m)
    const o = Number(cs.opacity)
    const t = cs.transform === 'none' ? 'scaleX(0)' : cs.transform
    m.getAnimations().forEach((a) => a.cancel())
    if (o < 0.01) continue
    run.animate(m, [{ transform: t, opacity: o }, { transform: t, opacity: 0 }], { duration: 400, easing: 'ease' }).catch(() => {})
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
