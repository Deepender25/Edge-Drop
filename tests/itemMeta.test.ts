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
import { NOTE_MAX, isKept, joinNotes, normalizeNote, noteFromLegacy } from '../shared/itemMeta'
import { fileBaseFromNote, saveItemImages, uniqueDest } from '../electron/main/saveImages'
import { isSafeExternalUrl } from '../electron/main/externalUrl'
import type { ClipboardItem } from '../shared/types'

describe('note normalization (shared, used by main for every write)', () => {
  it('a note is one trimmed line, capped without splitting characters', () => {
    expect(normalizeNote('  Office\n\tWi-Fi   password  ')).toBe('Office Wi-Fi password')
    expect(normalizeNote('a\u0000b')).toBe('a b')
    expect(normalizeNote('   ')).toBeUndefined()
    expect(normalizeNote(42)).toBeUndefined()
    expect(normalizeNote(null)).toBeUndefined()
    const long = '😀'.repeat(NOTE_MAX + 10)
    const cut = normalizeNote(long)!
    expect(Array.from(cut)).toHaveLength(NOTE_MAX)
    expect(cut.endsWith('😀')).toBe(true) // no half surrogate pair
  })

  it('two notes join once each; an old label + tags become one note', () => {
    expect(joinNotes('Invoice', 'Acme')).toBe('Invoice · Acme')
    expect(joinNotes('Same', 'same')).toBe('Same')
    expect(joinNotes(undefined, 'Only')).toBe('Only')
    expect(joinNotes(undefined, undefined)).toBeUndefined()
    expect(noteFromLegacy('Wifi password', ['home', 'network'])).toBe('Wifi password · home network')
    expect(noteFromLegacy(undefined, ['#work'])).toBe('work')
    expect(noteFromLegacy('Only label', 'nope')).toBe('Only label')
    expect(noteFromLegacy('   ', [])).toBeUndefined()
  })

  it('pinned or noted items are kept', () => {
    expect(isKept({})).toBe(false)
    expect(isKept({ pinned: true })).toBe(true)
    expect(isKept({ note: 'x' })).toBe(true)
    expect(isKept({ pinned: false, note: '' })).toBe(false)
  })
})

describe('ItemStore notes', () => {
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

  it('saves the cleaned note without pinning, and it survives a restart', () => {
    const store = new ItemStore()
    store.add(text('secret'), 50)
    const id = store.list()[0].id
    expect(store.setMeta(id, { note: '  Office   Wi-Fi ' })).toBe(true)
    const it = store.get(id)!
    expect(it.note).toBe('Office Wi-Fi')
    expect(it.pinned).toBe(false)
    expect(store.toDto()[0]).toMatchObject({ note: 'Office Wi-Fi', pinned: false })

    store.persistSync()
    const reopened = new ItemStore()
    reopened.load()
    expect(reopened.get(id)).toMatchObject({ note: 'Office Wi-Fi', pinned: false })
  })

  it('removing the note removes the field and leaves the pin alone', () => {
    const store = new ItemStore()
    store.add(text('a'), 50)
    const id = store.list()[0].id
    store.setPinned(id, true)
    store.setMeta(id, { note: 'Name' })
    store.setMeta(id, {})
    expect(store.get(id)?.note).toBe('Name')
    store.setMeta(id, { note: null })
    const it = store.get(id)!
    expect('note' in it).toBe(false)
    expect(it.pinned).toBe(true)
    expect(store.setMeta('missing', { note: 'x' })).toBe(false)
  })

  it('a noted item is kept by the history limit, auto-delete and clear', () => {
    const store = new ItemStore()
    store.add(text('keep me'), 3)
    const keep = store.list()[0].id
    store.setMeta(keep, { note: 'Keep' })
    for (let i = 0; i < 10; i++) store.add(text(`filler ${i}`), 3)
    expect(store.get(keep)?.note).toBe('Keep')
    expect(store.get(keep)?.pinned).toBe(false)
    // auto-delete: everything is older than the cutoff, only the noted item stays
    ;(store.list() as ClipboardItem[]).forEach((it) => { it.capturedAt = 1 })
    store.pruneExpired(1)
    expect(store.list().map((x) => x.id)).toEqual([keep])
    store.add(text('fresh'), 50)
    store.clearUnpinned()
    expect(store.list().map((x) => x.id)).toEqual([keep])
  })

  it('copying the same content again keeps its note', () => {
    const store = new ItemStore()
    store.add(text('same'), 50)
    const id = store.list()[0].id
    store.setMeta(id, { note: 'N' })
    store.add(text('other'), 50)
    store.add(text('same'), 50)
    expect(store.list()[0]).toMatchObject({ id, note: 'N', hitCount: 2 })
    store.touch(id)
    expect(store.get(id)).toMatchObject({ note: 'N' })
  })

  it('merging joins both notes on the target', () => {
    const store = new ItemStore()
    const files = (p: string) => ({ kind: 'files' as const, paths: [join(fsRoots.home, p)] })
    for (const p of ['a.txt', 'b.txt', 'c.txt']) writeFileSync(join(fsRoots.home, p), p)
    store.add(files('a.txt'), 50)
    store.add(files('b.txt'), 50)
    store.add(files('c.txt'), 50)
    const [c, b, a] = store.list().map((x) => x.id)
    store.setMeta(a, { note: 'Source A' })
    expect(store.merge(a, b).ok).toBe(true)
    expect(store.get(a)).toBeUndefined()
    expect(store.get(b)).toMatchObject({ note: 'Source A', pinned: false })
    store.setMeta(c, { note: 'Target C' })
    expect(store.merge(b, c).ok).toBe(true)
    expect(store.get(c)?.note).toBe('Target C · Source A')
  })

  it('load turns an old label + tags into one note (pin kept) and cleans hand-edited notes', () => {
    const saved = {
      items: [
        { id: 'x1', data: { kind: 'text', text: 'hi', isUrl: false }, capturedAt: 1, hitCount: 1, pinned: true, label: 'Wifi password', tags: ['home', 'network'] },
        { id: 'x2', data: { kind: 'text', text: 'yo', isUrl: false }, capturedAt: 1, hitCount: 1, pinned: false, label: '   ', tags: 'nope' },
        { id: 'x3', data: { kind: 'text', text: 'zz', isUrl: false }, capturedAt: 1, hitCount: 1, pinned: false, note: `  ${'N'.repeat(300)}  ` }
      ]
    }
    writeFileSync(PATHS.indexFile(), JSON.stringify(saved))
    const store = new ItemStore()
    store.load()
    expect(store.get('x1')).toMatchObject({ note: 'Wifi password · home network', pinned: true })
    expect('label' in store.get('x1')!).toBe(false)
    expect('tags' in store.get('x1')!).toBe(false)
    expect('note' in store.get('x2')!).toBe(false)
    expect('label' in store.get('x2')!).toBe(false)
    expect(Array.from(store.get('x3')!.note!)).toHaveLength(NOTE_MAX)
  })

  it('a link copied with its page title keeps it; a repeat copy can bring it; old saved links learn it on load', () => {
    const store = new ItemStore()
    const link = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    const html = `<html><body><!--StartFragment--><a href="${link}">Never Gonna Give You Up</a><!--EndFragment--></body></html>`
    store.add({ kind: 'text', text: link, html, isUrl: true }, 50)
    expect(store.toDto()[0].data).toMatchObject({ kind: 'text', linkTitle: 'Never Gonna Give You Up', hasHtml: true })
    // plain copy first, then the same link with its title: the card learns the title
    store.add({ kind: 'text', text: 'https://example.com/a', isUrl: true }, 50)
    expect(store.toDto()[0].data).not.toHaveProperty('linkTitle', expect.anything())
    store.add({ kind: 'text', text: 'https://example.com/a', html: '<a href="https://example.com/a">Example A</a>', isUrl: true }, 50)
    expect(store.toDto()[0]).toMatchObject({ hitCount: 2, data: { linkTitle: 'Example A' } })
    // not a link: no title is read
    store.add({ kind: 'text', text: 'hello', html: '<a href="hello">Hi</a>', isUrl: false }, 50)
    expect(store.toDto()[0].data).not.toHaveProperty('linkTitle', expect.anything())
    // saved before titles were kept
    writeFileSync(PATHS.indexFile(), JSON.stringify({ items: [{ id: 'old', data: { kind: 'text', text: 'https://e.com/x', html: '<a href="https://e.com/x">Old Page</a>', isUrl: true }, capturedAt: 1, hitCount: 1, pinned: true }] }))
    const reopened = new ItemStore()
    reopened.load()
    expect(reopened.toDto()[0].data).toMatchObject({ linkTitle: 'Old Page' })
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

  it('turns a note into a safe Windows file name', () => {
    expect(fileBaseFromNote('Invoice: March/April?')).toBe('Invoice_ March_April_')
    expect(fileBaseFromNote('  report.  ')).toBe('report')
    expect(fileBaseFromNote('CON')).toBe('CON_')
    expect(fileBaseFromNote('...')).toBe('Image')
    expect(Array.from(fileBaseFromNote('x'.repeat(300))).length).toBe(120)
  })

  it('never overwrites: name, name (2), name (3)', () => {
    expect(uniqueDest(dir, 'a', 'png')).toBe(join(dir, 'a.png'))
    writeFileSync(join(dir, 'a.png'), '1')
    expect(uniqueDest(dir, 'a', '.png')).toBe(join(dir, 'a (2).png'))
    writeFileSync(join(dir, 'a (2).png'), '1')
    expect(uniqueDest(dir, 'a', 'png')).toBe(join(dir, 'a (3).png'))
  })

  it('copies originals under the note (numbered for a collection) or the default name', () => {
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
    const noted: ClipboardItem = { id: 'a', note: 'Trip', capturedAt: 0, hitCount: 1, pinned: false, data: { kind: 'image-collection', images: [img('i1'), img('i2'), img('gone')] } }
    const saved = saveItemImages(noted, deps)
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
