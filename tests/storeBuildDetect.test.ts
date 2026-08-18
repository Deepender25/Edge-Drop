import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const appState = vi.hoisted(() => ({
  isPackaged: false,
  appPath: 'C:\\__no_such_edge_drop_app__'
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return appState.isPackaged
    },
    getAppPath: () => appState.appPath,
    getPath: (name: string) => (name === 'userData' ? 'C:\\mock\\userData' : `C:\\mock\\${name}`)
  }
}))

import { isStoreBuild, STORE_STARTUP_TASK_ID } from '../electron/main/config'

function setWindowsStore(value: boolean | undefined): void {
  if (value === undefined) {
    delete (process as NodeJS.Process & { windowsStore?: boolean }).windowsStore
    return
  }
  Object.defineProperty(process, 'windowsStore', {
    value,
    configurable: true,
    enumerable: true,
    writable: true
  })
}

describe('isStoreBuild — every detection signal', () => {
  let tempDirs: string[] = []

  beforeEach(() => {
    delete process.env.APP_BUILD_TARGET
    setWindowsStore(undefined)
    appState.isPackaged = false
    appState.appPath = 'C:\\__no_such_edge_drop_app__'
  })

  afterEach(() => {
    delete process.env.APP_BUILD_TARGET
    setWindowsStore(undefined)
    appState.isPackaged = false
    for (const dir of tempDirs) {
      try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
    tempDirs = []
  })

  function writePackagedJson(body: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), 'ed-build-'))
    tempDirs.push(dir)
    writeFileSync(join(dir, 'package.json'), typeof body === 'string' ? body : JSON.stringify(body))
    appState.isPackaged = true
    appState.appPath = dir
    return dir
  }

  it('is false for unpackaged GitHub / dev (no signals)', () => {
    expect(isStoreBuild()).toBe(false)
  })

  it('is false when APP_BUILD_TARGET is the GitHub stamp', () => {
    process.env.APP_BUILD_TARGET = 'github'
    expect(isStoreBuild()).toBe(false)
  })

  it('is false for lookalike env values (case, whitespace, empty)', () => {
    process.env.APP_BUILD_TARGET = 'STORE'
    expect(isStoreBuild()).toBe(false)
    process.env.APP_BUILD_TARGET = 'store '
    expect(isStoreBuild()).toBe(false)
    process.env.APP_BUILD_TARGET = ''
    expect(isStoreBuild()).toBe(false)
    process.env.APP_BUILD_TARGET = 'msix'
    expect(isStoreBuild()).toBe(false)
  })

  it('is true when APP_BUILD_TARGET=store even if unpackaged', () => {
    process.env.APP_BUILD_TARGET = 'store'
    expect(isStoreBuild()).toBe(true)
  })

  it('is true when process.windowsStore is true', () => {
    setWindowsStore(true)
    expect(isStoreBuild()).toBe(true)
  })

  it('windowsStore wins over a github env stamp', () => {
    process.env.APP_BUILD_TARGET = 'github'
    setWindowsStore(true)
    expect(isStoreBuild()).toBe(true)
  })

  it('is false when windowsStore is explicitly false and nothing else is set', () => {
    setWindowsStore(false)
    expect(isStoreBuild()).toBe(false)
  })

  it('is true when packaged package.json has buildTarget store', () => {
    writePackagedJson({ buildTarget: 'store', name: 'edge-drop' })
    expect(isStoreBuild()).toBe(true)
  })

  it('is false when packaged package.json has buildTarget github', () => {
    writePackagedJson({ buildTarget: 'github', name: 'edge-drop' })
    expect(isStoreBuild()).toBe(false)
  })

  it('is false when packaged package.json has no buildTarget', () => {
    writePackagedJson({ name: 'edge-drop', version: '0.2.7' })
    expect(isStoreBuild()).toBe(false)
  })

  it('is false (and does not throw) when packaged package.json is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ed-build-empty-'))
    tempDirs.push(dir)
    appState.isPackaged = true
    appState.appPath = dir
    expect(() => isStoreBuild()).not.toThrow()
    expect(isStoreBuild()).toBe(false)
  })

  it('is false (and does not throw) when packaged package.json is malformed', () => {
    writePackagedJson('{ not-json')
    expect(() => isStoreBuild()).not.toThrow()
    expect(isStoreBuild()).toBe(false)
  })

  it('is false when unpackaged even if a store-stamped package.json exists on disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ed-build-unpkg-'))
    tempDirs.push(dir)
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ buildTarget: 'store' }))
    appState.isPackaged = false
    appState.appPath = dir
    expect(isStoreBuild()).toBe(false)
  })

  it('keeps STORE_STARTUP_TASK_ID as a non-empty identifier', () => {
    expect(STORE_STARTUP_TASK_ID).toMatch(/^[A-Za-z][A-Za-z0-9]*$/)
    expect(STORE_STARTUP_TASK_ID.length).toBeGreaterThan(3)
  })
})
