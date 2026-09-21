/**
 * Web Audio API Haptic Sound Synthesizer for Edge-Drop.
 * Provides zero-latency, tactile mechanical audio effects for sliders, toggles, and buttons.
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
    getAudioContext()
  } catch {
    /* ignore Web Audio API restrictions */
  }
}

// Global auto-unlock listener: resumes AudioContext on first pointerdown/mouseenter/keydown
const win = typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined
if (win && win.addEventListener) {
  const unlockAudio = () => {
    const ctx = getAudioContext()
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        if (ctx.state === 'running') {
          win.removeEventListener('pointerdown', unlockAudio, true)
          win.removeEventListener('mouseenter', unlockAudio, true)
          win.removeEventListener('keydown', unlockAudio, true)
        }
      }).catch(() => {})
    }
  }
  win.addEventListener('pointerdown', unlockAudio, true)
  win.addEventListener('mouseenter', unlockAudio, true)
  win.addEventListener('keydown', unlockAudio, true)
}

/**
 * Plays a satisfying mechanical rotary dial tick sound.
 * Emulates a camera dial / Apple Watch Digital Crown detent click.
 */
export function playDialTickSound(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const play = () => {
      const now = ctx.currentTime

      // 1. High-frequency metallic ratchet sweep (2600Hz -> 700Hz in 10ms)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(2600, now)
      osc.frequency.exponentialRampToValueAtTime(700, now + 0.01)

      gain.gain.setValueAtTime(0.18, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.01)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.01)

      // 2. Subtle low-end mechanical detent thud (180Hz -> 60Hz in 12ms)
      const bodyOsc = ctx.createOscillator()
      const bodyGain = ctx.createGain()

      bodyOsc.type = 'triangle'
      bodyOsc.frequency.setValueAtTime(180, now)
      bodyOsc.frequency.exponentialRampToValueAtTime(60, now + 0.012)

      bodyGain.gain.setValueAtTime(0.12, now)
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.012)

      bodyOsc.connect(bodyGain)
      bodyGain.connect(ctx.destination)

      bodyOsc.start(now)
      bodyOsc.stop(now + 0.012)
    }

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => play()).catch(() => {})
    } else {
      play()
    }
  } catch {
    /* ignore Web Audio API restrictions */
  }
}

/**
 * Plays a mechanical toggle switch sound (ON / OFF).
 * Emulates a tactile hardware toggle switch snap.
 */
export function playToggleSound(enabled: boolean): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const play = () => {
      const now = ctx.currentTime

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      const startFreq = enabled ? 2200 : 1300
      const endFreq = enabled ? 950 : 450
      const vol = enabled ? 0.15 : 0.11

      osc.type = 'sine'
      osc.frequency.setValueAtTime(startFreq, now)
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.014)

      gain.gain.setValueAtTime(vol, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.014)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.014)

      // Mechanical click thud
      const bodyOsc = ctx.createOscillator()
      const bodyGain = ctx.createGain()

      bodyOsc.type = 'triangle'
      bodyOsc.frequency.setValueAtTime(enabled ? 220 : 150, now)
      bodyOsc.frequency.exponentialRampToValueAtTime(enabled ? 70 : 40, now + 0.016)

      bodyGain.gain.setValueAtTime(0.10, now)
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.016)

      bodyOsc.connect(bodyGain)
      bodyGain.connect(ctx.destination)

      bodyOsc.start(now)
      bodyOsc.stop(now + 0.016)
    }

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => play()).catch(() => {})
    } else {
      play()
    }
  } catch {
    /* ignore Web Audio API restrictions */
  }
}

/**
 * Plays a subtle, tactile keycap button click sound.
 * Ideal for filter chips, action buttons, pills, and icons.
 */
export function playButtonClickSound(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const play = () => {
      const now = ctx.currentTime

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(2100, now)
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.009)

      gain.gain.setValueAtTime(0.10, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.009)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.009)
    }

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => play()).catch(() => {})
    } else {
      play()
    }
  } catch {
    /* ignore Web Audio API restrictions */
  }
}

/**
 * Plays a satisfying downward popping delete sound.
 * Pitch sweeps rapidly downward (1400Hz -> 250Hz) with a soft low-end thud (150Hz -> 40Hz)
 * to instantly signify item removal/deletion.
 */
export function playDeleteSound(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const play = () => {
      const now = ctx.currentTime

      // 1. Downward popping pitch sweep (1400Hz -> 250Hz in 14ms)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(1400, now)
      osc.frequency.exponentialRampToValueAtTime(250, now + 0.014)

      gain.gain.setValueAtTime(0.14, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.014)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.014)

      // 2. Soft mechanical release thud (150Hz -> 40Hz in 16ms)
      const bodyOsc = ctx.createOscillator()
      const bodyGain = ctx.createGain()

      bodyOsc.type = 'triangle'
      bodyOsc.frequency.setValueAtTime(150, now)
      bodyOsc.frequency.exponentialRampToValueAtTime(40, now + 0.016)

      bodyGain.gain.setValueAtTime(0.12, now)
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.016)

      bodyOsc.connect(bodyGain)
      bodyGain.connect(ctx.destination)

      bodyOsc.start(now)
      bodyOsc.stop(now + 0.016)
    }

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => play()).catch(() => {})
    } else {
      play()
    }
  } catch {
    /* ignore Web Audio API restrictions */
  }
}

/**
 * Plays a warm mechanical expansion/contraction sound for collapsible sections (e.g. Pinned section).
 */
export function playExpandSound(expanding: boolean): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const play = () => {
      const now = ctx.currentTime

      const startFreq = expanding ? 450 : 1100
      const endFreq = expanding ? 1250 : 380
      const dur = expanding ? 0.022 : 0.018

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(startFreq, now)
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur)

      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + dur)

      const bodyOsc = ctx.createOscillator()
      const bodyGain = ctx.createGain()

      bodyOsc.type = 'triangle'
      bodyOsc.frequency.setValueAtTime(expanding ? 90 : 140, now)
      bodyOsc.frequency.exponentialRampToValueAtTime(expanding ? 180 : 60, now + dur + 0.004)

      bodyGain.gain.setValueAtTime(0.09, now)
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.004)

      bodyOsc.connect(bodyGain)
      bodyGain.connect(ctx.destination)

      bodyOsc.start(now)
      bodyOsc.stop(now + dur + 0.004)
    }

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => play()).catch(() => {})
    } else {
      play()
    }
  } catch {
    /* ignore */
  }
}

/**
 * Plays a rich 3D glassmorphic pop sound when cards expand, file bundles open/close, or preview flyout toggles.
 */
export function playCardExpandSound(expanding: boolean): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const play = () => {
      const now = ctx.currentTime

      const startFreq = expanding ? 650 : 1500
      const endFreq = expanding ? 1650 : 480
      const dur = expanding ? 0.028 : 0.022

      // Primary tone
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(startFreq, now)
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur)

      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + dur)

      // Harmonics for rich glassmorphic texture
      const harmonicOsc = ctx.createOscillator()
      const harmonicGain = ctx.createGain()

      harmonicOsc.type = 'triangle'
      harmonicOsc.frequency.setValueAtTime(startFreq * 1.5, now)
      harmonicOsc.frequency.exponentialRampToValueAtTime(endFreq * 1.5, now + dur * 0.8)

      harmonicGain.gain.setValueAtTime(0.06, now)
      harmonicGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.8)

      harmonicOsc.connect(harmonicGain)
      harmonicGain.connect(ctx.destination)

      harmonicOsc.start(now)
      harmonicOsc.stop(now + dur * 0.8)
    }

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => play()).catch(() => {})
    } else {
      play()
    }
  } catch {
    /* ignore */
  }
}

/**
 * 1. Plays a tactile mechanical dock/retract sound when the panel slides into the edge bar.
 */
export function playEdgeRetractSound(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const play = () => {
      const now = ctx.currentTime

      // Smooth downward glide into the dock
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(540, now)
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.08)
      gain.gain.setValueAtTime(0.09, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.08)

      // Mechanical latch click thud
      const bodyOsc = ctx.createOscillator()
      const bodyGain = ctx.createGain()
      bodyOsc.type = 'triangle'
      bodyOsc.frequency.setValueAtTime(140, now + 0.06)
      bodyOsc.frequency.exponentialRampToValueAtTime(45, now + 0.11)
      bodyGain.gain.setValueAtTime(0.08, now + 0.06)
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11)
      bodyOsc.connect(bodyGain)
      bodyGain.connect(ctx.destination)
      bodyOsc.start(now + 0.06)
      bodyOsc.stop(now + 0.11)
    }

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => play()).catch(() => {})
    } else {
      play()
    }
  } catch {
    /* ignore */
  }
}

/**
 * 2. Plays a subtle magnetic detent ping when the edge bar fades in on the new screen edge.
 */
export function playEdgeBeaconAppearSound(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const play = () => {
      const now = ctx.currentTime

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(780, now)
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.045)
      gain.gain.setValueAtTime(0.07, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.045)
    }

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => play()).catch(() => {})
    } else {
      play()
    }
  } catch {
    /* ignore */
  }
}

/**
 * 3. Plays a tactile mechanical spring unlatch sound when the clipboard expands out from the bar.
 */
export function playEdgeExpandSound(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const play = () => {
      const now = ctx.currentTime

      // Upward expanding slide
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(260, now)
      osc.frequency.exponentialRampToValueAtTime(740, now + 0.06)
      gain.gain.setValueAtTime(0.08, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.06)

      // Tactile detent release snap
      const snapOsc = ctx.createOscillator()
      const snapGain = ctx.createGain()
      snapOsc.type = 'triangle'
      snapOsc.frequency.setValueAtTime(180, now + 0.02)
      snapOsc.frequency.exponentialRampToValueAtTime(70, now + 0.07)
      snapGain.gain.setValueAtTime(0.10, now + 0.02)
      snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
      snapOsc.connect(snapGain)
      snapGain.connect(ctx.destination)
      snapOsc.start(now + 0.02)
      snapOsc.stop(now + 0.07)
    }

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => play()).catch(() => {})
    } else {
      play()
    }
  } catch {
    /* ignore */
  }
}

/** Legacy alias for backwards compatibility */
export const playEdgeTransitionSound = playEdgeRetractSound

