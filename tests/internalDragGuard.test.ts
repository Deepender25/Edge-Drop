import { describe, expect, it } from 'vitest'
import {
  reduceGuard,
  isGuarded,
  GUARD_AUTO_IDLE_MS,
  type GuardState,
  type GuardEvent
} from '../electron/preload/internalDragGuard'

const T0 = 1000
const idle: GuardState = { phase: 'idle', fireAt: null }

function run(state: GuardState, events: GuardEvent[]): GuardState {
  return events.reduce(reduceGuard, state)
}

describe('internalDragGuard state machine', () => {
  it('arm transitions idle -> armed with no expiry (dragend is trusted)', () => {
    const s = reduceGuard(idle, { type: 'arm' })
    expect(s.phase).toBe('armed')
    expect(s.fireAt).toBeNull()
    expect(isGuarded(s)).toBe(true)
  })

  it('FIRST drop while armed is consumed back to idle — the single-mouse invariant', () => {
    const s = run(idle, [{ type: 'arm' }, { type: 'drop' }])
    expect(s).toEqual(idle)
    expect(isGuarded(s)).toBe(false)
  })

  it('redundant arm while armed stays armed (does not unlock)', () => {
    const s = run(idle, [{ type: 'arm' }, { type: 'arm' }])
    expect(s.phase).toBe('armed')
  })

  it('dragEnd begins releasing with a deadline of now + AUTO_IDLE', () => {
    const s = reduceGuard({ phase: 'armed', fireAt: null }, { type: 'dragEnd', now: T0 })
    expect(s.phase).toBe('releasing')
    expect(s.fireAt).toBe(T0 + GUARD_AUTO_IDLE_MS)
  })

  it('a drop DURING the release window is still swallowed (deferred delivery) and consumes the guard', () => {
    // THE regression case: Windows delivers our boomerang long after dragEnd.
    let s = run(idle, [{ type: 'arm' }, { type: 'dragEnd', now: T0 }])
    const lateDelivery = T0 + GUARD_AUTO_IDLE_MS - 200 // 200ms before expiry
    s = reduceGuard(s, { type: 'tick', now: lateDelivery })
    expect(isGuarded(s)).toBe(true) // still protected
    s = reduceGuard(s, { type: 'drop' })
    expect(s).toEqual(idle)
  })

  it('release expires to idle so external imports are never permanently blocked', () => {
    let s = run(idle, [{ type: 'arm' }, { type: 'dragEnd', now: T0 }])
    s = reduceGuard(s, { type: 'tick', now: T0 + GUARD_AUTO_IDLE_MS - 1 })
    expect(isGuarded(s)).toBe(true)
    s = reduceGuard(s, { type: 'tick', now: T0 + GUARD_AUTO_IDLE_MS })
    expect(s).toEqual(idle)
    expect(isGuarded(s)).toBe(false)
  })

  it('ticks before the deadline leave the releasing state untouched', () => {
    const armedThenEnd = run(idle, [{ type: 'arm' }, { type: 'dragEnd', now: T0 }])
    const s = reduceGuard(armedThenEnd, { type: 'tick', now: T0 + 10 })
    expect(s.phase).toBe('releasing')
    expect(s.fireAt).toBe(T0 + GUARD_AUTO_IDLE_MS)
  })

  it('re-arm during the release window cancels expiry and re-protects a new gesture', () => {
    let s = run(idle, [{ type: 'arm' }, { type: 'dragEnd', now: T0 }])
    s = reduceGuard(s, { type: 'arm' }) // new gesture starts before expiry
    expect(s.phase).toBe('armed')

    // The old deadline passing must NOT expire an armed phase.
    const afterOldDeadline = reduceGuard(s, { type: 'tick', now: T0 + GUARD_AUTO_IDLE_MS + 500 })
    expect(afterOldDeadline.phase).toBe('armed')
    expect(isGuarded(afterOldDeadline)).toBe(true)

    // And its own first drop still consumes.
    expect(reduceGuard(afterOldDeadline, { type: 'drop' })).toEqual(idle)
  })

  it('drop while IDLE is not a guard event (external imports unaffected by design)', () => {
    // The listener never routes unguarded drops through the reducer; asserted
    // here as documentation that idle+drop is a no-op transition.
    expect(reduceGuard(idle, { type: 'drop' })).toEqual(idle)
  })

  it('full real-world lifecycle: arm -> gesture -> dragEnd -> deferred boomerang swallow -> idle -> next arm', () => {
    let s = idle
    s = reduceGuard(s, { type: 'arm' })                                   // user grabs card
    s = reduceGuard(s, { type: 'dragEnd', now: T0 + 900 })                // dropped on shelf; OLE done
    s = reduceGuard(s, { type: 'tick', now: T0 + 950 })                   // boomerang arrives 50ms later
    expect(isGuarded(s)).toBe(true)
    s = reduceGuard(s, { type: 'drop' })                                  // swallowed
    expect(s).toEqual(idle)
    s = reduceGuard(s, { type: 'arm' })                                   // user drags something else later
    expect(isGuarded(s)).toBe(true)
    s = reduceGuard(s, { type: 'drop' })
    expect(s).toEqual(idle)
  })

  it('crash safety: if dragEnd never fired, one external import self-heals the lockout', () => {
    // Worst-case defect: stuck armed. The very next drop (even an external
    // one) consumes the guard, so imports recover after at most ONE loss.
    const stuck = { phase: 'armed' as const, fireAt: null }
    const healed = reduceGuard(stuck, { type: 'drop' })
    expect(healed).toEqual(idle)
  })
})
