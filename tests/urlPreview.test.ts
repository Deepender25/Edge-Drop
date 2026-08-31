import { describe, expect, it } from 'vitest'
import { parseUrlPreview, safeDecodeURIComponent } from '../src/lib/urlPreview'

describe('safeDecodeURIComponent', () => {
  it('decodes a complete sequence', () => {
    expect(safeDecodeURIComponent('%E3%82%AF')).toBe('ク')
  })

  it('returns the raw string instead of throwing on a truncated %XX', () => {
    expect(() => safeDecodeURIComponent('%E3%82')).not.toThrow()
    expect(safeDecodeURIComponent('%E3%82')).toBe('%E3%82')
    expect(safeDecodeURIComponent('foo%')).toBe('foo%')
  })
})

describe('parseUrlPreview never throws on truncated long URLs', () => {
  it('survives a cut in the middle of a percent-encoded Japanese path', () => {
    const truncated =
      'https://www.amazon.co.jp/%E3%82%AF%E3%83%AF%E3%83%88%E3%82%B8%E3%83%A3%E3%83%91%E3%83%B3/' +
      'dp/B0EXAMPLE/%E3%82%B8%'
    expect(() => parseUrlPreview(truncated)).not.toThrow()
    const info = parseUrlPreview(truncated)
    expect(info.domain).toContain('amazon.co.jp')
    expect(info.serviceName.length).toBeGreaterThan(0)
  })

  it('survives an incomplete UTF-8 percent triplet in the last segment', () => {
    const truncated = 'https://www.amazon.co.jp/foo/%E3%82'
    expect(() => parseUrlPreview(truncated)).not.toThrow()
    const info = parseUrlPreview(truncated)
    expect(info.domain).toBe('amazon.co.jp')
  })

  it('still titles a well-formed last segment', () => {
    const info = parseUrlPreview('https://example.com/hello-world')
    expect(info.title).toBe('Hello world')
  })
})
