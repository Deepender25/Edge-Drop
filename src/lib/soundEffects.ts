/**
 * UI sound design for Edge-Drop, synthesized live with the Web Audio API.
 *
 * Every sound is built from the same three ingredients, so the app speaks with
 * one voice:
 *   - touch: a very short band-passed noise tick (a fingertip on glass)
 *   - body:  a damped sine, like a small struck piece of wood or glass
 *   - air:   a soft filtered-noise swell for things that move (the shelf)
 * All pitches come from one scale (D major pentatonic), every attack eases in
 * over a millisecond or two (no clicks from instant gain steps), and everything
 * goes through one bus with a gentle high cut, so nothing turns harsh. Each
 * sound's loudness is set once, in its `play` call, and the set is levelled by
 * ear-weighted loudness: the slider tick lightest, everyday taps next, then
 * toggles, deletes, cards and shelf moves; closing sounds sit a touch softer
 * than opening ones.
 */

import { useStore } from '../store/appStore'

let audioCtx: any = null

function isSoundEnabled(): boolean {
  const win = typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined
  if (!win) return false
  try {
    return useStore.getState().settings.soundEffects !== false
  } catch {
    return true
  }
}

/**
 * A running AudioContext keeps the audio device stream open and wakes the CPU
 * ~200 times a second even in silence. Pause it this long after it was last
 * needed; every sound is far shorter, so none is ever cut off.
 */
const IDLE_SUSPEND_MS = 2000
let idleTimer: ReturnType<typeof setTimeout> | undefined

function armIdleSuspend(): void {
  if (idleTimer !== undefined) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    idleTimer = undefined
    if (audioCtx && audioCtx.state === 'running') audioCtx.suspend().catch(() => {})
  }, IDLE_SUSPEND_MS)
}

function getAudioContext(): any | null {
  if (!isSoundEnabled()) return null
  const win = typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined
  if (!win) return null
  if (!audioCtx) {
    const AudioContextClass = win.AudioContext || win.webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  if (audioCtx) armIdleSuspend()
  return audioCtx
}

/**
 * Idle warmup for the shared AudioContext.
 * Creates/resumes the singleton off the animation path (called once from an
 * idle callback after hydration). No sound is played; first real UI sound
 * then reuses the warm context instead of paying creation cost mid-animation.
 * Respects the `soundEffects` setting via getAudioContext().
 */
export function warmAudioContext(): void {
  try {
    const ctx = getAudioContext()
    if (ctx) busFor(ctx)
  } catch {
    /* ignore Web Audio API restrictions */
  }
}

// Wake the context on every press. A click's sound plays when the click ends,
// 50-100ms after the press, and resuming takes ~8ms, so sounds are never
// delayed by the idle pause (and the first press also unlocks audio).
const win = typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined
if (win && win.addEventListener) {
  const wake = () => {
    try {
      getAudioContext()
    } catch {
      /* ignore Web Audio API restrictions */
    }
  }
  win.addEventListener('pointerdown', wake, true)
  win.addEventListener('keydown', wake, true)
}

// ── Scale ──────────────────────────────────────────────────────────────────
// D major pentatonic: any two of these sound good together.
const D4 = 293.66
const A4 = 440
const D5 = 587.33
const E5 = 659.26
const FS5 = 739.99
const A5 = 880
const B5 = 987.77
const D6 = 1174.66
const A6 = 1760

// ── Bus ────────────────────────────────────────────────────────────────────

interface Bus {
  ctx: any
  out: any
  noise: any
}

let bus: Bus | null = null

/** One shared output chain and noise buffer per context, built once. */
function busFor(ctx: any): Bus {
  if (bus && bus.ctx === ctx) return bus
  // Takes the glassy edge off without dulling the ticks. (No compressor: the
  // levels below peak around -15 dBFS, and Chromium's adds ~6ms of latency.)
  const out = ctx.createBiquadFilter()
  out.type = 'lowpass'
  out.frequency.value = 7000
  out.Q.value = 0.5
  out.connect(ctx.destination)

  const length = Math.floor(ctx.sampleRate * 0.5)
  const noise = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1

  bus = { ctx, out, noise }
  return bus
}

/** Eases in over `attack`, then decays naturally to silence over `decay`. */
function envelope(param: any, at: number, peak: number, attack: number, decay: number): void {
  param.setValueAtTime(0.0001, at)
  param.linearRampToValueAtTime(peak, at + attack)
  param.exponentialRampToValueAtTime(0.0001, at + attack + decay)
}

/** Slight per-play variation so repeated sounds feel physical, not machine-gunned. */
const vary = (value: number, amount: number) => value * (1 + (Math.random() * 2 - 1) * amount)

// ── Ingredients ────────────────────────────────────────────────────────────

function touch(b: Bus, at: number, freq: number, level: number, decay: number, q = 1): void {
  const { ctx } = b
  const src = ctx.createBufferSource()
  src.buffer = b.noise
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = vary(freq, 0.04)
  band.Q.value = q
  const gain = ctx.createGain()
  envelope(gain.gain, at, level, 0.0008, decay)
  src.connect(band)
  band.connect(gain)
  gain.connect(b.out)
  src.start(at, Math.random() * 0.4)
  src.stop(at + decay + 0.02)
}

interface BodyOptions {
  attack?: number
  /** End pitch as a ratio of the start, reached over the first half of the decay. */
  glide?: number
  /** A quieter overtone at `ratio` x the pitch; 2 sounds glassy, 2.76 woody. */
  partial?: { ratio: number; level: number }
}

function body(b: Bus, at: number, freq: number, level: number, decay: number, opts: BodyOptions = {}): void {
  const { ctx } = b
  const attack = opts.attack ?? 0.0015
  const voice = (pitch: number, peak: number, length: number) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(pitch, at)
    if (opts.glide) osc.frequency.exponentialRampToValueAtTime(pitch * opts.glide, at + attack + length * 0.5)
    const gain = ctx.createGain()
    envelope(gain.gain, at, peak, attack, length)
    osc.connect(gain)
    gain.connect(b.out)
    osc.start(at)
    osc.stop(at + attack + length + 0.02)
  }
  voice(freq, level, decay)
  if (opts.partial) voice(freq * opts.partial.ratio, level * opts.partial.level, decay * 0.45)
}

function air(b: Bus, at: number, from: number, to: number, level: number, dur: number): void {
  const { ctx } = b
  const src = ctx.createBufferSource()
  src.buffer = b.noise
  src.loop = true
  const sweep = ctx.createBiquadFilter()
  sweep.type = 'lowpass'
  sweep.Q.value = 0.7
  sweep.frequency.setValueAtTime(from, at)
  sweep.frequency.exponentialRampToValueAtTime(to, at + dur)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.linearRampToValueAtTime(level, at + dur * 0.4)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  src.connect(sweep)
  sweep.connect(gain)
  gain.connect(b.out)
  src.start(at, Math.random() * 0.4)
  src.stop(at + dur + 0.02)
}

// ── Player ─────────────────────────────────────────────────────────────────

const lastPlayed: Record<string, number> = {}

/**
 * Schedules a sound a few ms ahead (so its attack is never cut off) at `level`,
 * skipping repeats of the same sound closer than `minGap` seconds apart.
 */
function play(key: string, minGap: number, level: number, voice: (b: Bus, at: number) => void): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const go = () => {
      // repeat guard in wall-clock seconds: the context's own clock stops while
      // it is paused; sounds are still scheduled on the context's clock
      const wall = performance.now() / 1000
      if (wall - (lastPlayed[key] ?? -Infinity) < minGap) return
      lastPlayed[key] = wall
      const main = busFor(ctx)
      const gain = ctx.createGain()
      gain.gain.value = level
      gain.connect(main.out)
      voice({ ...main, out: gain }, ctx.currentTime + 0.004)
    }
    if (ctx.state === 'suspended') {
      ctx.resume().then(go).catch(() => {})
    } else {
      go()
    }
  } catch {
    /* ignore Web Audio API restrictions */
  }
}

// ── Sounds ─────────────────────────────────────────────────────────────────

/** Slider detent: the lightest tick in the set, fine to repeat quickly. */
export function playDialTickSound(): void {
  play('dial', 0.025, 0.42, (b, at) => {
    touch(b, at, 3600, 0.62, 0.009, 1.4)
    body(b, at, A6, 0.14, 0.018)
  })
}

/** Toggle switch: one soft click, a step brighter when switching on. */
export function playToggleSound(enabled: boolean): void {
  play('toggle', 0.03, 0.42, (b, at) => {
    touch(b, at, enabled ? 2800 : 2200, 0.36, 0.014)
    body(b, at, enabled ? B5 : FS5, enabled ? 0.19 : 0.18, 0.05, { partial: { ratio: 2.76, level: 0.25 } })
  })
}

/** Buttons, chips and pills: the everyday tap. */
export function playButtonClickSound(): void {
  play('tap', 0.03, 0.4, (b, at) => {
    touch(b, at, 2600, 0.56, 0.012)
    body(b, at, A5, 0.23, 0.03)
  })
}

/** Removing an item: a soft, low tap that settles downward as it swipes away. */
export function playDeleteSound(): void {
  play('delete', 0.04, 0.55, (b, at) => {
    touch(b, at, 1500, 0.27, 0.022, 0.8)
    body(b, at, D5, 0.16, 0.09, { glide: 0.8 })
    air(b, at, 2400, 500, 0.047, 0.12)
  })
}

/** Collapsible sections: two quick notes, up to open and down to close. */
export function playExpandSound(expanding: boolean): void {
  play('section', 0.05, 1.42, (b, at) => {
    const [first, second] = expanding ? [D5, A5] : [A5, D5]
    touch(b, at, 2400, 0.07, 0.012)
    body(b, at, first, 0.042, 0.06, { partial: { ratio: 2, level: 0.2 } })
    body(b, at + 0.045, second, 0.042, 0.08, { attack: 0.004, partial: { ratio: 2, level: 0.2 } })
  })
}

/** Cards, stacks and the preview: the section notes, a little fuller, with a breath of air. */
export function playCardExpandSound(expanding: boolean): void {
  play('card', 0.05, 1.39, (b, at) => {
    const [first, second] = expanding ? [E5, B5] : [B5, E5]
    touch(b, at, 2400, 0.066, 0.014)
    body(b, at, first, 0.038, 0.07, { partial: { ratio: 2, level: 0.25 } })
    body(b, at + 0.05, second, 0.038, expanding ? 0.12 : 0.09, { attack: 0.004, partial: { ratio: 2, level: 0.25 } })
    if (expanding) air(b, at, 700, 2600, 0.012, 0.12)
    else air(b, at, 2600, 700, 0.01, 0.1)
  })
}

/** The shelf slides into its edge bar: air falls away and lands with a low, soft tock. */
export function playEdgeRetractSound(): void {
  play('retract', 0.1, 1.8, (b, at) => {
    air(b, at, 2200, 380, 0.037, 0.2)
    touch(b, at + 0.15, 1200, 0.05, 0.016, 0.8)
    body(b, at + 0.15, D4, 0.08, 0.09, { partial: { ratio: 2, level: 0.15 } })
  })
}

/** The edge bar appears on its new edge: one quiet glass note. */
export function playEdgeBeaconAppearSound(): void {
  play('beacon', 0.1, 0.77, (b, at) => {
    body(b, at, D6, 0.037, 0.2, { attack: 0.004, partial: { ratio: 2, level: 0.3 } })
  })
}

/** The shelf grows out of the bar: the retract sound in reverse, rising into the open. */
export function playEdgeExpandSound(): void {
  play('expand', 0.1, 0.55, (b, at) => {
    touch(b, at, 1400, 0.16, 0.016, 0.8)
    body(b, at, A4, 0.2, 0.08, { partial: { ratio: 2, level: 0.15 } })
    air(b, at, 380, 2200, 0.12, 0.2)
  })
}

/** Legacy alias for backwards compatibility */
export const playEdgeTransitionSound = playEdgeRetractSound
