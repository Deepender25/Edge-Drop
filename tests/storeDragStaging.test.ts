import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ItemData } from '../shared/types'

const fsRoots = vi.hoisted(() => ({
  home: '',
  userData: ''
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => join(fsRoots.userData, 'app'),
    getPath: (name: string) => (name === 'userData' ? fsRoots.userData : join(fsRoots.userData, name)),
    getFileIcon: vi.fn(() => Promise.resolve({ isEmpty: () => true }))
  },
  nativeImage: {
    createFromBuffer: vi.fn(() => ({ isEmpty: () => true }))
  }
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: () => fsRoots.home
  }
})

vi.mock('../electron/main/state', () => ({
  getStore: () => ({
    getImagePath: (imageId: string, ext = 'png') =>
      join(fsRoots.userData, 'images', `${imageId}.${ext}`)
  })
}))

import { stageDragFile } from '../electron/main/drag'

const stamp = new Date(2026, 7, 15, 22, 30, 45).getTime()

describe('stageDragFile uses the correct staging root per build', () => {
  beforeEach(() => {
    delete process.env.APP_BUILD_TARGET
    fsRoots.home = join(tmpdir(), `ed-drag-home-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    fsRoots.userData = join(tmpdir(), `ed-drag-ud-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(join(fsRoots.userData, 'images'), { recursive: true })
    mkdirSync(join(fsRoots.userData, 'temp'), { recursive: true })
    mkdirSync(fsRoots.home, { recursive: true })
  })

  afterEach(() => {
    delete process.env.APP_BUILD_TARGET
    try { rmSync(fsRoots.home, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(fsRoots.userData, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  function writeImage(id: string): string {
    const p = join(fsRoots.userData, 'images', `${id}.png`)
    writeFileSync(p, `png-${id}`)
    return p
  }

  it('exe image: copies into userData/temp, not the Store interop folder', () => {
    writeImage('img_exe')
    const staged = stageDragFile({
      kind: 'image',
      imageId: 'img_exe',
      width: 10,
      height: 10,
      bytes: 8,
      ext: 'png'
    }, stamp)
    expect(staged).not.toBeNull()
    expect(staged!.file.startsWith(join(fsRoots.userData, 'temp'))).toBe(true)
    expect(staged!.file).toContain('Screenshot 2026-08-15 22.30.45.png')
    expect(existsSync(staged!.file)).toBe(true)
    expect(readFileSync(staged!.file, 'utf8')).toBe('png-img_exe')
    expect(existsSync(join(fsRoots.home, 'AppData', 'Local', 'Temp', 'Edge-Drop'))).toBe(false)
  })

  it('store image: copies into the real user Local\\Temp\\Edge-Drop folder', () => {
    process.env.APP_BUILD_TARGET = 'store'
    writeImage('img_store')
    const staged = stageDragFile({
      kind: 'image',
      imageId: 'img_store',
      width: 10,
      height: 10,
      bytes: 8,
      ext: 'png'
    }, stamp)
    const interop = join(fsRoots.home, 'AppData', 'Local', 'Temp', 'Edge-Drop')
    expect(staged).not.toBeNull()
    expect(staged!.file.startsWith(interop)).toBe(true)
    expect(staged!.file.startsWith(join(fsRoots.userData, 'temp'))).toBe(false)
    expect(existsSync(staged!.file)).toBe(true)
    expect(readFileSync(staged!.file, 'utf8')).toBe('png-img_store')
  })

  it('exe files: keeps the original user paths (does not copy)', () => {
    const doc = join(fsRoots.home, 'Documents', 'report.pdf')
    mkdirSync(join(fsRoots.home, 'Documents'), { recursive: true })
    writeFileSync(doc, 'pdf')
    const staged = stageDragFile({ kind: 'files', paths: [doc] })
    expect(staged).toEqual({ file: doc, files: [doc] })
  })

  it('store files: remaps package-private images but leaves user documents untouched', () => {
    process.env.APP_BUILD_TARGET = 'store'
    const pkgImg = writeImage('inside')
    const doc = join(fsRoots.home, 'Documents', 'notes.txt')
    mkdirSync(join(fsRoots.home, 'Documents'), { recursive: true })
    writeFileSync(doc, 'txt')
    const staged = stageDragFile({ kind: 'files', paths: [pkgImg, doc] })
    expect(staged).not.toBeNull()
    expect(staged!.files).toHaveLength(2)
    expect(staged!.files![0]).not.toBe(pkgImg)
    expect(staged!.files![0]).toContain(join('AppData', 'Local', 'Temp', 'Edge-Drop'))
    expect(staged!.files![1]).toBe(doc)
    expect(readFileSync(staged!.files![0], 'utf8')).toBe('png-inside')
  })

  it('store text: writes the snippet into the unpackaged interop dir', () => {
    process.env.APP_BUILD_TARGET = 'store'
    const data: ItemData = { kind: 'text', text: 'hello store drag', isUrl: false }
    const staged = stageDragFile(data)
    expect(staged).not.toBeNull()
    expect(staged!.file).toContain(join('AppData', 'Local', 'Temp', 'Edge-Drop'))
    expect(readFileSync(staged!.file, 'utf8')).toBe('hello store drag')
  })

  it('returns null when an image file is missing on disk', () => {
    const staged = stageDragFile({
      kind: 'image',
      imageId: 'missing',
      width: 1,
      height: 1,
      bytes: 1,
      ext: 'png'
    }, stamp)
    expect(staged).toBeNull()
  })

  // ---------------------------------------------------------------------
  // REGRESSION: sub-images of one collection share the parent's capturedAt
  // stamp. The old blind existsSync-skip collapsed every sibling onto the
  // first-staged file, so dragging ANY expanded row delivered the top image.
  // ---------------------------------------------------------------------
  it('stages two DIFFERENT sub-images sharing one timestamp as two distinct files', () => {
    writeImage('sub_a')
    writeImage('sub_b')
    const base = { width: 10, height: 10 } as const

    const a = stageDragFile({ kind: 'image', imageId: 'sub_a', ...base, bytes: 'png-sub_a'.length, ext: 'png' },
      stamp, { indexSuffix: 1 })
    const b = stageDragFile({ kind: 'image', imageId: 'sub_b', ...base, bytes: 'png-sub_b'.length, ext: 'png' },
      stamp, { indexSuffix: 2 })

    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a!.file).not.toBe(b!.file)
    expect(readFileSync(a!.file, 'utf8')).toBe('png-sub_a')
    expect(readFileSync(b!.file, 'utf8')).toBe('png-sub_b')
  })

  it('never reuses an existing staged name that holds different content (auto "(2)" rename)', () => {
    writeImage('victim') // source whose payload differs from the impostor below
    const tempDir = join(fsRoots.userData, 'temp')
    mkdirSync(tempDir, { recursive: true })
    // Impostor: occupies the exact candidate name with WRONG content/size.
    writeFileSync(join(tempDir, 'Screenshot 2026-08-15 22.30.45.png'), 'impostor-bytes')

    const staged = stageDragFile({
      kind: 'image',
      imageId: 'victim',
      width: 10,
      height: 10,
      bytes: 'png-victim'.length,
      ext: 'png'
    }, stamp)

    expect(staged).not.toBeNull()
    expect(readFileSync(staged!.file, 'utf8')).toBe('png-victim')
    expect(staged!.file).toMatch(/Screenshot 2026-08-15 22\.30\.45 \(2\)\.png$/)
    // The impostor file must remain untouched.
    expect(readFileSync(join(tempDir, 'Screenshot 2026-08-15 22.30.45.png'), 'utf8')).toBe('impostor-bytes')
  })

  it('reuses an existing staged name only when the payload size matches exactly', () => {
    writeImage('same')
    const tempDir = join(fsRoots.userData, 'temp')
    mkdirSync(tempDir, { recursive: true })
    writeFileSync(join(tempDir, 'Image 2026-08-15 22.30.45.png'), 'png-same')

    const first = stageDragFile({
      kind: 'image',
      imageId: 'same',
      width: 10,
      height: 10,
      bytes: 'png-same'.length,
      ext: 'png',
      source: 'image'
    }, stamp)
    expect(first).not.toBeNull()
    expect(first!.file).toBe(join(tempDir, 'Image 2026-08-15 22.30.45.png'))
    expect(readFileSync(first!.file, 'utf8')).toBe('png-same')
  })
})
