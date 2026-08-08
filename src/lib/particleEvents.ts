/**
 * particleEvents - zero-dependency event emitter for deletion particle bursts.
 */

export interface ParticleBurstRect {
  left: number
  top: number
  width: number
  height: number
}

type BurstListener = (rect: ParticleBurstRect) => void

let _listeners: BurstListener[] = []

export const particleEvents = {
  emit(rect: ParticleBurstRect) {
    _listeners.forEach((l) => l(rect))
  },
  on(listener: BurstListener): () => void {
    _listeners.push(listener)
    return () => {
      _listeners = _listeners.filter((l) => l !== listener)
    }
  },
}
