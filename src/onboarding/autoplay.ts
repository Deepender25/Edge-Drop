/**
 * The tour's autoplay. Each step stays up for as long as it takes to watch
 * its demo and read its text, then the tour moves on:
 *
 * - the demo always plays to its end, and its result stays up at least
 *   MIN_REST (at most MAX_REST) before the next step;
 * - the step also stays until its text has been read: reading time counts
 *   from when the text appears, and only half of the time spent watching the
 *   demo counts toward it (people watch the motion, then read).
 *
 * The active progress dash fills at one even speed across the whole step, so
 * the viewer sees when it will move on. Pausing freezes the fill and the
 * countdown where they are; playing again carries on from there.
 */

/** The shortest and longest a finished demo's result stays up under autoplay. */
const MIN_REST = 2400
const MAX_REST = 6000

/** How long each step's demo runs, from the step appearing to its end (measured), for pacing the fill. */
const DEMO_MS: Record<string, number> = {
  welcome: 4100,
  collect: 8950,
  dropin: 10850,
  drag: 3750,
  stacks: 7500,
  preview: 6000,
  find: 9200
}

/** Han, kana and Hangul: one character carries about a word. */
const DENSE = /[ᄀ-ᇿ぀-ヿ㐀-鿿가-힯豈-﫿]/g

/** About how long a step's title and text take to read (~230 words a minute, plus a moment to look over). */
export function readingMs(title: string, body: string): number {
  const weight = (s: string) => s.length + 2 * (s.match(DENSE)?.length ?? 0)
  return 1000 + 25 * weight(title) + 45 * weight(body)
}

const restFor = (readMs: number, watchedMs: number) => Math.min(MAX_REST, Math.max(MIN_REST, readMs - watchedMs / 2))

const scale = (k: number) => ({ transform: `scaleX(${k})` })

export class Autoplay {
  private fill: HTMLElement | null = null
  private anim: Animation | null = null
  /** The fill's current animation runs between these. */
  private span: [number, number] = [0, 0]
  private phase: 'waiting' | 'demo' | 'rest' = 'waiting'
  private shownAt = 0
  private readMs = 0
  private timer = 0
  private restLeft = 0
  private restFrom = 0
  private on: boolean
  private hidden = false

  constructor(private advance: () => void, playing: boolean) {
    this.on = playing
  }

  private get running() {
    return this.on && !this.hidden
  }

  /** Whether the tour is moving on by itself (playing, and the window in view). */
  get advancing() {
    return this.running
  }

  /** The active dash's fill: a new element for each step, which starts the step over. */
  attach(el: HTMLElement | null) {
    if (el === this.fill) return
    this.stopTimer()
    this.anim?.cancel()
    this.anim = null
    this.fill = el
    this.phase = 'waiting'
  }

  /** The step's text is up (reading starts now); its demo is starting. */
  shown(step: string, readMs: number) {
    if (!this.fill || this.phase !== 'waiting') return
    this.phase = 'demo'
    this.shownAt = performance.now()
    this.readMs = readMs
    const demo = DEMO_MS[step] ?? 5000
    const total = demo + restFor(readMs, demo)
    this.fillTo(0, demo / total, demo)
  }

  /** The step's demo played to its end: the rest of the step, then move on. */
  played() {
    if (!this.fill) return
    const watched = this.phase === 'waiting' ? 0 : performance.now() - this.shownAt
    const from = this.current()
    this.stopTimer()
    this.phase = 'rest'
    this.restLeft = restFor(this.readMs, watched)
    this.fillTo(from, 1, this.restLeft)
    if (this.running) this.startTimer()
  }

  setPlaying(on: boolean) {
    this.on = on
    this.sync()
  }

  /** The window is hidden or minimized: hold everything until it is back. */
  setHidden(hidden: boolean) {
    this.hidden = hidden
    this.sync()
  }

  stop() {
    this.stopTimer()
    this.anim?.cancel()
    this.anim = null
    this.fill = null
  }

  /** How full the dash is now. */
  private current() {
    if (!this.anim) return 0
    const t = this.anim.effect?.getComputedTiming().progress ?? 1
    return this.span[0] + (this.span[1] - this.span[0]) * t
  }

  private fillTo(from: number, to: number, ms: number) {
    this.anim?.cancel()
    this.span = [from, to]
    this.anim = this.fill!.animate([scale(from), scale(to)], { duration: ms, easing: 'linear', fill: 'forwards' })
    if (!this.running) this.anim.pause()
  }

  private sync() {
    if (this.running) {
      // only un-pause: play() on a finished animation would start it over
      if (this.anim?.playState === 'paused') this.anim.play()
      if (this.phase === 'rest' && !this.timer) this.startTimer()
    } else {
      if (this.anim?.playState === 'running') this.anim.pause()
      this.stopTimer()
    }
  }

  private startTimer() {
    this.restFrom = performance.now()
    this.timer = window.setTimeout(() => {
      this.timer = 0
      this.phase = 'waiting'
      this.advance()
    }, this.restLeft)
  }

  private stopTimer() {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = 0
    this.restLeft = Math.max(0, this.restLeft - (performance.now() - this.restFrom))
  }
}
