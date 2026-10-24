import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lang = vi.hoisted(() => ({ code: 'en' }))
vi.mock('../src/i18n', () => ({
  t: (key: string) => (key === 'item.justNow' ? 'just now' : key === 'item.ago' ? 'ago' : key),
  getResolvedLanguage: () => lang.code
}))

import { relativeTime } from '../src/lib/format'
import { LANGUAGES } from '../src/i18n/translations'

/** The original implementation, building fresh Intl formatters on every call. */
function uncached(ts: number, code: string): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 5) return 'just now'
  const rtf = new Intl.RelativeTimeFormat(code, { numeric: 'always', style: 'narrow' })
  let res: string
  if (s < 60) res = rtf.format(-s, 'second')
  else if (s < 3600) res = rtf.format(-Math.round(s / 60), 'minute')
  else if (s < 86400) res = rtf.format(-Math.round(s / 3600), 'hour')
  else if (s < 604800) res = rtf.format(-Math.round(s / 86400), 'day')
  else return new Date(ts).toLocaleDateString(code)
  if (res.startsWith('-')) {
    const short = new Intl.RelativeTimeFormat(code, { numeric: 'always', style: 'short' })
    if (s < 60) return short.format(-s, 'second')
    if (s < 3600) return short.format(-Math.round(s / 60), 'minute')
    if (s < 86400) return short.format(-Math.round(s / 3600), 'hour')
    return short.format(-Math.round(s / 86400), 'day')
  }
  return res
}

const AGES_S = [0, 4, 5, 30, 59, 60, 61, 90, 3599, 3600, 7200, 86399, 86400, 172800, 604799, 604800, 2_000_000, 40_000_000]

describe('relativeTime with cached formatters', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
    lang.code = 'en'
  })

  it('gives exactly the same text as fresh formatters, in every app language', () => {
    const codes = LANGUAGES.map((l) => l.code).filter((c) => c !== 'system')
    expect(codes.length).toBeGreaterThan(25)
    for (const code of codes) {
      lang.code = code
      for (const age of AGES_S) {
        const ts = Date.now() - age * 1000
        expect(relativeTime(ts), `${code} ${age}s`).toBe(uncached(ts, code))
      }
    }
  })

  it('switching language mid-session uses the new language', () => {
    const ts = Date.now() - 3 * 3600 * 1000
    lang.code = 'en'
    const en = relativeTime(ts)
    lang.code = 'de'
    expect(relativeTime(ts)).toBe(uncached(ts, 'de'))
    expect(relativeTime(ts)).not.toBe(en)
  })
})
