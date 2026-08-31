import { describe, expect, it } from 'vitest'
import {
  applySkin,
  buildCatalog,
  hasSkinTones,
  isPasteableEmoji,
  pushRecent,
  resolveGlyph,
  skinChoices,
  unifiedToNative,
  type EmojiSourceEntry
} from '../src/lib/emoji/catalog'
import { resolveEmojiAsset, emojiAssetDir } from '../electron/main/imageProtocol'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sample: EmojiSourceEntry[] = [
  {
    unified: '1F600',
    image: '1f600.png',
    category: 'Smileys & Emotion',
    sort_order: 1,
    has_img_twitter: true
  },
  {
    unified: '1F44B',
    image: '1f44b.png',
    category: 'People & Body',
    sort_order: 2,
    has_img_twitter: true,
    skin_variations: {
      '1F3FB': { unified: '1F44B-1F3FB', image: '1f44b-1f3fb.png', has_img_twitter: true },
      '1F3FC': { unified: '1F44B-1F3FC', image: '1f44b-1f3fc.png', has_img_twitter: true }
    }
  },
  {
    unified: '1F3FB',
    image: '1f3fb.png',
    category: 'Component',
    sort_order: 3,
    has_img_twitter: true
  },
  {
    unified: '263A-FE0F',
    image: '263a-fe0f.png',
    category: 'Smileys & Emotion',
    sort_order: 4,
    has_img_twitter: true,
    obsoleted_by: '1F642'
  }
]

describe('emoji catalog', () => {
  it('groups twitter glyphs and skips components and obsolete entries', () => {
    const cat = buildCatalog(sample)
    expect(cat.all.map((e) => e.unified)).toEqual(['1F600', '1F44B'])
    expect(cat.byCategory['Smileys & Emotion']).toHaveLength(1)
    expect(cat.byCategory['Component']).toBeUndefined()
  })

  it('converts unified sequences to native characters', () => {
    expect(unifiedToNative('1F600')).toBe('😀')
    expect(unifiedToNative('1F44B-1F3FB')).toBe('👋🏻')
  })

  it('applies skin tone only when a variant exists', () => {
    const cat = buildCatalog(sample)
    const wave = cat.byUnified.get('1F44B')!
    const grin = cat.byUnified.get('1F600')!
    expect(applySkin(wave, '1F3FB')).toEqual({ unified: '1F44B-1F3FB', file: '1f44b-1f3fb.png' })
    expect(applySkin(grin, '1F3FB')).toEqual({ unified: '1F600', file: '1f600.png' })
    expect(applySkin(wave, null)).toEqual({ unified: '1F44B', file: '1f44b.png' })
  })

  it('resolves a skin-tone unified back to its parent and file', () => {
    const cat = buildCatalog(sample)
    const g = resolveGlyph(cat, '1F44B-1F3FB')
    expect(g?.entry.unified).toBe('1F44B')
    expect(g?.file).toBe('1f44b-1f3fb.png')
    expect(g?.unified).toBe('1F44B-1F3FB')
    expect(resolveGlyph(cat, '1F600')?.file).toBe('1f600.png')
  })

  it('lists default plus available skin choices for the popup', () => {
    const cat = buildCatalog(sample)
    const wave = cat.byUnified.get('1F44B')!
    const grin = cat.byUnified.get('1F600')!
    expect(hasSkinTones(wave)).toBe(true)
    expect(hasSkinTones(grin)).toBe(false)
    expect(skinChoices(grin)).toHaveLength(1)
    expect(skinChoices(wave).map((c) => c.unified)).toEqual(['1F44B', '1F44B-1F3FB', '1F44B-1F3FC'])
  })

  it('caps recents and moves the latest to front', () => {
    const first = pushRecent([], '1F600')
    const second = pushRecent(first, '1F44B')
    const again = pushRecent(second, '1F600')
    expect(again).toEqual(['1F600', '1F44B'])
  })

  it('rejects non-emoji paste payloads', () => {
    expect(isPasteableEmoji('😀')).toBe(true)
    expect(isPasteableEmoji('👋🏻')).toBe(true)
    expect(isPasteableEmoji('')).toBe(false)
    expect(isPasteableEmoji('hello\nworld')).toBe(false)
    expect(isPasteableEmoji('x'.repeat(65))).toBe(false)
  })
})

describe('emoji asset protocol', () => {
  it('only serves hex-named pngs inside the asset directory', () => {
    const dir = join(tmpdir(), `ed-emoji-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    try {
      writeFileSync(join(dir, '1f600.png'), 'png')
      writeFileSync(join(dir, 'secret.txt'), 'no')
      expect(resolveEmojiAsset(dir, '1f600.png')?.endsWith('1f600.png')).toBe(true)
      expect(resolveEmojiAsset(dir, '1F600.PNG')).toBeTruthy()
      expect(resolveEmojiAsset(dir, '../secret.txt')).toBeNull()
      expect(resolveEmojiAsset(dir, 'secret.txt')).toBeNull()
      expect(resolveEmojiAsset(dir, '1f600.png.exe')).toBeNull()
      expect(resolveEmojiAsset(dir, '')).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('points packaged builds at extraResources', () => {
    const dir = emojiAssetDir({
      packaged: true,
      resourcesPath: 'C:\\res',
      appPath: 'C:\\app',
      cwd: 'C:\\cwd'
    })
    expect(dir.replace(/\\/g, '/')).toBe('C:/res/emoji/64')
  })
})
