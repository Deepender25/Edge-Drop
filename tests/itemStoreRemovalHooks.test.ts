import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
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
  nativeImage: {
    createFromPath: () => ({ isEmpty: () => true })
  },
  safeStorage: {
    isEncryptionAvailable: () => false
  }
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: () => fsRoots.home
  }
})

import { ItemStore } from '../electron/store/ItemStore'
import type { ClipboardItem, ItemData } from '../shared/types'

function textData(t: string): ItemData {
  return { kind: 'text', text: t, isUrl: false }
}

describe('ItemStore removal hooks (staged-temp lifecycle wiring)', () => {
  beforeEach(() => {
    fsRoots.userData = join(tmpdir(), `ed-store-ud-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    fsRoots.home = join(tmpdir(), `ed-store-home-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(fsRoots.userData, { recursive: true })
    mkdirSync(fsRoots.home, { recursive: true })
  })

  afterEach(() => {
    try { rmSync(fsRoots.userData, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(fsRoots.home, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  function makeStore(): { store: ItemStore; removed: ClipboardItem[][] } {
    const removed: ClipboardItem[][] = []
    const store = new ItemStore((batch) => removed.push([...batch]))
    return { store, removed }
  }

  it('notifies with the removed item on delete()', () => {
    const { store, removed } = makeStore()
    store.add(textData('alpha'), 10)
    const id = store.list()[0].id

    store.delete(id)

    expect(removed).toHaveLength(1)
    expect(removed[0]).toHaveLength(1)
    expect(removed[0][0].id).toBe(id)
  })

  it('notifies once per batch on deleteBatch()', () => {
    const { store, removed } = makeStore()
    store.add(textData('one'), 10)
    store.add(textData('two'), 10)
    const ids = store.list().map((i) => i.id)

    store.deleteBatch(ids)

    expect(removed).toHaveLength(1)
    expect(removed[0].map((r) => r.id).sort()).toEqual([...ids].sort())
  })

  it('clearUnpinned() notifies with every unpinned item and spares pinned ones', () => {
    const { store, removed } = makeStore()
    store.add(textData('pinned-keeper'), 10)
    store.setPinned(store.list()[0].id, true)
    store.add(textData('recent-a'), 10)
    store.add(textData('recent-b'), 10)

    store.clearUnpinned()

    const flat = removed.flat()
    expect(flat).toHaveLength(2)
    expect(flat.every((r) => r.data.kind === 'text' && r.data.text !== 'pinned-keeper')).toBe(true)
    expect(store.list()).toHaveLength(1)
  })

  it('pruneExpired() notifies only with expired items', () => {
    const { store, removed } = makeStore()
    store.add(textData('old-item'), 10)
    const oldId = store.list()[0].id
    // Backdate past the cutoff.
    ;(store.list()[0] as { capturedAt: number }).capturedAt = Date.now() - 2 * 3600 * 1000
    store.add(textData('fresh-item'), 10)

    const changed = store.pruneExpired(1)

    expect(changed).toBe(true)
    expect(removed).toHaveLength(1)
    expect(removed[0]).toHaveLength(1)
    expect(removed[0][0].id).toBe(oldId)
    expect(store.list()).toHaveLength(1)
  })

  it('silent capacity eviction (trim) notifies with the evicted oldest unpinned item', () => {
    const { store, removed } = makeStore()
    store.add(textData('first'), 2)
    const firstId = store.list()[store.list().length - 1].id
    store.add(textData('second'), 2)
    store.add(textData('third'), 2)

    expect(store.list()).toHaveLength(2)
    expect(removed).toHaveLength(1)
    expect(removed[0]).toHaveLength(1)
    expect(removed[0][0].id).toBe(firstId)
  })

  it('merge() transfers ownership without firing removal hooks', () => {
    const { store, removed } = makeStore()
    store.add(textData('src'), 10)
    store.add(textData('tgt'), 10)
    const ids = store.list().map((i) => i.id)

    const result = store.merge(ids[1], ids[0])

    expect(result.ok).toBe(false) // text items cannot merge — no ownership change
    expect(removed).toHaveLength(0)
  })
})

describe('ItemStore image recovery (no silent low-res fallback)', () => {
  beforeEach(() => {
    fsRoots.userData = join(tmpdir(), `ed-recov-ud-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    fsRoots.home = join(tmpdir(), `ed-recov-home-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(join(fsRoots.userData, 'images'), { recursive: true })
    mkdirSync(fsRoots.home, { recursive: true })
  })

  afterEach(() => {
    try { rmSync(fsRoots.userData, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(fsRoots.home, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  function newStore(): ItemStore {
    return new ItemStore()
  }

  it('resolves the exact extension path when present', () => {
    const p = join(fsRoots.userData, 'images', 'img1.png')
    writeFileSync(p, 'png')
    expect(newStore().resolveStoredImagePath('img1', 'png')).toBe(p)
  })

  it('recovers via directory scan when the recorded extension no longer matches', () => {
    const jpgPath = join(fsRoots.userData, 'images', 'img2.jpg')
    writeFileSync(jpgPath, 'jpeg-bytes')
    expect(newStore().resolveStoredImagePath('img2', 'png')).toBe(jpgPath)
  })

  it('returns null when the image is genuinely unrecoverable', () => {
    expect(newStore().resolveStoredImagePath('missing', 'png')).toBe(null)
    expect(newStore().resolveStoredImagePath('', 'png')).toBe(null)
  })

  it('hasRecoverableCollectionImage() requires at least one surviving image', () => {
    const store = newStore()
    writeFileSync(join(fsRoots.userData, 'images', 'alive.png'), 'a')

    expect(store.hasRecoverableCollectionImage([{ imageId: 'alive', ext: 'png' }, { imageId: 'dead', ext: 'png' }])).toBe(true)
    expect(store.hasRecoverableCollectionImage([{ imageId: 'dead', ext: 'png' }])).toBe(false)
  })

  it('reports missing files as unrecoverable after they are deleted from disk', () => {
    const store = newStore()
    const p = join(fsRoots.userData, 'images', 'vanishing.png')
    writeFileSync(p, 'b')
    expect(store.resolveStoredImagePath('vanishing', 'png')).toBe(p)
    existsSync(p) && rmSync(p)
    expect(store.resolveStoredImagePath('vanishing', 'png')).toBe(null)
  })
})
