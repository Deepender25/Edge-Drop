import { describe, expect, it } from 'vitest'
import { parseColor } from '../src/lib/colorUtils'

describe('colorUtils', () => {
  it('parses 6-digit hex colors and detects light vs dark contrast', () => {
    // Colors from user's actual screenshot
    const c1 = parseColor('#ebd5ad')
    expect(c1).not.toBeNull()
    expect(c1?.isLight).toBe(true)
    expect(c1?.secondaryText).toBe('rgb(235, 213, 173)')

    const c2 = parseColor('#c4cdec')
    expect(c2?.isLight).toBe(true)

    const c3 = parseColor('#f5c9e5')
    expect(c3?.isLight).toBe(true)

    const c4 = parseColor('#f8f6f7')
    expect(c4?.isLight).toBe(true)

    const c5 = parseColor('#e9d9bc')
    expect(c5?.isLight).toBe(true)

    // Dark teal from reference screenshot
    const darkTeal = parseColor('#006667')
    expect(darkTeal?.isLight).toBe(false)
    expect(darkTeal?.secondaryText).toBe('rgb(0, 102, 103)')

    // Peach from reference screenshot
    const peach = parseColor('#FFBAA7')
    expect(peach?.isLight).toBe(true)

    // Cyan from reference screenshot
    const cyan = parseColor('#00B7C6')
    expect(cyan?.isLight).toBe(false)

    // Pure black & white
    expect(parseColor('#000000')?.isLight).toBe(false)
    expect(parseColor('#ffffff')?.isLight).toBe(true)
  })

  it('parses 3-digit, 4-digit, and 8-digit hex', () => {
    const shortWhite = parseColor('#fff')
    expect(shortWhite?.isLight).toBe(true)
    expect(shortWhite?.r).toBe(255)

    const shortBlack = parseColor('#000')
    expect(shortBlack?.isLight).toBe(false)
    expect(shortBlack?.r).toBe(0)

    const alphaHex = parseColor('#ffffff80')
    expect(alphaHex).not.toBeNull()
    expect(alphaHex?.a).toBeCloseTo(0.5, 1)
  })

  it('parses rgb and rgba strings', () => {
    const rgb = parseColor('rgb(255, 240, 229)')
    expect(rgb?.isLight).toBe(true)
    expect(rgb?.secondaryText).toBe('#fff0e5')

    const darkRgb = parseColor('rgb(10, 10, 10)')
    expect(darkRgb?.isLight).toBe(false)

    const rgba = parseColor('rgba(255, 255, 255, 0.8)')
    expect(rgba?.isLight).toBe(true)
  })

  it('parses hsl strings', () => {
    const hsl = parseColor('hsl(210, 50%, 40%)')
    expect(hsl).not.toBeNull()
    expect(hsl?.isLight).toBe(false)
  })

  it('returns null for non-color strings', () => {
    expect(parseColor('hello world')).toBeNull()
    expect(parseColor('https://example.com')).toBeNull()
    expect(parseColor('123456')).toBeNull()
    expect(parseColor('#xyz')).toBeNull()
    expect(parseColor('')).toBeNull()
  })
})
