import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

const fsRoots = vi.hoisted(() => ({
  home: '',
  userData: ''
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => join(fsRoots.userData, 'app'),
    getPath: (name: string) => (name === 'userData' ? fsRoots.userData : join(fsRoots.userData, name))
  }
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: () => fsRoots.home
  }
})

import {
  PATHS,
  cleanTemp,
  ensureDirs,
  getUnpackagedTempDir,
  isStagedTempPath,
  toUnpackagedFilePath,
  toUnpackagedFilePaths
} from '../electron/store/paths'

function expectedStoreTemp(): string {
  return join(fsRoots.home, 'AppData', 'Local', 'Temp', 'Edge-Drop')
}

function sha10(filePath: string): string {
  return createHash('sha1').update(filePath).digest('hex').slice(0, 10)
}

describe('Store vs exe filesystem interop', () => {
  beforeEach(() => {
    delete process.env.APP_BUILD_TARGET
    fsRoots.home = join(tmpdir(), `ed-home-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    fsRoots.userData = join(tmpdir(), `ed-ud-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(fsRoots.home, { recursive: true })
    mkdirSync(fsRoots.userData, { recursive: true })
  })

  afterEach(() => {
    delete process.env.APP_BUILD_TARGET
    try { rmSync(fsRoots.home, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(fsRoots.userData, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  describe('getUnpackagedTempDir', () => {
    it('exe: is exactly userData/temp (same string as PATHS.tempDir)', () => {
      expect(getUnpackagedTempDir()).toBe(PATHS.tempDir())
      expect(getUnpackagedTempDir()).toBe(join(fsRoots.userData, 'temp'))
    })

    it('store: is the real user Local\\Temp\\Edge-Drop, not userData', () => {
      process.env.APP_BUILD_TARGET = 'store'
      const dir = getUnpackagedTempDir()
      expect(dir).toBe(expectedStoreTemp())
      expect(dir).not.toBe(PATHS.tempDir())
      expect(dir.toLowerCase()).not.toContain('packages')
      expect(dir.toLowerCase()).not.toContain('windowsapps')
    })
  })

  describe('ensureDirs / cleanTemp', () => {
    it('exe: creates images, payloads, temp under userData and does not create the Store interop folder', () => {
      ensureDirs()
      expect(existsSync(PATHS.imagesDir())).toBe(true)
      expect(existsSync(PATHS.payloadsDir())).toBe(true)
      expect(existsSync(PATHS.tempDir())).toBe(true)
      expect(existsSync(expectedStoreTemp())).toBe(false)
    })

    it('store: also creates the unpackaged Local\\Temp\\Edge-Drop directory', () => {
      process.env.APP_BUILD_TARGET = 'store'
      ensureDirs()
      expect(existsSync(PATHS.imagesDir())).toBe(true)
      expect(existsSync(expectedStoreTemp())).toBe(true)
    })

    it('exe: cleanTemp removes only files inside userData/temp', () => {
      ensureDirs()
      const keep = join(PATHS.imagesDir(), 'keep.png')
      const staged = join(PATHS.tempDir(), 'ghost.txt')
      writeFileSync(keep, 'image')
      writeFileSync(staged, 'tmp')
      cleanTemp()
      expect(existsSync(keep)).toBe(true)
      expect(existsSync(staged)).toBe(false)
    })

    it('store: cleanTemp empties both userData/temp and the unpackaged interop dir', () => {
      process.env.APP_BUILD_TARGET = 'store'
      ensureDirs()
      const ud = join(PATHS.tempDir(), 'ud.txt')
      const interop = join(expectedStoreTemp(), 'io.txt')
      writeFileSync(ud, 'a')
      writeFileSync(interop, 'b')
      cleanTemp()
      expect(existsSync(ud)).toBe(false)
      expect(existsSync(interop)).toBe(false)
    })
  })

  describe('isStagedTempPath', () => {
    it('exe: treats userData/temp children as staged and other folders as real', () => {
      const staged = join(PATHS.tempDir(), 'Snippet_abc.txt')
      const real = join(fsRoots.userData, 'images', 'x.png')
      expect(isStagedTempPath(staged)).toBe(true)
      expect(isStagedTempPath(PATHS.tempDir())).toBe(true)
      expect(isStagedTempPath(real)).toBe(false)
      expect(isStagedTempPath('')).toBe(false)
    })

    it('exe: does not treat a sibling folder whose name only shares a prefix as staged', () => {
      expect(isStagedTempPath(PATHS.tempDir() + '-evil\\file.png')).toBe(false)
      expect(isStagedTempPath(join(fsRoots.userData, 'temp2', 'x'))).toBe(false)
    })

    it('store: treats both userData/temp and the unpackaged interop dir as staged', () => {
      process.env.APP_BUILD_TARGET = 'store'
      expect(isStagedTempPath(join(PATHS.tempDir(), 'a.png'))).toBe(true)
      expect(isStagedTempPath(join(expectedStoreTemp(), 'b.png'))).toBe(true)
      expect(isStagedTempPath(join(fsRoots.home, 'Documents', 'c.png'))).toBe(false)
    })
  })

  describe('toUnpackagedFilePath — exe must be a no-op', () => {
    it('returns the original path even when the file lives under userData', () => {
      ensureDirs()
      const src = join(PATHS.imagesDir(), 'shot.png')
      writeFileSync(src, 'png-bytes')
      expect(toUnpackagedFilePath(src)).toBe(src)
      expect(existsSync(expectedStoreTemp())).toBe(false)
    })

    it('returns the original path for ordinary user documents', () => {
      const src = join(fsRoots.home, 'Documents', 'doc.pdf')
      mkdirSync(join(fsRoots.home, 'Documents'), { recursive: true })
      writeFileSync(src, 'pdf')
      expect(toUnpackagedFilePath(src)).toBe(src)
    })
  })

  describe('toUnpackagedFilePath — Store copies package-private files', () => {
    beforeEach(() => {
      process.env.APP_BUILD_TARGET = 'store'
    })

    it('copies a userData image into Local\\Temp\\Edge-Drop with a stable hash name', () => {
      ensureDirs()
      const src = join(PATHS.imagesDir(), 'img_abc.png')
      writeFileSync(src, 'real-png-bytes')
      const dest = toUnpackagedFilePath(src)
      expect(dest).not.toBe(src)
      expect(dest).toBe(join(expectedStoreTemp(), `${sha10(src)}.png`))
      expect(existsSync(dest)).toBe(true)
      expect(readFileSync(dest, 'utf8')).toBe('real-png-bytes')
    })

    it('copies files whose path is under Packages\\ (virtualized package root)', () => {
      const pkg = join(fsRoots.home, 'AppData', 'Local', 'Packages', 'Deepender.EdgeDrop_test', 'LocalCache', 'shot.png')
      mkdirSync(join(pkg, '..'), { recursive: true })
      writeFileSync(pkg, 'pkg-bytes')
      const dest = toUnpackagedFilePath(pkg)
      expect(dest).not.toBe(pkg)
      expect(dest.startsWith(expectedStoreTemp())).toBe(true)
      expect(readFileSync(dest, 'utf8')).toBe('pkg-bytes')
    })

    it('copies files whose path is under WindowsApps\\', () => {
      const winapps = join(fsRoots.home, 'WindowsApps', 'Deepender.EdgeDrop', 'resources', 'icon.png')
      mkdirSync(join(winapps, '..'), { recursive: true })
      writeFileSync(winapps, 'icon')
      const dest = toUnpackagedFilePath(winapps)
      expect(dest).not.toBe(winapps)
      expect(readFileSync(dest, 'utf8')).toBe('icon')
    })

    it('does not copy ordinary user files that already live outside the package', () => {
      const docs = join(fsRoots.home, 'Documents', 'invoice.pdf')
      mkdirSync(join(fsRoots.home, 'Documents'), { recursive: true })
      writeFileSync(docs, 'pdf-bytes')
      expect(toUnpackagedFilePath(docs)).toBe(docs)
    })

    it('returns the original path when the source file does not exist', () => {
      const missing = join(PATHS.imagesDir(), 'gone.png')
      expect(toUnpackagedFilePath(missing)).toBe(missing)
    })

    it('returns empty string unchanged', () => {
      expect(toUnpackagedFilePath('')).toBe('')
    })

    it('maps a mixed list without rewriting user files', () => {
      ensureDirs()
      const pkgFile = join(PATHS.imagesDir(), 'a.png')
      const userFile = join(fsRoots.home, 'Documents', 'b.pdf')
      mkdirSync(join(fsRoots.home, 'Documents'), { recursive: true })
      writeFileSync(pkgFile, 'a')
      writeFileSync(userFile, 'b')
      const out = toUnpackagedFilePaths([pkgFile, userFile])
      expect(out).toHaveLength(2)
      expect(out[0]).not.toBe(pkgFile)
      expect(out[1]).toBe(userFile)
    })

    it('returns the original path when the copy cannot write the destination', () => {
      ensureDirs()
      const src = join(PATHS.imagesDir(), 'fail.png')
      writeFileSync(src, 'x')
      const dest = join(expectedStoreTemp(), `${sha10(src)}.png`)
      mkdirSync(dest, { recursive: true })
      expect(toUnpackagedFilePath(src)).toBe(src)
    })
  })
})
