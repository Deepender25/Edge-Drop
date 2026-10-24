import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as sfx from '../src/lib/soundEffects'

const src = readFileSync(join(__dirname, '..', 'src/lib/soundEffects.ts'), 'utf8')

describe('UI sound design', () => {
  it('every sound goes through the shared player with its own level and repeat guard', () => {
    const exported = [...src.matchAll(/export function (play\w+Sound)\(/g)].map((m) => m[1])
    expect(exported).toHaveLength(9)
    const plays = [...src.matchAll(/play\('([a-z]+)', ([\d.]+), ([\d.]+), \(b, at\)/g)]
    expect(plays).toHaveLength(9)
    expect(new Set(plays.map((m) => m[1])).size).toBe(9)
  })

  it('no instant gain steps or pitch swoops: envelopes ease in from silence', () => {
    expect(src).toContain('param.setValueAtTime(0.0001, at)')
    expect(src).toContain('param.linearRampToValueAtTime(peak, at + attack)')
    expect(src).not.toMatch(/gain\.setValueAtTime\(0\.[1-9]/)
    expect(src).not.toMatch(/type = '(triangle|square|sawtooth)'/)
  })

  it('no compressor on the bus (it adds latency and auto makeup gain)', () => {
    expect(src).not.toContain('createDynamicsCompressor')
  })

  it('every sound is safe to call without Web Audio', () => {
    for (const fn of [
      sfx.playDialTickSound, sfx.playButtonClickSound, sfx.playDeleteSound,
      sfx.playEdgeRetractSound, sfx.playEdgeBeaconAppearSound, sfx.playEdgeExpandSound, sfx.warmAudioContext
    ]) expect(() => fn()).not.toThrow()
    for (const on of [true, false]) {
      expect(() => sfx.playToggleSound(on)).not.toThrow()
      expect(() => sfx.playExpandSound(on)).not.toThrow()
      expect(() => sfx.playCardExpandSound(on)).not.toThrow()
    }
  })
})
