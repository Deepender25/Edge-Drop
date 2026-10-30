/**
 * The tour's demos: each step plays the real shelf (Panel and its cards) on
 * example items, by writing the same store state the app itself sets while a
 * user copies, drags in and out, splits, combines, previews, notes and searches. Store actions that
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
 * ghost (shared/dragGhost). The right-click menu, its note editor and the
 * search box are the app's own too; the store's `demo` keeps them from
 * borrowing the keyboard or saving anything to main.
 */
import { useStore } from '../store/appStore'
import { t } from '../i18n'
import { setEdgeDragPull } from '../lib/edgeDrag'
import type { ClipboardItemDto, StickPosition } from '../../shared/types'
import { dragGhostSvg } from '../../shared/dragGhost'
import { fileIconUrl, fileKindOf, type FileKind } from '../lib/fileKind'
import { LAPTOP_SCREEN, SHELF_SCALE, TOUR_SCREEN_TOP, realHotZoneWidth, realSideHotZone, toShelfLayer } from './edgeBar'
import { DEFAULT_SETTINGS } from '../../shared/types'
import { aim, REST, toLocal, toScreen, zoomRest, zoomTo, type Rect, type View } from './lens'
import {
  demoText, demoLink, demoImage, demoPdf, demoStack, demoStackWithPhoto, stackFiles, pageTitle, DEMO_DIR, demoNote, demoQuery
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

/**
 * Item states each step starts from, so Back and Continue land on a consistent shelf: each is where the
 * step before leaves it, in the order main keeps (a new card at the front, a split's card where its stack
 * was, a combined stack in its place).
 */
export function itemsFor(step: string, now = Date.now()): ClipboardItemDto[] {
  // copied from the web page: the sentence, then the photo
  const copied = [demoImage(now - 9000), demoText(now - 14000)]
  // then dragged in: the page's link from the browser, and three files from File Explorer as one stack
  const dropped = [demoStack(now - 4000), demoLink(now - 6000), ...copied]
  // the itinerary pulled out of the stack, the photo dropped into it
  const sorted = (note?: string) => [demoPdf(now - 3000, note), demoStackWithPhoto(now - 2000), demoLink(now - 6000), demoText(now - 14000)]
  switch (step) {
    case 'welcome': return dropped
    case 'collect': return []
    case 'dropin': return copied
    case 'drag': return dropped
    // dragged out into another app, the photo counts as used and moves to the front (main: movePastedToTop)
    case 'stacks': return [demoImage(now - 500), demoStack(now - 4000), demoLink(now - 6000), demoText(now - 14000)]
    case 'preview':
    case 'find':
      return sorted()
    case 'settings': return sorted(demoNote())
    default: return []
  }
}

/** The other app each step plays in; a step that follows in the same app keeps it up. */
const WINDOW_OF: Record<string, (stage: Stage) => HTMLElement> = {
  collect: (s) => s.browser,
  dropin: (s) => s.browser,
  drag: (s) => s.notes
}

/** Clear everything a demo may have left behind (on cancel, Back, Continue); `next` is the step coming up. */
export function resetDemoState(stage: Stage, next?: string): void {
  stage.root.querySelectorAll('.ob-ghost').forEach((el) => el.remove())
  stage.root.querySelectorAll('.force-actions').forEach((el) => el.classList.remove('force-actions'))
  document.querySelectorAll('.ob-cursor-top').forEach((el) => el.remove())
  leaveField()
  set({
    internalDragReq: null, dropTargetId: null, expandedStackId: null, previewItemId: null, previewItemRect: null,
    copyFlareActive: false, externalDrag: false, dragActive: false, cardMenu: null, cardMenuRect: null,
    edgeTransition: null
  })
  // a search empties at once, except when the shelf is folding away for a step on the laptop (the welcome,
  // the last step): there the shelf would fill back up as it closes, so Onboarding empties it once the
  // shelf is out of sight
  if (next !== 'welcome' && next !== 'settings') set({ query: '' })
  setEdgeDragPull(0)
  stage.cursor.getAnimations().forEach((a) => a.cancel())
  document.body.classList.remove('ob-preview-pan')
  stage.keys.getAnimations().forEach((a) => a.cancel())
  clearMarks(stage)
  stage.root.querySelector('.ob-cam')?.classList.remove('is-push')
  const view = openingView(next)
  if (view) zoomTo(stage.lens, view, 900)
  const keep = next ? WINDOW_OF[next]?.(stage) : undefined
  // the picture dropped into the notes app (a class, .is-in, not one of the run's animations, which a step
  // change stops at once) goes with its window: at once if the window stays, or once the window has faded
  // out (.ob-notes, 0.26s), instead of vanishing from it as it fades
  const picture = stage.notesImage
  if (keep === stage.notes) picture.classList.remove('is-in')
  else window.setTimeout(() => { if (!stage.notes.classList.contains('is-up')) picture.classList.remove('is-in') }, 300)
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
  if (step === 'stacks') return SHELF_CLOSE
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
  /** `k`: drawn at that scale, for a pointer outside the camera standing in for the one under it. */
  constructor(private run: Run, readonly el: HTMLElement, private k = 1) {}
  private tf(p: { x: number; y: number }, extra = '') {
    // The arrow's tip (see .ob-cursor) is the hotspot.
    const k = this.k
    return `translate(${p.x - 2 * k}px, ${p.y - 2 * k}px)${k === 1 ? '' : ` scale(${k})`} ${extra}`
  }
  get pos() {
    return { ...this.at }
  }
  /** Shown (or gone) at once, for handing over between the pointer under the camera and its twin above it. */
  set(x: number, y: number, shown: boolean) {
    this.at = { x, y }
    const o = shown ? 1 : 0
    return this.run.animate(this.el, [{ opacity: o, transform: this.tf(this.at) }, { opacity: o, transform: this.tf(this.at) }], { duration: 1 })
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
 * What Windows shows while something is dragged out of another app, riding just above the pointer: files'
 * icons, see-through (several: a small pile with their count), or a link's page; and a "+ Copy" label
 * once over a place that takes it.
 */
class AppGhost {
  readonly el: HTMLDivElement
  constructor(private run: Run, stage: Stage, html: string, private at: { x: number; y: number }) {
    this.el = document.createElement('div')
    this.el.className = 'ob-ghost ob-file-ghost'
    this.el.innerHTML = `${html}<span>+ ${esc(t('tour.dragCopy'))}</span>`
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

/** Files from File Explorer: the first in front (last drawn), the others a step behind it each. */
function filesGhost(kinds: FileKind[]): string {
  const pile = kinds.slice(0, 3).map((k, i) => `<img src="${fileIconUrl(k)}" alt="" style="--i:${i}">`).reverse().join('')
  return `${pile}${kinds.length > 1 ? `<b>${kinds.length}</b>` : ''}`
}

/** A link from the browser's address bar: the page's icon, title and address, as the browser draws it. */
const linkGhost = () =>
  `<div class="ob-link-ghost"><i>W</i><div><strong>${esc(pageTitle())} - Wikipedia</strong><em>en.wikipedia.org</em></div></div>`

/** Text for innerHTML. */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

/**
 * Something dragged in from another app, from `from` to the edge: as it nears the edge the bar swells (the
 * app's own pull, in steps), at the bar the shelf opens into its drop zone, over the shelf the zone
 * lights, and it is dropped: `landed` adds its card then, so it comes up under the zone as the zone fades.
 * `pace` scales the glide (a short trip from near the edge is quicker).
 */
async function dropAtEdge(run: Run, p: Pointer, g: AppGhost, from: { x: number; y: number }, landed: () => void, pace = 1) {
  const bar = { x: 400, y: TOUR_SCREEN_TOP + 6 }
  const legs: Array<[number, number, string, number]> = [
    [0.4, 420, 'cubic-bezier(.45,0,1,1)', 0.3],
    [0.75, 300, 'linear', 0.6],
    [1, 360, 'cubic-bezier(0,0,.3,1)', 0.9]
  ]
  for (const [t, ms, easing, pull] of legs) {
    const x = from.x + (bar.x - from.x) * t
    const y = from.y + (bar.y - from.y) * t
    await Promise.all([p.move(x, y, ms * pace, easing), g.move(x, y, ms * pace, easing)])
    setEdgeDragPull(pull)
  }
  // at the bar: the shelf opens straight into its drop zone
  set({ open: true })
  await run.sleep(400)
  const over = { x: 400, y: TOUR_SCREEN_TOP + 62 }
  await Promise.all([p.move(over.x, over.y, 360), g.move(over.x, over.y, 360)])
  set({ dragActive: true })
  g.copying(true)
  await run.sleep(400)
  // the drop: the zone takes it in (DropOverlay listens for the drop), then the card is there
  g.drop()
  document.dispatchEvent(new Event('drop'))
  set({ externalDrag: false, dragActive: false })
  landed()
  setEdgeDragPull(0)
  await run.sleep(260)
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
 * Copy from a web page the way people do, with the shelf closed: select a sentence and press Ctrl+C, then
 * right-click the photo and choose Copy image. Each copy lights the edge; then the pointer opens the
 * shelf and both are there.
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

  // 2. the photo: right-click, Copy image
  const photo = page.querySelector<HTMLElement>('.ob-photo')!
  const ph = rect(stage, photo)
  await p.move(ph.left + ph.width * 0.45, ph.top + ph.height * 0.55, 650)
  await p.press()
  // a click elsewhere ends the page's selection
  lines.forEach((l) => deselect(run, hl(l)))
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
  await run.sleep(500)

  // all of it is on the shelf: the camera pulls back as the pointer rides up, so the shelf opens in full view
  zoomRest(stage.lens, 750, MOVE)
  await p.move(400, TOUR_SCREEN_TOP + 5, 750)
  set({ open: true })
  await run.sleep(750)
  await p.move(560, 380, 500)
  await p.hide()
}

/**
 * Drag things in from other apps. First the page's link, by the icon in the browser's address bar: it
 * lands as a card. Then, as the pointer heads to File Explorer, the shelf folds away; three files are
 * selected there (a selection box drawn across them, as on the desktop) and dragged in at once: they land
 * as one stack.
 */
export async function demoDropIn(run: Run, stage: Stage) {
  const p = new Pointer(run, stage.cursor)
  const page = stage.browser
  const win = stage.explorer
  clearMarks(stage)
  hideWindow(win)
  showWindow(page)
  await run.sleep(250)

  // 1. the link
  const site = centre(stage, page.querySelector('.ob-site')!)
  // the camera pushes in on the address bar, the screen's edge in frame
  zoomTo(stage.lens, withEdge(PUSH, site.x + 110), 900)
  await p.show(site.x + 150, site.y + 80)
  await p.move(site.x, site.y, 600)
  await p.press()
  await p.move(site.x + 6, site.y + 8, 120)
  set({ externalDrag: true })
  const link = new AppGhost(run, stage, linkGhost(), { x: site.x + 6, y: site.y + 8 })
  // the camera glides over to the bar with the link, so the shelf opens in the middle of the frame (it was
  // still on the address bar, off to the left, and the open shelf ran out past the right edge)
  zoomTo(stage.lens, withEdge(PUSH, 400), 900, MOVE)
  await dropAtEdge(run, p, link, { x: site.x + 6, y: site.y + 8 }, () => capture(demoLink(Date.now())), 0.75)
  await run.sleep(450)

  // 2. the files: off to File Explorer (the shelf folds away as the pointer leaves it)
  set({ open: false })
  hideWindow(page)
  showWindow(win)
  const list = win.querySelector<HTMLElement>('.ob-files')!
  const band = list.querySelector<HTMLElement>('.ob-band')!
  const rows = [...list.querySelectorAll<HTMLElement>('.ob-file.is-pick')]
  const lb = rect(stage, list)
  const box = rect(stage, win)
  const first = rect(stage, rows[0])
  const last = rect(stage, rows[rows.length - 1])
  // the box: from the empty space under the list, up and to the left across the three files
  const from = { x: lb.right - 24, y: last.bottom + 14 }
  const to = { x: first.left + first.width * 0.42, y: first.top + first.height * 0.5 }
  zoomTo(stage.lens, onWindow(box), 900)
  await p.move(from.x, from.y, 900)
  await p.press()
  const T = 700
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
  await run.sleep(200)
  // press on the selection and drag all three out
  const c = centre(stage, rows[0].querySelector('img')!)
  await p.move(c.x, c.y, 280)
  await p.press()
  await p.move(c.x + 6, c.y + 8, 120)
  set({ externalDrag: true })
  const g = new AppGhost(run, stage, filesGhost(stackFiles().map(([name]) => fileKindOf(name))), { x: c.x + 6, y: c.y + 8 })
  // the camera pulls back as the files ride up, so the bar swelling and the shelf opening are in full view
  zoomRest(stage.lens, 1080, MOVE)
  await dropAtEdge(run, p, g, { x: c.x + 6, y: c.y + 8 }, () => capture(demoStack(Date.now())))
  await run.sleep(400)
  rows.forEach((row) => row.classList.remove('is-on'))
  await p.move(560, 380, 500)
  await p.hide()
}

/** Drag the image card out of the shelf into another app. */
export async function demoDrag(run: Run, stage: Stage) {
  const p = new Pointer(run, stage.cursor)
  showWindow(stage.notes)
  await p.show(600, 400)
  const src = card(stage, 'demo-image')
  const c = centre(stage, src)
  const notes = rect(stage, stage.notes)
  // in on the card, but not so far that the document below slides under the step's text
  zoomTo(stage.lens, withEdge(Math.min(PUSH, (430 + 15) / notes.bottom), c.x, c.x), 900)
  await p.move(c.x, c.y, 700)
  await p.press()
  set({ internalDragReq: { id: 'demo-image' } })
  await p.move(c.x + 6, c.y + 8, 120)
  const g = new DragImage(run, stage, ['image'], 1, { x: c.x + 6, y: c.y + 8 })
  // drop where the picture lands in the document, the camera following the drag down to it
  const { x: tx, y: ty } = centre(stage, stage.notesImage)
  const nx = notes.left + notes.width / 2
  zoomTo(stage.lens, aim(PUSH, { x: nx, y: notes.bottom }, { x: nx, y: 430 }), 850, MOVE)
  await Promise.all([p.move(tx, ty, 850), g.move(tx, ty, 850)])
  g.drop()
  set({ internalDragReq: null })
  stage.notesImage.classList.add('is-in')
  await run.sleep(300)
  // a card dragged out into another app counts as used: it moves to the front (main: movePastedToTop)
  const items = useStore.getState().items
  set({ items: [...items.filter((it) => it.id === 'demo-image').map((it) => ({ ...it, capturedAt: Date.now() })), ...items.filter((it) => it.id !== 'demo-image')] })
  zoomRest(stage.lens, 1000)
  await run.sleep(300)
  await p.hide()
  await run.sleep(450)
}

/**
 * Split and combine: open the stack and drag the itinerary to the light on the edge, and it becomes a card
 * of its own (main puts it where the stack was); then drop the photo onto the stack, and it joins it.
 */
export async function demoStacks(run: Run, stage: Stage) {
  const p = new Pointer(run, stage.cursor)
  await p.show(560, 380)
  const stack = card(stage, 'demo-stack')
  const c = centre(stage, stack)
  await p.move(c.x, c.y, 650)
  await p.press()
  set({ expandedStackId: 'demo-stack' })
  await run.sleep(550)
  // the expanded stack's first file row (StackItems): the itinerary
  const tile = stage.root.querySelector<HTMLElement>('.item-main[data-id="demo-stack"] .stack-row')
  if (!tile) throw STOP
  const f = centre(stage, tile)
  await p.move(f.x, f.y, 450)
  await p.press()
  const path = DEMO_DIR + stackFiles()[0][0]
  set({ internalDragReq: { id: 'demo-stack', paths: [path] } })
  await p.move(f.x + 6, f.y + 8, 120)
  const g = new DragImage(run, stage, [fileKindOf(path)], 1, { x: f.x + 6, y: f.y + 8 })
  // up to the light on the edge (in frame: the close-up keeps the screen's edge)
  const ex = 400, ey = TOUR_SCREEN_TOP + 5
  await Promise.all([p.move(ex, ey, 850), g.move(ex, ey, 850)])
  await run.sleep(450) // the edge light answers the drag
  g.drop()
  set({ internalDragReq: null, expandedStackId: null })
  // main's split: the file becomes a card where its stack was, the stack keeps the rest
  const now = Date.now()
  set({
    items: useStore.getState().items.flatMap((it) => (it.id === 'demo-stack' ? [demoPdf(now), demoStack(now - 1000, stackFiles().slice(1))] : [it]))
  })
  await run.sleep(550)

  // combine: the photo onto the stack
  const src = card(stage, 'demo-image')
  const s = centre(stage, src)
  await p.move(s.x, s.y, 600)
  await p.press()
  set({ internalDragReq: { id: 'demo-image' } })
  await p.move(s.x + 6, s.y + 8, 120)
  const g2 = new DragImage(run, stage, ['image'], 1, { x: s.x + 6, y: s.y + 8 })
  const tc = centre(stage, card(stage, 'demo-stack'))
  await Promise.all([p.move(tc.x, tc.y, 850), g2.move(tc.x, tc.y, 850)])
  set({ dropTargetId: 'demo-stack' })
  await run.sleep(420)
  g2.drop()
  // main's merge: the stack stays where it is with the photo added, the photo's card goes
  set({
    internalDragReq: null,
    dropTargetId: null,
    items: useStore.getState().items.flatMap((it) => (it.id === 'demo-image' ? [] : it.id === 'demo-stack' ? [demoStackWithPhoto(Date.now())] : [it]))
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
  await run.sleep(80)
  // the photo further down is drawn lazily (once scrolled near); here it is fetched as the preview opens,
  // so the scroll down to it finds it there at its size
  const photos = [...document.querySelectorAll<HTMLImageElement>('.pf-wrap img.thumb')]
  photos.forEach((img) => { img.loading = 'eager' })
  await run.sleep(370)
  target.classList.remove('force-actions')
  await p.hide()
  // the camera pans the screen up so the whole preview is in view, and stays there while the step is up
  // (a replay or the next step brings it back)
  const moving = document.documentElement.dataset.motion !== 'reduce'
  const panned: View = moving ? { k: 1, x: 0, y: -PREVIEW_PAN } : REST
  if (moving) {
    document.body.classList.add('ob-preview-pan')
    zoomTo(stage.lens, panned, 900)
    await run.sleep(950)
  }
  // the photo comes after the files: the pointer comes onto the list and scrolls down to it (the preview
  // is drawn above the whole scene, so the pointer's twin above it does this)
  const list = document.querySelector<HTMLElement>('.pf-wrap .pf-scroll')
  if (!list) return
  await loaded(run, photos, 1500)
  if (list.scrollHeight <= list.clientHeight + 4) return
  const top = twinPointer(run, stage, panned)
  const box = list.getBoundingClientRect()
  const at = { x: box.left + box.width * 0.64, y: box.top + box.height * 0.62 }
  await top.show(at.x + 30, at.y + 40)
  await top.move(at.x, at.y, 450)
  await scrollTo(run, list, list.scrollHeight - list.clientHeight, 1100)
  await run.sleep(250)
  await top.hide()
  top.el.remove()
}

/** Resolves once every image has its picture (a failed source falls back to the item's own preview), or after `ms`. */
async function loaded(run: Run, imgs: HTMLImageElement[], ms: number) {
  const t0 = performance.now()
  while (imgs.some((img) => !(img.complete && img.naturalWidth > 0)) && performance.now() - t0 < ms) await run.sleep(50)
}

/** Scrolls `el` to `top` over `ms`, easing in and out (a wheel's smooth scroll). */
function scrollTo(run: Run, el: HTMLElement, top: number, ms: number): Promise<void> {
  const from = el.scrollTop
  const t0 = performance.now()
  return new Promise((resolve, reject) => {
    const step = (now: number) => {
      if (run.dead) return reject(STOP)
      const k = Math.min(1, (now - t0) / ms)
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      el.scrollTop = from + (top - from) * e
      if (k < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
}

/** Types into one of the app's fields the way a keyboard does: its own input events, a character at a time. */
async function typeInto(run: Run, input: HTMLInputElement, text: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  for (let i = 1; i <= text.length; i++) {
    setValue.call(input, text.slice(0, i))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    // an even rhythm, a beat longer after a word
    await run.sleep(text[i - 1] === ' ' ? 150 : 85)
  }
}

/** A field the tour typed in lets go of the caret (on a step change or a replay). */
function leaveField() {
  const el = document.activeElement
  if (el instanceof HTMLInputElement && el.closest('.ob-shelf, .card-menu')) el.blur()
}

/**
 * The menu is portaled to <body> like the preview, outside the camera and drawn above the whole scene, so
 * a twin of the pointer, above it, takes over while it is open (at the scale of the camera's framing `v`).
 */
function twinPointer(run: Run, stage: Stage, v: View): Pointer {
  const el = stage.cursor.cloneNode(true) as HTMLElement
  el.classList.add('ob-cursor-top')
  document.body.append(el)
  return new Pointer(run, el, v.k)
}

/** A row of the open menu (or a button of the editor) under the twin pointer: hover, then press. */
async function pick(run: Run, top: Pointer, el: HTMLElement, ms: number) {
  const r = el.getBoundingClientRect()
  await top.move(r.left + Math.min(36, r.width * 0.4), r.top + r.height / 2, ms)
  el.classList.add('is-hover')
  await run.sleep(220)
  await top.press()
}

/** The card menu's sizes (cardMenu.css: the menu's narrowest, the note editor's width) and gaps (CardMenu). */
const MENU_MIN_W = 212
const EDITOR_W = 252
const MENU_EDGE = 8
const MENU_POINTER = 2

/**
 * Where on a card to right-click (its x, in scene pixels, near `x`) so that the menu and the note editor it
 * turns into open on the same side of the pointer: in the top dock both stay within the shelf's width
 * (CardMenu placeMenu and menuRegion, with their unscaled sizes against window pixels), and the editor is
 * wider, so near the shelf's end the menu could open to the right and the editor then jump to the left.
 * `v`: the camera's framing while the menu is open.
 */
function sameSide(stage: Stage, v: View, card: Rect, x: number): number {
  const blade = stage.root.querySelector('.ob-shelf .blade')
  if (!blade) return x
  const b = rect(stage, blade)
  const toWin = (sx: number) => sx * v.k + v.x
  const toScene = (wx: number) => (wx - v.x) / v.k
  const lo = Math.max(MENU_EDGE, toWin(b.left) + MENU_EDGE)
  const hi = Math.min(800 - MENU_EDGE, toWin(b.right) - MENU_EDGE)
  const from = card.left + card.width * 0.15
  const to = card.right - card.width * 0.15
  // both to the right: the editor fits between the pointer and the shelf's end
  const rightMost = toScene(hi - MENU_POINTER - EDITOR_W)
  if (rightMost >= from) return Math.min(Math.max(x, from), rightMost)
  // both to the left: not even the narrowest menu fits on the right, and the editor fits on the left
  const leftLeast = Math.max(toScene(hi - MENU_POINTER - MENU_MIN_W) + 1, toScene(lo + MENU_POINTER + EDITOR_W))
  return leftLeast <= to ? Math.max(x, leftLeast) : x
}

/**
 * Find it again: right-click the itinerary, and the app's own menu opens at the pointer; Add note… turns it
 * into the note editor, a note is typed and saved, and it shows on the card in place of its file name. Then
 * into search: a word only the note has, and the shelf narrows to that card as it is typed.
 */
export async function demoFind(run: Run, stage: Stage) {
  const p = new Pointer(run, stage.cursor)
  await p.show(600, 400)
  const target = card(stage, 'demo-pdf')
  const r = rect(stage, target)
  const at = { x: r.left + r.width * 0.5, y: r.top + r.height * 0.3 }
  zoomTo(stage.lens, withEdge(PUSH, at.x), 900)
  // the camera's framing while the menu is open (at rest under reduced motion)
  const v = document.documentElement.dataset.motion === 'reduce' ? REST : withEdge(PUSH, at.x)
  at.x = sameSide(stage, v, r, at.x)
  await p.move(at.x, at.y, 900)
  await run.sleep(80)
  await p.press()
  // the menu at the pointer, at the camera's scale; the twin pointer takes over above it
  const s = toScreen(stage.lens, at)
  document.body.style.setProperty('--ob-menu-scale', String(SHELF_SCALE * v.k))
  const top = twinPointer(run, stage, v)
  await Promise.all([top.set(s.x, s.y, true), p.set(at.x, at.y, false)])
  useStore.getState().openCardMenu('demo-pdf', s.x, s.y)
  await run.sleep(400)
  const label = t('menu.addNote')
  const row = [...document.querySelectorAll<HTMLElement>('.card-menu .card-menu-row')].find((el) => el.textContent === label)
  if (!row) throw STOP
  await pick(run, top, row, 450)
  useStore.getState().editCardMeta()
  await run.sleep(350)
  const field = document.querySelector<HTMLInputElement>('.card-menu .card-meta-input')
  if (!field) throw STOP
  await typeInto(run, field, demoNote())
  await run.sleep(250)
  const save = document.querySelector<HTMLElement>('.card-menu .card-meta-btn.is-primary')
  if (!save) throw STOP
  await pick(run, top, save, 420)
  // the editor's own Save: the note goes onto the card (in the tour's store only) and the editor closes
  save.closest('form')?.requestSubmit()
  await run.sleep(80)
  // back under the camera
  const back = top.pos
  await Promise.all([p.set((back.x - v.x) / v.k, (back.y - v.y) / v.k, true), top.set(back.x, back.y, false)])
  top.el.remove()
  await run.sleep(600)

  // search: the camera takes in the row of cards as the pointer goes to the box
  const input = stage.root.querySelector<HTMLInputElement>('.ob-shelf .search input')
  if (!input) throw STOP
  const c = centre(stage, input)
  zoomTo(stage.lens, SHELF_CLOSE, 850)
  await p.move(c.x - 40, c.y, 850)
  await p.press()
  input.focus({ preventScroll: true })
  await run.sleep(300)
  // the pointer moves off the field, out of the way of what is typed
  p.move(c.x + 70, c.y + 60, 500).catch(() => {})
  await typeInto(run, input, demoQuery())
  await run.sleep(700)
  await p.hide()
}

// ---------- the last step: the shelf on each edge, then the user's own ----------

/**
 * Pulled back a little for the choice, so the whole laptop clears the options below it. (Under reduced
 * motion the camera does not move, so .ob-choosing puts it there at once: --ob-choice-*, Onboarding.)
 * The screen's edges land on whole pixels there (48k + x = 114, 752k + x = 686, 18k + y = 19), so the
 * bezel and the shelf docked against it meet exactly, with no line of wallpaper between them; at rest
 * (the edges shown at 100%) they do already.
 */
export const CHOICE_VIEW: View = { k: 0.8125, x: 75, y: 4.375 }

/**
 * The tour's shelf on an edge of the last step's monitor (edgeBar REAL_SCREEN): a side edge's trigger
 * zone is the share of the monitor's height it is in the app, not of the window's, and the closed bar
 * carries on under the bezel (realHotZoneWidth).
 */
function dockAt(pos: StickPosition) {
  const hz = DEFAULT_SETTINGS.hotZoneHeight
  set({
    settings: {
      ...useStore.getState().settings,
      stickPosition: pos,
      hotZoneHeight: pos === 'top' ? hz : realSideHotZone(hz, window.innerHeight),
      hotZoneWidth: realHotZoneWidth(DEFAULT_SETTINGS.hotZoneWidth)
    }
  })
}

/**
 * The shelf's bar moves to another edge the way the app moves it (Panel's edge change: the bar fades
 * out, the shelf is laid out on the new edge, the bar fades in there), folding the shelf first if it is
 * open. Only the tour's store changes: nothing is saved.
 */
async function moveBar(run: Run, to: StickPosition) {
  if (useStore.getState().open) {
    set({ open: false })
    await run.sleep(420)
  }
  const from = useStore.getState().settings.stickPosition
  if (from === to) return
  set({ edgeTransition: { active: true, from, to, stage: 'bar_fade_out' } })
  await run.sleep(120)
  dockAt(to)
  await run.sleep(40)
  set({ edgeTransition: { active: true, from, to, stage: 'bar_fade_in' } })
  await run.sleep(140)
  set({ edgeTransition: null })
}

/** The shelf on one edge: its bar there, closed a moment, then it opens, holds, and folds back. */
async function playEdge(run: Run, to: StickPosition, hold: number) {
  await moveBar(run, to)
  await run.sleep(500)
  set({ open: true })
  await run.sleep(hold)
  set({ open: false })
  await run.sleep(450)
}

/**
 * Make it yours: the shelf plays on the left edge, then the top, then the right, on the whole laptop at
 * 100% (the camera still: only the shelf moves), and settles on the user's own edge as the camera pulls
 * back for the choice. The real shelf, on the laptop (the frame view lays it out on whichever edge the
 * tour's store says).
 */
export async function demoEdges(run: Run, stage: Stage, mine: StickPosition) {
  zoomRest(stage.lens, 600)
  // the drawn bar (the tour's) goes; the shelf, laid out on the monitor now, comes in on the left edge
  set({ edgeTransition: { active: true, from: 'top', to: 'left', stage: 'bar_fade_out' } })
  dockAt('left')
  stage.showShelf(true)
  await run.sleep(250)
  set({ edgeTransition: { active: true, from: 'top', to: 'left', stage: 'bar_fade_in' } })
  await run.sleep(140)
  set({ edgeTransition: null })
  for (const pos of ['left', 'top', 'right'] as const) await playEdge(run, pos, 1300)
  zoomTo(stage.lens, CHOICE_VIEW, 900)
  await moveBar(run, mine)
  await run.sleep(300)
}

/** The user picked an edge: the shelf goes there and opens once, to show it. */
export async function showEdge(run: Run, stage: Stage, to: StickPosition) {
  zoomTo(stage.lens, CHOICE_VIEW, 600)
  await playEdge(run, to, 1100)
}

export const DEMOS: Record<string, ((run: Run, stage: Stage) => Promise<void>) | undefined> = {
  welcome: demoWelcome,
  collect: demoCollect,
  dropin: demoDropIn,
  drag: demoDrag,
  stacks: demoStacks,
  preview: demoPreview,
  find: demoFind
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
  set({ previewItemId: null, previewItemRect: null, expandedStackId: null, cardMenu: null, cardMenuRect: null })
  // a search empties (the shelf fills back up) and lets go of the caret
  if (st.query) {
    leaveField()
    set({ query: '' })
    await run.sleep(500)
  }
  // a preview's pan comes back down as the preview closes
  if (document.body.classList.contains('ob-preview-pan')) {
    document.body.classList.remove('ob-preview-pan')
    zoomRest(stage.lens, 900)
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
  if (stage.notesImage.classList.contains('is-in')) {
    stage.notesImage.classList.remove('is-in')
    await run.sleep(400)
  }
  const start = itemsFor(step)
  const same = start.length === st.items.length && start.every((it, i) => it.id === st.items[i].id && it.note === st.items[i].note)
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
 *
 * While autoplay is moving the tour on (`advancing`) the demo does not replay: the step is about to
 * change, and a replay begun just before it (the camera pushing in, the shelf fading) was cut off half
 * way by the next step's own moves, a jolt. Paused, it replays as before.
 */
export async function playLooped(
  run: Run, stage: Stage, step: string, open: boolean, demo: (run: Run, stage: Stage) => Promise<void>,
  played?: () => void, advancing: () => boolean = () => false
) {
  for (;;) {
    await demo(run, stage)
    if (!run.dead) played?.()
    await idleFor(run, REPLAY_IDLE)
    if (advancing()) {
      // held until autoplay is paused, then the usual idle wait from there
      while (advancing()) await run.sleep(200)
      await idleFor(run, REPLAY_IDLE)
    }
    await rewind(run, stage, step, open)
  }
}
