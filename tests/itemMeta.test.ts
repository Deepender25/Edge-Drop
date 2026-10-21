import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const fsRoots = vi.hoisted(() => ({ home: '', userData: '' }))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => join(fsRoots.userData, 'app'),
    getPath: (name: string) => (name === 'userData' ? fsRoots.userData : join(fsRoots.userData, name))
  },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
  safeStorage: { isEncryptionAvailable: () => false }
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => fsRoots.home }
})

import { ItemStore } from '../electron/store/ItemStore'
import { PATHS } from '../electron/store/paths'
import {
  LABEL_MAX,
  TAGS_MAX,
  TAG_MAX_LEN,
  combineTags,
  hasItemMeta,
  normalizeLabel,
  normalizeTag,
  normalizeTags
} from '../shared/itemMeta'
import { fileBaseFromLabel, saveItemImages, uniqueDest } from '../electron/main/saveImages'
import { isSafeExternalUrl } from '../electron/main/externalUrl'
import type { ClipboardItem } from '../shared/types'

describe('label / tag normalization (shared, used by main for every write)', () => {
  it('labels become one trimmed line, capped without splitting characters', () => {
    expect(normalizeLabel('  Office\n\tWi-Fi   password  ')).toBe('Office Wi-Fi password')
    expect(normalizeLabel('a\u0000b')).toBe('a b')
    expect(normalizeLabel('   ')).toBeUndefined()
    expect(normalizeLabel(42)).toBeUndefined()
    expect(normalizeLabel(null)).toBeUndefined()
    const long = '😀'.repeat(LABEL_MAX + 10)
    const cut = normalizeLabel(long)!
    expect(Array.from(cut)).toHaveLength(LABEL_MAX)
    expect(cut.endsWith('😀')).toBe(true) // no half surrogate pair
  })

  it('tags are one lowercase word in any language', () => {
    expect(normalizeTag('#Work')).toBe('work')
    expect(normalizeTag('##client a')).toBe('client-a')
    expect(normalizeTag('  Client   A  ')).toBe('client-a')
    expect(normalizeTag('ÜBER-größe')).toBe('über-größe')
    expect(normalizeTag('काम')).toBe('काम')
    expect(normalizeTag('日本語')).toBe('日本語')
    expect(normalizeTag('c++')).toBe('c++')
    expect(normalizeTag('v1.2')).toBe('v1.2')
    expect(normalizeTag('a!@$%^&*()b')).toBe('ab')
    expect(normalizeTag('--x--')).toBe('x')
    expect(normalizeTag('#')).toBeUndefined()
    expect(normalizeTag('!!!')).toBeUndefined()
    expect(normalizeTag(undefined)).toBeUndefined()
    expect(Array.from(normalizeTag('a'.repeat(50))!)).toHaveLength(TAG_MAX_LEN)
    expect(normalizeTag('abcdefghijklmnopqrstuvw-xyz')).toBe('abcdefghijklmnopqrstuvw') // no trailing '-'
  })

  it('tag lists are cleaned, de-duplicated and capped', () => {
    expect(normalizeTags(['Work', '#work', 'wifi', '', '!!', 'a', 'b', 'c', 'd'])).toEqual(['work', 'wifi', 'a', 'b', 'c'])
    expect(normalizeTags(['x', 'y', 'z', 'p', 'q', 'r'])).toHaveLength(TAGS_MAX)
    expect(normalizeTags([])).toBeUndefined()
    expect(normalizeTags('work')).toBeUndefined()
    expect(combineTags(['work'], ['wifi', 'work'])).toEqual(['work', 'wifi'])
    expect(combineTags(undefined, undefined)).toBeUndefined()
    expect(hasItemMeta({})).toBe(false)
    expect(hasItemMeta({ tags: [] })).toBe(false)
    expect(hasItemMeta({ label: 'x' })).toBe(true)
    expect(hasItemMeta({ tags: ['x'] })).toBe(true)
  })
})

describe('ItemStore label / tags', () => {
  beforeEach(() => {
    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    fsRoots.userData = join(tmpdir(), `ed-meta-${stamp}`)
    fsRoots.home = join(tmpdir(), `ed-meta-home-${stamp}`)
    for (const d of [fsRoots.userData, join(fsRoots.userData, 'payloads'), join(fsRoots.userData, 'images'), fsRoots.home]) {
      mkdirSync(d, { recursive: true })
    }
  })
  afterEach(() => {
    try { rmSync(fsRoots.userData, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(fsRoots.home, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  const text = (t: string) => ({ kind: 'text' as const, text: t, isUrl: false })

  it('saves cleaned values, pins the item, and survives a restart', () => {
    const store = new ItemStore()
    store.add(text('secret'), 50)
    const id = store.list()[0].id
    expect(store.setMeta(id, { label: '  Office   Wi-Fi ', tags: ['#Work', 'work', 'Home Net'] })).toBe(true)
    const it = store.get(id)!
    expect(it.label).toBe('Office Wi-Fi')
    expect(it.tags).toEqual(['work', 'home-net'])
    expect(it.pinned).toBe(true)
    expect(store.toDto()[0]).toMatchObject({ label: 'Office Wi-Fi', tags: ['work', 'home-net'] })

    store.persistSync()
    const reopened = new ItemStore()
    reopened.load()
    expect(reopened.get(id)).toMatchObject({ label: 'Office Wi-Fi', tags: ['work', 'home-net'], pinned: true })
  })

  it('a partial patch keeps the other field; clearing removes the fields but keeps the pin', () => {
    const store = new ItemStore()
    store.add(text('a'), 50)
    const id = store.list()[0].id
    store.setMeta(id, { label: 'Name', tags: ['x'] })
    store.setMeta(id, { tags: ['y'] })
    expect(store.get(id)).toMatchObject({ label: 'Name', tags: ['y'] })
    store.setMeta(id, { label: null, tags: null })
    const it = store.get(id)!
    expect('label' in it).toBe(false)
    expect('tags' in it).toBe(false)
    expect(it.pinned).toBe(true)
    expect(store.setMeta('missing', { label: 'x' })).toBe(false)
  })

  it('a labelled item is kept by the history limit (it is pinned)', () => {
    const store = new ItemStore()
    store.add(text('keep me'), 3)
    const keep = store.list()[0].id
    store.setMeta(keep, { label: 'Keep' })
    for (let i = 0; i < 10; i++) store.add(text(`filler ${i}`), 3)
    expect(store.get(keep)?.label).toBe('Keep')
  })

  it('copying the same content again keeps its label and tags', () => {
    const store = new ItemStore()
    store.add(text('same'), 50)
    const id = store.list()[0].id
    store.setMeta(id, { label: 'L', tags: ['t'] })
    store.add(text('other'), 50)
    store.add(text('same'), 50)
    expect(store.list()[0]).toMatchObject({ id, label: 'L', tags: ['t'], hitCount: 2 })
    store.touch(id)
    expect(store.get(id)).toMatchObject({ label: 'L', tags: ['t'] })
  })

  it('merging keeps the target label (or takes the source one) and combines tags', () => {
    const store = new ItemStore()
    const files = (p: string) => ({ kind: 'files' as const, paths: [join(fsRoots.home, p)] })
    for (const p of ['a.txt', 'b.txt', 'c.txt']) writeFileSync(join(fsRoots.home, p), p)
    store.add(files('a.txt'), 50)
    store.add(files('b.txt'), 50)
    store.add(files('c.txt'), 50)
    const [c, b, a] = store.list().map((x) => x.id)
    store.setMeta(a, { label: 'Source A', tags: ['alpha', 'shared'] })
    store.setMeta(b, { tags: ['beta', 'shared'] })
    store.setPinned(b, false)
    expect(store.merge(a, b).ok).toBe(true)
    expect(store.get(a)).toBeUndefined()
    expect(store.get(b)).toMatchObject({ label: 'Source A', tags: ['beta', 'shared', 'alpha'], pinned: true })
    store.setMeta(c, { label: 'Target C' })
    expect(store.merge(b, c).ok).toBe(true)
    expect(store.get(c)?.label).toBe('Target C')
  })

  it('load cleans hand-edited values instead of trusting them', () => {
    const dirty = {
      items: [
        { id: 'x1', data: { kind: 'text', text: 'hi', isUrl: false }, capturedAt: 1, hitCount: 1, pinned: true, label: `  ${'L'.repeat(200)}  `, tags: ['#A', 'a', 5, 'b c'] },
        { id: 'x2', data: { kind: 'text', text: 'yo', isUrl: false }, capturedAt: 1, hitCount: 1, pinned: false, label: '   ', tags: 'nope' }
      ]
    }
    writeFileSync(PATHS.indexFile(), JSON.stringify(dirty))
    const store = new ItemStore()
    store.load()
    expect(Array.from(store.get('x1')!.label!)).toHaveLength(LABEL_MAX)
    expect(store.get('x1')!.tags).toEqual(['a', 'b-c'])
    expect('label' in store.get('x2')!).toBe(false)
    expect('tags' in store.get('x2')!).toBe(false)
  })

  it('the DTO tells the renderer when a text item has html, without sending the html', () => {
    const store = new ItemStore()
    store.add({ kind: 'text', text: 'rich', html: '<b>rich</b>', isUrl: false }, 50)
    store.add(text('plain'), 50)
    const [plain, rich] = store.toDto()
    expect(rich.data).toMatchObject({ kind: 'text', hasHtml: true })
    expect('html' in rich.data).toBe(false)
    expect(plain.data).toMatchObject({ kind: 'text', hasHtml: false })
  })
})

describe('save images to Downloads', () => {
  const dir = join(tmpdir(), `ed-save-${process.pid}`)
  beforeEach(() => mkdirSync(dir, { recursive: true }))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('turns a label into a safe Windows file name', () => {
    expect(fileBaseFromLabel('Invoice: March/April?')).toBe('Invoice_ March_April_')
    expect(fileBaseFromLabel('  report.  ')).toBe('report')
    expect(fileBaseFromLabel('CON')).toBe('CON_')
    expect(fileBaseFromLabel('...')).toBe('Image')
    expect(Array.from(fileBaseFromLabel('x'.repeat(300))).length).toBe(120)
  })

  it('never overwrites: name, name (2), name (3)', () => {
    expect(uniqueDest(dir, 'a', 'png')).toBe(join(dir, 'a.png'))
    writeFileSync(join(dir, 'a.png'), '1')
    expect(uniqueDest(dir, 'a', '.png')).toBe(join(dir, 'a (2).png'))
    writeFileSync(join(dir, 'a (2).png'), '1')
    expect(uniqueDest(dir, 'a', 'png')).toBe(join(dir, 'a (3).png'))
  })

  it('copies originals under the label (numbered for a collection) or the default name', () => {
    const src = join(dir, 'src')
    mkdirSync(src)
    writeFileSync(join(src, 'i1.png'), 'one')
    writeFileSync(join(src, 'i2.png'), 'two')
    const out = join(dir, 'out')
    const deps = {
      destDir: out,
      resolveSource: (id: string) => (existsSync(join(src, `${id}.png`)) ? join(src, `${id}.png`) : null),
      defaultName: (_at: number, ext: string, _img: unknown, n: number) => `Screenshot X (${n}).${ext}`
    }
    const img = (id: string) => ({ imageId: id, width: 1, height: 1, bytes: 3, ext: 'png' })
    const labelled: ClipboardItem = { id: 'a', label: 'Trip', capturedAt: 0, hitCount: 1, pinned: true, data: { kind: 'image-collection', images: [img('i1'), img('i2'), img('gone')] } }
    const saved = saveItemImages(labelled, deps)
    expect(saved).toEqual([join(out, 'Trip (1).png'), join(out, 'Trip (2).png')])
    expect(readFileSync(saved[1], 'utf8')).toBe('two')
    const plain: ClipboardItem = { id: 'b', capturedAt: 0, hitCount: 1, pinned: false, data: { kind: 'image', ...img('i1') } }
    expect(saveItemImages(plain, deps)).toEqual([join(out, 'Screenshot X (1).png')])
    expect(saveItemImages({ ...plain, data: { kind: 'text', text: 'x', isUrl: false } }, deps)).toEqual([])
  })
})

describe('links handed to the OS', () => {
  it('only web, mail and Store links open', () => {
    expect(isSafeExternalUrl('https://example.com/a?b=1')).toBe(true)
    expect(isSafeExternalUrl('http://example.com')).toBe(true)
    expect(isSafeExternalUrl('mailto:me@example.com')).toBe(true)
    expect(isSafeExternalUrl('ms-windows-store://review/?ProductId=9P3JMHN9M4NR')).toBe(true)
    expect(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('search-ms:query=x')).toBe(false)
    expect(isSafeExternalUrl('www.example.com')).toBe(false)
    expect(isSafeExternalUrl('')).toBe(false)
    expect(isSafeExternalUrl(undefined)).toBe(false)
  })
})
