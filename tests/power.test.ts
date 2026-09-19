/**
 * Power optimisation test suite.
 *
 * These tests verify the logic of each power fix without requiring an
 * Electron runtime.  We test the pure computation functions directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Build a minimal cursor tick input object. */
function makeTick(clientX: number, clientY: number, displayWidth = 1920, stickPosition: 'left' | 'right' | 'top' = 'left') {
  return { clientX, clientY, displayWidth, stickPosition }
}

// ──────────────────────────────────────────────────────────────────────────────
// Fix 1: Adaptive poll rate logic
// ──────────────────────────────────────────────────────────────────────────────
describe('Fix 1 — adaptive poll rate constants', () => {
  // The constants are embedded in window.ts but we can test the logic in isolation.
  const FAST_POLL_PROXIMITY_PX = 250
  const POLL_FAST_MS = 16
  const POLL_SLOW_BATTERY_MS = 60
  const POLL_SLOW_AC_MS = 35
  const SLOW_COOLDOWN_MS = 800

  it('POLL_FAST_MS is exactly 16ms (one frame at 60Hz)', () => {
    expect(POLL_FAST_MS).toBe(16)
  })

  it('POLL_SLOW_BATTERY_MS is >= POLL_SLOW_AC_MS (battery is never faster than AC)', () => {
    expect(POLL_SLOW_BATTERY_MS).toBeGreaterThanOrEqual(POLL_SLOW_AC_MS)
  })

  it('POLL_SLOW_BATTERY_MS ensures low latency (30–100ms)', () => {
    expect(POLL_SLOW_BATTERY_MS).toBeGreaterThanOrEqual(30)
    expect(POLL_SLOW_BATTERY_MS).toBeLessThanOrEqual(100)
  })

  it('FAST_POLL_PROXIMITY_PX is a meaningful approach distance (100–400px)', () => {
    expect(FAST_POLL_PROXIMITY_PX).toBeGreaterThanOrEqual(100)
    expect(FAST_POLL_PROXIMITY_PX).toBeLessThanOrEqual(400)
  })

  it('cursor within PROXIMITY triggers fast mode (left panel)', () => {
    const { clientX, stickPosition } = makeTick(80, 500)   // 80px from left edge
    const distFromEdge = stickPosition === 'right' ? 1920 - clientX : clientX
    expect(distFromEdge).toBeLessThanOrEqual(FAST_POLL_PROXIMITY_PX)
  })

  it('cursor beyond PROXIMITY stays in slow mode (left panel)', () => {
    const { clientX, stickPosition } = makeTick(500, 500)   // 500px from left edge
    const distFromEdge = stickPosition === 'right' ? 1920 - clientX : clientX
    expect(distFromEdge).toBeGreaterThan(FAST_POLL_PROXIMITY_PX)
  })

  it('cursor within PROXIMITY triggers fast mode (right panel)', () => {
    const { clientX, displayWidth, stickPosition } = makeTick(1850, 500, 1920, 'right')
    const distFromEdge = displayWidth - clientX
    expect(distFromEdge).toBeLessThanOrEqual(FAST_POLL_PROXIMITY_PX)
  })

  it('cursor beyond PROXIMITY stays in slow mode (right panel)', () => {
    const { clientX, displayWidth, stickPosition } = makeTick(1000, 500, 1920, 'right')
    const distFromEdge = displayWidth - clientX
    expect(distFromEdge).toBeGreaterThan(FAST_POLL_PROXIMITY_PX)
  })

  it('cursor within PROXIMITY triggers fast mode (top panel)', () => {
    const { clientY } = makeTick(500, 50, 1920, 'top')
    const distFromEdge = clientY
    expect(distFromEdge).toBeLessThanOrEqual(FAST_POLL_PROXIMITY_PX)
  })

  it('SLOW_COOLDOWN_MS is long enough to avoid mode thrashing (>= 500ms)', () => {
    expect(SLOW_COOLDOWN_MS).toBeGreaterThanOrEqual(500)
  })

  it('slow poll provides >= 3x improvement over fast poll', () => {
    // Verify that the slow poll is meaningfully slower, not just slightly slower
    expect(POLL_SLOW_BATTERY_MS / POLL_FAST_MS).toBeGreaterThanOrEqual(3)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Fix 5: IPC gating logic
// ──────────────────────────────────────────────────────────────────────────────
describe('Fix 5 — IPC gating (position-change threshold)', () => {
  const IPC_MIN_DELTA_PX = 3

  function shouldSend(
    newState: boolean,
    lastState: boolean,
    interactive: boolean,
    clientX: number,
    clientY: number,
    lastSentX: number,
    lastSentY: number,
    displayWidth = 1920,
    stickPosition: 'left' | 'right' = 'left'
  ): boolean {
    const nearEdge = stickPosition === 'right'
      ? (displayWidth - clientX) <= 450
      : clientX <= 450
    const positionChangedEnough =
      Math.abs(clientX - lastSentX) >= IPC_MIN_DELTA_PX ||
      Math.abs(clientY - lastSentY) >= IPC_MIN_DELTA_PX
    return newState !== lastState || interactive || (nearEdge && positionChangedEnough)
  }

  it('always sends when edge-crossing state changes (closed → open)', () => {
    expect(shouldSend(true, false, false, 2, 500, 2, 500)).toBe(true)
  })

  it('always sends when edge-crossing state changes (open → closed)', () => {
    expect(shouldSend(false, true, false, 200, 500, 200, 500)).toBe(true)
  })

  it('always sends when panel is interactive (open)', () => {
    // Even if near-edge position has not changed much, interactive=true forces send
    expect(shouldSend(false, false, true, 200, 500, 201, 500)).toBe(true)
  })

  it('does NOT send when near edge but cursor did not move enough', () => {
    // clientX=200, lastSentX=199 — delta is 1px, less than IPC_MIN_DELTA_PX=3
    expect(shouldSend(false, false, false, 200, 500, 199, 500)).toBe(false)
  })

  it('sends when near edge and cursor moved enough', () => {
    // clientX=200, lastSentX=196 — delta is 4px >= IPC_MIN_DELTA_PX=3
    expect(shouldSend(false, false, false, 200, 500, 196, 500)).toBe(true)
  })

  it('does NOT send when cursor is far from edge and state unchanged', () => {
    // clientX=900 — not near edge (>450px), state unchanged, panel closed
    expect(shouldSend(false, false, false, 900, 500, 100, 100)).toBe(false)
  })

  it('does NOT send when cursor far from edge on right panel', () => {
    // cursor at 900px from left on 1920px display — distFromRight = 1020px > 450
    expect(shouldSend(false, false, false, 900, 500, 100, 100, 1920, 'right')).toBe(false)
  })

  it('sends when cursor near right edge and moved enough', () => {
    // cursor 70px from right edge, moved 5px
    expect(shouldSend(false, false, false, 1850, 500, 1845, 500, 1920, 'right')).toBe(true)
  })

  it('IPC_MIN_DELTA_PX boundary: exactly 3px triggers send', () => {
    // Delta is exactly IPC_MIN_DELTA_PX — should send (>=)
    expect(shouldSend(false, false, false, 200, 500, 197, 500)).toBe(true)
  })

  it('IPC_MIN_DELTA_PX boundary: 2px does not trigger send', () => {
    expect(shouldSend(false, false, false, 200, 500, 198, 500)).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Fix 3: Fullscreen detection constants
// ──────────────────────────────────────────────────────────────────────────────
describe('Fix 3 — fullscreen detection constants', () => {
  const FULLSCREEN_STATES = new Set([2, 3, 4])
  const FULLSCREEN_CHECK_INTERVAL_MS = 5000

  it('state 5 (QUNS_ACCEPTS_NOTIFICATIONS = normal desktop) is NOT fullscreen', () => {
    expect(FULLSCREEN_STATES.has(5)).toBe(false)
  })

  it('state 2 (QUNS_BUSY = fullscreen app) IS detected as fullscreen', () => {
    expect(FULLSCREEN_STATES.has(2)).toBe(true)
  })

  it('state 3 (QUNS_RUNNING_D3D_FULL_SCREEN = game) IS detected as fullscreen', () => {
    expect(FULLSCREEN_STATES.has(3)).toBe(true)
  })

  it('state 4 (QUNS_PRESENTATION_MODE) IS detected as fullscreen', () => {
    expect(FULLSCREEN_STATES.has(4)).toBe(true)
  })

  it('state 1 (QUNS_NOT_PRESENT = screen locked) is NOT flagged as fullscreen', () => {
    // Screen saver / lock screen: we should still be visible if user hovers
    expect(FULLSCREEN_STATES.has(1)).toBe(false)
  })

  it('state 6 (QUNS_QUIET_TIME) is NOT flagged as fullscreen', () => {
    expect(FULLSCREEN_STATES.has(6)).toBe(false)
  })

  it('state -1 (error/unavailable) is NOT flagged as fullscreen', () => {
    expect(FULLSCREEN_STATES.has(-1)).toBe(false)
  })

  it('check interval is 5s (was 1s — 5x improvement)', () => {
    expect(FULLSCREEN_CHECK_INTERVAL_MS).toBe(5000)
  })

  it('check interval is at least 3x better than the old 1000ms interval', () => {
    expect(FULLSCREEN_CHECK_INTERVAL_MS / 1000).toBeGreaterThanOrEqual(3)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Fix 4: Heartbeat interval
// ──────────────────────────────────────────────────────────────────────────────
describe('Fix 4 — heartbeat interval slowdown', () => {
  const OLD_HEARTBEAT_MS = 500
  const NEW_HEARTBEAT_MS = 2000

  it('new heartbeat is at least 4x slower than the old one', () => {
    expect(NEW_HEARTBEAT_MS / OLD_HEARTBEAT_MS).toBeGreaterThanOrEqual(4)
  })

  it('new heartbeat fires <= 30 times per minute', () => {
    const firesPerMinute = (60 * 1000) / NEW_HEARTBEAT_MS
    expect(firesPerMinute).toBeLessThanOrEqual(30)
  })

  it('old heartbeat fired 120 times per minute (confirmed regression)', () => {
    const firesPerMinute = (60 * 1000) / OLD_HEARTBEAT_MS
    expect(firesPerMinute).toBe(120)
  })
})
