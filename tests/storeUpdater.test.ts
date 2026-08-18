import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  version: '0.2.7',
  netRequest: vi.fn(),
  updateAvailable: vi.fn(),
  getSettings: vi.fn(() => ({ autoUpdates: true }))
}))

vi.mock('electron', () => ({
  app: {
    getVersion: () => mocks.version,
    isPackaged: true,
    getAppPath: () => 'C:\\mock\\app',
    getPath: () => 'C:\\mock\\userData'
  },
  net: {
    request: (...args: unknown[]) => mocks.netRequest(...args)
  }
}))

vi.mock('../electron/main/state', () => ({
  pushState: {
    updateAvailable: (...args: unknown[]) => mocks.updateAvailable(...args),
    updateDownloaded: vi.fn()
  }
}))

vi.mock('../electron/store/settings', () => ({
  getSettings: () => mocks.getSettings()
}))

import {
  checkForUpdatesManual,
  initAutoUpdater,
  quitAndInstallUpdate,
  startUpdateDownload,
  syncAutoUpdaterState
} from '../electron/main/updater'

function mockGithubRelease(tag: string, statusCode = 200): void {
  mocks.netRequest.mockImplementation(() => {
    const handlers: Record<string, Array<(...a: unknown[]) => void>> = {}
    return {
      setHeader: vi.fn(),
      abort: vi.fn(),
      on: (ev: string, cb: (...a: unknown[]) => void) => {
        (handlers[ev] ??= []).push(cb)
      },
      end: () => {
        const response = {
          statusCode,
          on: (ev: string, cb: (chunk?: string) => void) => {
            if (ev === 'data') cb(JSON.stringify({ tag_name: tag }))
            if (ev === 'end') cb()
          }
        }
        for (const cb of handlers.response ?? []) cb(response)
      }
    }
  })
}

describe('auto-updater isolation', () => {
  beforeEach(() => {
    delete process.env.APP_BUILD_TARGET
    mocks.netRequest.mockReset()
    mocks.updateAvailable.mockReset()
    mocks.netRequest.mockImplementation(() => {
      throw new Error('net.request must not run on the Store build')
    })
  })

  afterEach(() => {
    delete process.env.APP_BUILD_TARGET
  })

  describe('Store build', () => {
    beforeEach(() => {
      process.env.APP_BUILD_TARGET = 'store'
    })

    it('checkForUpdatesManual reports up-to-date at the running version and never touches the network', async () => {
      const result = await checkForUpdatesManual()
      expect(result).toEqual({ status: 'up-to-date', version: '0.2.7' })
      expect(mocks.netRequest).not.toHaveBeenCalled()
      expect(mocks.updateAvailable).not.toHaveBeenCalled()
    })

    it('quitAndInstallUpdate / startUpdateDownload / sync / init are no-ops', async () => {
      expect(() => quitAndInstallUpdate()).not.toThrow()
      await expect(startUpdateDownload()).resolves.toBeUndefined()
      expect(() => syncAutoUpdaterState()).not.toThrow()
      expect(() => initAutoUpdater()).not.toThrow()
      expect(mocks.netRequest).not.toHaveBeenCalled()
    })
  })

  describe('GitHub exe build', () => {
    it('checkForUpdatesManual reports available when GitHub latest is newer', async () => {
      mockGithubRelease('v0.2.8')
      const result = await checkForUpdatesManual()
      expect(result).toEqual({ status: 'available', version: '0.2.8' })
      expect(mocks.netRequest).toHaveBeenCalled()
      expect(mocks.updateAvailable).toHaveBeenCalledWith({ version: '0.2.8' })
    })

    it('checkForUpdatesManual reports up-to-date when GitHub latest matches', async () => {
      mockGithubRelease('v0.2.7')
      const result = await checkForUpdatesManual()
      expect(result).toEqual({ status: 'up-to-date', version: '0.2.7' })
      expect(mocks.updateAvailable).not.toHaveBeenCalled()
    })

    it('checkForUpdatesManual hits the Edge-Drop releases endpoint', async () => {
      mockGithubRelease('v0.2.7')
      await checkForUpdatesManual()
      expect(mocks.netRequest).toHaveBeenCalledWith(expect.objectContaining({
        method: 'GET',
        url: 'https://api.github.com/repos/Deepender25/Edge-Drop/releases/latest'
      }))
    })
  })
})
