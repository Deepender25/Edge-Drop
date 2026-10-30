import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const fsRoots = vi.hoisted(() => ({ home: '', userData: '' }))
// A stand-in for DPAPI: the test decides whether encryption is there, whether decrypting works at all
// (a passing failure) and which key is in use (data saved under another key will not decrypt).
const crypto = vi.hoisted(() => ({ available: true, decryptFails: false, key: 'k1' }))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => join(fsRoots.userData, 'app'),
    getPath: (name: string) => (name === 'userData' ? fsRoots.userData : join(fsRoots.userData, name))
  },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
  safeStorage: {
    isEncryptionAvailable: () => crypto.available,
    encryptString: (s: string) => Buffer.from(`ENC:${crypto.key}:${s}`, 'utf8'),
    decryptString: (b: Buffer) => {
      const s = b.toString('utf8')
      const head = `ENC:${crypto.key}:`
      if (crypto.decryptFails || !s.startsWith(head)) throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.')
      return s.slice(head.length)
    }
  }
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => fsRoots.home }
})

import { ItemStore } from '../electron/store/ItemStore'
import { PATHS } from '../electron/store/paths'

const text = (t: string) => ({ kind: 'text' as const, text: t, isUrl: false })
const texts = (store: ItemStore) => store.list().map((i) => (i.data as { text: string }).text)
const indexFile = () => PATHS.indexFile()
const bytes = () => readFileSync(indexFile())
const setAside = () => readdirSync(fsRoots.userData).filter((f) => /^items\.json\.(unreadable-\d+\.bak|corrupted\.\d+)$/.test(f))
const sideFiles = () => readdirSync(fsRoots.userData).filter((f) => f.startsWith('items.json') && f !== 'items.json')

/** A history saved by the app itself (encrypted), as it is on users' machines. */
function savedHistory(...list: string[]): Buffer {
  const store = new ItemStore()
  store.load()
  for (const t of list) store.add(text(t), 250)
  store.persistSync()
  return bytes()
}

function launch(): ItemStore {
  const store = new ItemStore()
  store.load()
  return store
}

beforeEach(() => {
  const base = join(tmpdir(), `edge-drop-history-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fsRoots.home = join(base, 'home')
  fsRoots.userData = join(base, 'userData')
  mkdirSync(fsRoots.home, { recursive: true })
  mkdirSync(fsRoots.userData, { recursive: true })
  crypto.available = true
  crypto.decryptFails = false
  crypto.key = 'k1'
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(join(fsRoots.userData, '..'), { recursive: true, force: true })
})

describe('a saved history that cannot be read is never lost', () => {
  it('a passing failure: set aside byte for byte, the app keeps working, everything is back next launch', () => {
    const original = savedHistory('first', 'second')
    crypto.decryptFails = true
    const store = launch()
    expect(store.list()).toHaveLength(0)
    const [copy] = setAside()
    expect(readFileSync(join(fsRoots.userData, copy)).equals(original)).toBe(true)
    // the session goes on and saves what is new
    store.add(text('copied meanwhile'), 250)
    expect(store.persistSync()).toBe(true)
    // readable again: everything is back, newest first, and the copy is gone
    crypto.decryptFails = false
    expect(texts(launch())).toEqual(['copied meanwhile', 'second', 'first'])
    expect(setAside()).toEqual([])
    expect(texts(launch())).toEqual(['copied meanwhile', 'second', 'first'])
  })

  it('a changed key (profile moved, keys damaged): the old history waits, and merges back when its key returns', () => {
    const original = savedHistory('first', 'second')
    crypto.key = 'k2'
    const store = launch()
    expect(store.list()).toHaveLength(0)
    store.add(text('saved under the new key'), 250)
    store.persistSync()
    // every launch on the new key works normally, the old history kept aside
    expect(texts(launch())).toEqual(['saved under the new key'])
    const [oldCopy] = setAside()
    expect(readFileSync(join(fsRoots.userData, oldCopy)).equals(original)).toBe(true)
    // the old key back: the old history merges back; what the other key saved is now the one set aside
    crypto.key = 'k1'
    expect(texts(launch())).toEqual(['second', 'first'])
    const left = setAside()
    expect(left).toHaveLength(1)
    expect(left[0]).not.toBe(oldCopy)
    const kept = JSON.parse(readFileSync(join(fsRoots.userData, left[0]), 'utf8')) as { payload: string }
    expect(Buffer.from(kept.payload, 'base64').toString('utf8')).toContain('ENC:k2:')
  })

  it('while encryption is unavailable the encrypted history is left as it is, and loads once it is back', () => {
    const original = savedHistory('kept')
    crypto.available = false
    const store = launch()
    store.add(text('new'), 250)
    expect(store.persistSync()).toBe(false)
    expect(bytes().equals(original)).toBe(true)
    crypto.available = true
    expect(texts(launch())).toEqual(['kept'])
    expect(setAside()).toEqual([])
  })

  it('a damaged file is set aside unchanged and the app starts a new history', () => {
    writeFileSync(indexFile(), '{"v":2,"encrypted":tr', 'utf8')
    const original = bytes()
    const store = launch()
    store.add(text('new'), 250)
    expect(store.persistSync()).toBe(true)
    const [copy] = setAside()
    expect(readFileSync(join(fsRoots.userData, copy)).equals(original)).toBe(true)
    // it never reads, so it is kept (never deleted) on later launches
    expect(texts(launch())).toEqual(['new'])
    expect(setAside()).toEqual([copy])
  })

  it('when the copy cannot be made, nothing is saved and the history stays exactly as it is', () => {
    const original = savedHistory('only copy')
    crypto.decryptFails = true
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    mkdirSync(indexFile() + '.unreadable-1234.bak') // the copy's name is taken: writing it fails
    const store = launch()
    store.add(text('new'), 250)
    expect(store.persistSync()).toBe(false)
    expect(bytes().equals(original)).toBe(true)
    vi.restoreAllMocks()
    crypto.decryptFails = false
    expect(texts(launch())).toEqual(['only copy'])
  })

  it('a history file the app cannot open at all is left alone', () => {
    mkdirSync(indexFile()) // reading it fails (EISDIR), like a file another program holds
    const store = launch()
    store.add(text('new'), 250)
    expect(store.persistSync()).toBe(false)
    expect(readdirSync(fsRoots.userData)).toContain('items.json')
    expect(existsSync(indexFile() + '.tmp')).toBe(false)
  })

  it('history older builds set aside as .corrupted comes back when it reads', () => {
    const original = savedHistory('lost to the old bug')
    rmSync(indexFile())
    writeFileSync(indexFile() + '.corrupted.1793345543710', original)
    savedHistory('after')
    expect(texts(launch())).toEqual(['after', 'lost to the old bug'])
    expect(setAside()).toEqual([])
  })

  it('encrypted history is never replaced by a plain copy when encryption goes away mid-session', () => {
    const original = savedHistory('secret')
    const store = launch()
    expect(store.list()).toHaveLength(1)
    crypto.available = false
    store.add(text('another'), 250)
    expect(store.persistSync()).toBe(false)
    expect(bytes().equals(original)).toBe(true)
    expect(bytes().toString('utf8')).not.toContain('secret')
    // back on, the next save writes everything, encrypted
    crypto.available = true
    expect(store.persistSync()).toBe(true)
    expect(texts(launch())).toEqual(['another', 'secret'])
  })
})

describe('saving', () => {
  it('replaces the file only once the new one is complete (no side file left, old one never cut off)', () => {
    savedHistory('one')
    writeFileSync(indexFile() + '.tmp', 'left over from a crash', 'utf8')
    const store = launch()
    expect(store.list()).toHaveLength(1)
    store.add(text('two'), 250)
    store.persistSync()
    expect(sideFiles()).toEqual([])
    expect(JSON.parse(bytes().toString('utf8'))).toMatchObject({ v: 2, encrypted: true })
    expect(launch().list()).toHaveLength(2)
  })

  it('an empty history file (nothing to keep) starts fresh and saves normally', () => {
    writeFileSync(indexFile(), '', 'utf8')
    const store = launch()
    expect(store.list()).toHaveLength(0)
    store.add(text('fresh'), 250)
    store.persistSync()
    expect(launch().list()).toHaveLength(1)
    expect(sideFiles()).toEqual([])
  })

  it('a plain history from early versions still loads and is saved encrypted', () => {
    writeFileSync(indexFile(), JSON.stringify({ items: [{ id: 'a1', data: text('legacy'), capturedAt: 1, hitCount: 1, pinned: false }] }), 'utf8')
    const store = launch()
    expect(store.list()).toHaveLength(1)
    store.persistSync()
    expect(JSON.parse(bytes().toString('utf8')).encrypted).toBe(true)
    expect(launch().list()).toHaveLength(1)
  })
})
