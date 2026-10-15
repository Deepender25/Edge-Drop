import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EMOJI_BATCH_MAX, readEmojiBatch } from '../electron/main/imageProtocol'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('readEmojiBatch (main)', () => {
  const dir = join(tmpdir(), `ed-emoji-batch-${process.pid}`)
  beforeEach(() => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '1f600.png'), 'smile')
    writeFileSync(join(dir, '1f44b-1f3fb.png'), 'wave')
    writeFileSync(join(dir, 'secret.txt'), 'no')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('returns base64 PNGs for valid names and leaves out everything else', async () => {
    const out = await readEmojiBatch(dir, ['1f600.png', '1F44B-1F3FB.PNG', 'missing.png', '../secret.txt', 'secret.txt', 42, null])
    expect(out).toEqual({
      '1f600.png': Buffer.from('smile').toString('base64'),
      '1f44b-1f3fb.png': Buffer.from('wave').toString('base64')
    })
  })

  it('ignores a non-array payload and caps one call', async () => {
    expect(await readEmojiBatch(dir, 'nope' as unknown as string[])).toEqual({})
    const many = Array.from({ length: EMOJI_BATCH_MAX + 50 }, () => '1f600.png')
    expect(Object.keys(await readEmojiBatch(dir, many))).toEqual(['1f600.png'])
  })
})

describe('glyph cache (renderer)', () => {
  let calls: string[][]
  let answer: (files: string[]) => Promise<Record<string, string>> | undefined

  beforeEach(() => {
    vi.resetModules()
    calls = []
    answer = (files) => Promise.resolve(Object.fromEntries(files.map((f) => [f, `b64-${f}`])))
    ;(globalThis as { window?: unknown }).window = {
      edge: {
        emojiGlyphs: (files: string[]) => {
          calls.push(files)
          return answer(files)
        }
      }
    }
  })
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
  })

  const flush = () => new Promise((r) => setTimeout(r, 0))

  it('loads a screen in one call, as data: URLs, and never asks twice', async () => {
    const g = await import('../src/lib/emoji/glyphCache')
    const seen: number[] = []
    g.subscribeGlyphs(() => seen.push(g.glyphsVersion()))
    g.loadGlyphs(['a.png', 'b.png'])
    g.loadGlyphs(['a.png', 'b.png']) // in flight: no second call
    expect(calls).toEqual([['a.png', 'b.png']])
    expect(g.glyphSrc('a.png')).toBeUndefined()
    await flush()
    expect(g.glyphSrc('a.png')).toBe('data:image/png;base64,b64-a.png')
    expect(seen).toEqual([1])
    g.loadGlyphs(['a.png', 'b.png', 'c.png'])
    expect(calls[1]).toEqual(['c.png'])
  })

  it('splits big requests into batches of 400', async () => {
    const g = await import('../src/lib/emoji/glyphCache')
    g.loadGlyphs(Array.from({ length: 900 }, (_, i) => `${i}.png`))
    expect(calls.map((c) => c.length)).toEqual([400, 400, 100])
  })

  it('falls back to the per-file protocol URL when the call fails or omits a glyph', async () => {
    answer = (files) => (files[0] === 'x.png' ? Promise.reject(new Error('down')) : Promise.resolve({}))
    const g = await import('../src/lib/emoji/glyphCache')
    g.loadGlyphs(['x.png'])
    g.loadGlyphs(['y.png'])
    await flush()
    expect(g.glyphSrc('x.png')).toBe('edgelocal://emoji/x.png')
    expect(g.glyphSrc('y.png')).toBe('edgelocal://emoji/y.png')
  })

  it('drops the least recently used glyphs past the cap', async () => {
    const g = await import('../src/lib/emoji/glyphCache')
    const first = Array.from({ length: g.GLYPH_CACHE_CAP }, (_, i) => `${i}.png`)
    for (let i = 0; i < first.length; i += 400) {
      g.loadGlyphs(first.slice(i, i + 400))
      await flush()
    }
    g.loadGlyphs(['0.png']) // touch: now most recent
    g.loadGlyphs(['new.png'])
    await flush()
    expect(g.glyphSrc('0.png')).toBeDefined()
    expect(g.glyphSrc('1.png')).toBeUndefined()
    expect(g.glyphSrc('new.png')).toBeDefined()
  })

  it('caps the screen size used for hover warm-up to one call', async () => {
    const g = await import('../src/lib/emoji/glyphCache')
    g.setScreenGlyphCount(168)
    expect(g.screenGlyphCount()).toBe(168)
    g.setScreenGlyphCount(5000)
    expect(g.screenGlyphCount()).toBe(400)
    g.setScreenGlyphCount(NaN)
    expect(g.screenGlyphCount()).toBe(400)
  })
})

describe('emoji picker wiring', () => {
  it('exposes emoji:glyphs through the shared contract, preload and main', () => {
    expect(read('shared/ipc.ts')).toContain("'emoji:glyphs': { args: [files: string[]]; result: Record<string, string> }")
    expect(read('shared/bridge.ts')).toContain('emojiGlyphs: (files: string[]) => Promise<Record<string, string>>')
    expect(read('electron/preload/index.ts')).toContain("emojiGlyphs: (files: string[]) => invoke('emoji:glyphs', files)")
    expect(read('electron/main/ipc.ts')).toMatch(/handle\('emoji:glyphs'[\s\S]*?readEmojiBatch\(/)
  })

  it('grid glyphs come from the cache and keep their image once shown', () => {
    const src = read('src/components/EmojiPicker.tsx')
    expect(src).toContain('src={src}')
    expect(src).toContain('const src = glyphSrc(file) ?? shown.current.src')
    expect(src).toContain('loadGlyphs(items.slice(startRow * cols, endRow * cols)')
    expect(src).not.toContain('emojiGlyphUrl(')
  })

  it('category bar is memoised and warms on a hover rest', () => {
    const src = read('src/components/EmojiCategoryBar.tsx')
    expect(src).toContain('export const EmojiCategoryBar = memo(CategoryBar)')
    expect(src).toContain('onHoverItem={warmOnRest}')
    expect(src).toContain('onPointerLeave={cancelWarm}')
  })

  it('emoji cells do not force a compositor layer each', () => {
    expect(read('src/styles/emoji.css')).not.toMatch(/\.emoji-cell \{[^}]*transform:\s*translateZ/)
  })
})
