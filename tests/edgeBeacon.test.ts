import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const panel = readFileSync(join(__dirname, '..', 'src/components/Panel.tsx'), 'utf8').replace(/\r\n/g, '\n')
const motionBlock = panel.slice(panel.indexOf('const beaconMotion = startupBeacon'), panel.indexOf('return (\n    <div className="root">'))

describe('edge bar intro and location hint', () => {
  it('is the bar itself, not a light: no white glow or bright gradient', () => {
    expect(panel).not.toContain('0 0 8px rgba(255, 255, 255, 0.4)')
    expect(panel).not.toMatch(/linear-gradient\(to (right|bottom), transparent, rgba\(255, 255, 255, 0\.75\)/)
  })

  it('launch: swells out of the slim bar, holds, then settles back to it', () => {
    expect(motionBlock).toContain('[hotWidth, beaconWide, beaconWide, hotWidth]')
    expect(motionBlock).toContain("['100%', '114%', '114%', '100%']")
    // solid the whole time, so the bar under it never shows through
    expect(motionBlock).toMatch(/startupBeacon\s+\? \{\s+animate: \{[\s\S]*?opacity: 1\s*\}/)
    expect(panel).toContain('const beaconWide = hotWidth + 6')
  })

  it('solid black with no border all the way, like the bar and the drag cue (no grey, no edge light)', () => {
    expect(motionBlock).not.toMatch(/backgroundColor|boxShadow|#2c2c2c|edgeLight/)
    expect(panel).not.toContain('edgeLight')
    const beacon = panel.slice(panel.indexOf('data-edge-beacon=""'), panel.indexOf('key="edge-drag-cue"'))
    expect(beacon.match(/backgroundColor: '#000000'/g)?.length).toBe(2)
    expect(beacon).not.toMatch(/border(Width|Color|:)|boxShadow/)
  })

  it('hint: the same shape as a short swell', () => {
    expect(motionBlock).toContain('[hotWidth, hotWidth + 4, hotWidth]')
    expect(motionBlock).toContain("transition: { duration: 0.45, ease: 'easeInOut' }")
  })

  it('reduced motion keeps the size still', () => {
    expect(motionBlock).toContain('reduceMotion ? hotWidth : [hotWidth, beaconWide, beaconWide, hotWidth]')
  })

  it('bar ends taper over 24px, matching the resting clip so the hand-over is seamless', () => {
    expect(panel).toContain("left: '0 100% 100% 0 / 0 24px 24px 0'")
    expect(panel).toContain("right: '100% 0 0 100% / 24px 0 0 24px'")
    expect(panel).toContain("top: '0 0 24px 24px / 0 0 100% 100%'")
    expect(panel).toContain('round ${hotWidth}px 0px 0px ${hotWidth}px / 24px 0px 0px 24px')
    expect(panel).toContain('round 0px 0px 24px 24px / 0px 0px ${hotWidth}px ${hotWidth}px')
    expect(panel).toContain('round 0px ${hotWidth}px ${hotWidth}px 0px / 0px 24px 24px 0px')
  })

  it('drawn outside the clipped panel, on the panel box, with the strip insets', () => {
    const beacon = panel.indexOf('key="edge-beacon"')
    const container = panel.indexOf('ref={containerRef}')
    expect(beacon).toBeGreaterThan(-1)
    expect(beacon).toBeLessThan(container)
    expect(panel).toContain('const r = containerRef.current.getBoundingClientRect()')
    expect(panel).toContain("{ position: 'absolute', top: insetTop, bottom: insetBottom, [isRight ? 'right' : 'left']: 0, width: hotWidth }")
  })
})
