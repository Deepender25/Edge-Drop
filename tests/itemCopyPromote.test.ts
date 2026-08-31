import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const fsRoots = vi.hoisted(() => ({
  home: '',
  userData: ''
}))

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

const LONG_TEXT = 'x'.repeat(500) // crosses the 300-char payload threshold

function makeStore(): ItemStore {
  return new ItemStore()
}

describe('copy-promotion correctness (self-duplication regression)', () => {
  beforeEach(() => {
    fsRoots.userData = join(tmpdir(), `ed-promote-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    fsRoots.home = join(tmpdir(), `ed-promote-home-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(fsRoots.userData, { recursive: true })
    mkdirSync(join(fsRoots.userData, 'payloads'), { recursive: true })
    mkdirSync(join(fsRoots.userData, 'images'), { recursive: true })
    mkdirSync(fsRoots.home, { recursive: true })
  })

  afterEach(() => {
    try { rmSync(fsRoots.userData, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(fsRoots.home, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('after restart, re-adding the full payload matches the stored preview (no duplicate)', () => {
    const store = makeStore()
    store.add({ kind: 'text', text: LONG_TEXT, isUrl: false }, 10)
    const id = store.list()[0].id
    store.persistSync()

    const reopened = makeStore()
    reopened.load()
    expect(reopened.list()).toHaveLength(1)
    expect(reopened.list()[0].data.text.length).toBe(300)

    const fullPayload = reopened.getFullText(id)
    expect(fullPayload).toBe(LONG_TEXT)

    reopened.add({ kind: 'text', text: fullPayload, isUrl: false }, 10)
    expect(reopened.list()).toHaveLength(1)
    expect(reopened.list()[0].hitCount).toBe(2)
  })

  it('SAFE PATH: touch() promotes without changing count, content, or signature', () => {
    const store = makeStore()
    store.add({ kind: 'text', text: LONG_TEXT, isUrl: false }, 10)
    const id = store.list()[0].id
    const before = store.list()[0]
    // Backdate so the recency bump is observable even within the same ms.
    ;(store.list()[0] as { capturedAt: number }).capturedAt -= 5
    const oldCapturedAt = store.list()[0].capturedAt

    const ok = store.touch(id)

    expect(ok).toBe(true)
    expect(store.list()).toHaveLength(1)                 // never duplicated
    const promoted = store.list()[0]
    expect(promoted.id).toBe(id)
    expect(promoted.hitCount).toBe(before.hitCount + 1)
    expect(promoted.capturedAt).toBeGreaterThan(oldCapturedAt)
    // Content identity fully intact (preview pointer + payload untouched).
    expect(promoted.data.kind === 'text' && promoted.data.hasFullPayload).toBe(true)
    expect(store.getFullText(id)).toBe(LONG_TEXT)
  })

  it('touch() moves unpinned items to the front of Recent', () => {
    const store = makeStore()
    store.add({ kind: 'text', text: 'first', isUrl: false }, 10)
    store.add({ kind: 'text', text: 'second', isUrl: false }, 10)
    const firstId = store.list()[store.list().length - 1].id

    store.touch(firstId)

    expect(store.list()[0].id).toBe(firstId)
  })

  it('short texts remain dedup-safe through add() (unchanged behavior)', () => {
    const store = makeStore()
    store.add({ kind: 'text', text: 'short', isUrl: false }, 10)
    store.add({ kind: 'text', text: 'short', isUrl: false }, 10)
    expect(store.list()).toHaveLength(1)
    expect(store.list()[0].hitCount).toBe(2)
  })
})
