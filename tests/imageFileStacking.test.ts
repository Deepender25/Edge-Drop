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
    createFromPath: () => ({
      isEmpty: () => false,
      getSize: () => ({ width: 800, height: 600 }),
      resize: () => ({ toDataURL: () => 'data:image/png;base64,mock' }),
      toDataURL: () => 'data:image/png;base64,mock'
    })
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
import type { ItemData } from '../shared/types'

describe('Image and File Stacking & Merging', () => {
  beforeEach(() => {
    fsRoots.userData = join(tmpdir(), `ed-imgfile-ud-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    fsRoots.home = join(tmpdir(), `ed-imgfile-home-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(join(fsRoots.userData, 'images'), { recursive: true })
    mkdirSync(fsRoots.home, { recursive: true })
  })

  afterEach(() => {
    try { rmSync(fsRoots.userData, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(fsRoots.home, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('merges a web/screenshot image card into a non-image file card', () => {
    const store = new ItemStore()
    const imgPath = join(fsRoots.userData, 'images', 'img-web-1.png')
    writeFileSync(imgPath, 'fake-png')

    const fileDocPath = join(fsRoots.home, 'document.pdf')
    writeFileSync(fileDocPath, 'fake-pdf')

    // 1. Add image item (e.g. from web / screenshot)
    const imgData: ItemData = {
      kind: 'image',
      imageId: 'img-web-1',
      width: 800,
      height: 600,
      bytes: 1024,
      ext: 'png',
      source: 'image',
      fileName: 'web-photo.png'
    }
    store.add(imgData, 10)

    // 2. Add files item (e.g. from Explorer)
    const fileData: ItemData = {
      kind: 'files',
      paths: [fileDocPath]
    }
    store.add(fileData, 10)

    const items = store.list()
    expect(items).toHaveLength(2)
    const fileItemId = items.find((i) => i.data.kind === 'files')!.id
    const imageItemId = items.find((i) => i.data.kind === 'image')!.id

    // 3. Merge image into file stack
    const res = store.merge(imageItemId, fileItemId)
    expect(res.ok).toBe(true)

    const updated = store.list()
    expect(updated).toHaveLength(1)
    expect(updated[0].id).toBe(fileItemId)
    expect(updated[0].data.kind).toBe('files')
    if (updated[0].data.kind === 'files') {
      expect(updated[0].data.paths).toHaveLength(2)
      expect(updated[0].data.paths).toContain(fileDocPath)
      expect(updated[0].data.paths).toContain(imgPath)
    }
  })

  it('merges a file card into an image card, transforming into a files bundle', () => {
    const store = new ItemStore()
    const imgPath = join(fsRoots.userData, 'images', 'img-web-2.png')
    writeFileSync(imgPath, 'fake-png')

    const fileZipPath = join(fsRoots.home, 'archive.zip')
    writeFileSync(fileZipPath, 'fake-zip')

    const imgData: ItemData = {
      kind: 'image',
      imageId: 'img-web-2',
      width: 400,
      height: 300,
      bytes: 512,
      ext: 'png',
      source: 'screenshot'
    }
    store.add(imgData, 10)

    const fileData: ItemData = {
      kind: 'files',
      paths: [fileZipPath]
    }
    store.add(fileData, 10)

    const items = store.list()
    const fileItemId = items.find((i) => i.data.kind === 'files')!.id
    const imageItemId = items.find((i) => i.data.kind === 'image')!.id

    // Drop file item onto image item
    const res = store.merge(fileItemId, imageItemId)
    expect(res.ok).toBe(true)

    const updated = store.list()
    expect(updated).toHaveLength(1)
    expect(updated[0].id).toBe(imageItemId)
    expect(updated[0].data.kind).toBe('files')
    if (updated[0].data.kind === 'files') {
      expect(updated[0].data.paths).toHaveLength(2)
      expect(updated[0].data.paths).toContain(fileZipPath)
      expect(updated[0].data.paths).toContain(imgPath)
    }
  })

  it('merges two pure image cards into an image-collection', () => {
    const store = new ItemStore()
    const img1: ItemData = {
      kind: 'image',
      imageId: 'img-1',
      width: 100,
      height: 100,
      bytes: 200,
      ext: 'png'
    }
    const img2: ItemData = {
      kind: 'image',
      imageId: 'img-2',
      width: 200,
      height: 200,
      bytes: 400,
      ext: 'png'
    }
    store.add(img1, 10)
    store.add(img2, 10)

    const items = store.list()
    const res = store.merge(items[1].id, items[0].id)
    expect(res.ok).toBe(true)

    const updated = store.list()
    expect(updated).toHaveLength(1)
    expect(updated[0].data.kind).toBe('image-collection')
    if (updated[0].data.kind === 'image-collection') {
      expect(updated[0].data.images).toHaveLength(2)
    }
  })

  it('splits an image out of a mixed files bundle back into an image card', () => {
    const store = new ItemStore()
    const imgPath = join(fsRoots.userData, 'images', 'img-web-3.png')
    writeFileSync(imgPath, 'fake-png')
    const docPath = join(fsRoots.home, 'notes.txt')
    writeFileSync(docPath, 'hello world')

    const fileData: ItemData = {
      kind: 'files',
      paths: [docPath, imgPath]
    }
    store.add(fileData, 10)

    const items = store.list()
    expect(items).toHaveLength(1)
    const bundleId = items[0].id

    // Split the image out
    const splitOk = store.split({ id: bundleId, paths: [imgPath], splitPlacement: 'after' })
    expect(splitOk).toBe(true)

    const updated = store.list()
    expect(updated).toHaveLength(2)

    // Original bundle now only has the text file
    const remainingBundle = updated.find((i) => i.id === bundleId)!
    expect(remainingBundle.data.kind).toBe('files')
    if (remainingBundle.data.kind === 'files') {
      expect(remainingBundle.data.paths).toEqual([docPath])
    }

    // New item is extracted as a standalone image card
    const extracted = updated.find((i) => i.id !== bundleId)!
    expect(extracted.data.kind).toBe('image')
  })
})
