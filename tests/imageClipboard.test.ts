import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeImageToClipboard } from '../electron/main/ipc'
import { clipboard, nativeImage } from 'electron'

vi.mock('electron', () => {
  let mockClipboardImage: any = null
  return {
    clipboard: {
      clear: vi.fn(),
      writeImage: vi.fn((img) => {
        mockClipboardImage = img
      }),
      readImage: vi.fn(() => mockClipboardImage)
    },
    nativeImage: {
      createFromPath: vi.fn((path: string) => {
        if (path.includes('valid.png')) {
          return {
            isEmpty: () => false,
            getSize: () => ({ width: 1920, height: 1080 })
          }
        }
        return {
          isEmpty: () => true,
          getSize: () => ({ width: 0, height: 0 })
        }
      }),
      createFromDataURL: vi.fn((url: string) => {
        if (url && url.startsWith('data:image/png;base64,')) {
          return {
            isEmpty: () => false,
            getSize: () => ({ width: 240, height: 135 })
          }
        }
        return {
          isEmpty: () => true,
          getSize: () => ({ width: 0, height: 0 })
        }
      })
    },
    app: {
      isPackaged: false,
      getAppPath: () => 'C:\\mock\\app',
      getPath: () => 'C:\\mock\\userData',
      disableHardwareAcceleration: vi.fn(),
      enableSandbox: vi.fn(),
      requestSingleInstanceLock: vi.fn(() => true),
      setAppUserModelId: vi.fn(),
      commandLine: {
        appendSwitch: vi.fn()
      },
      on: vi.fn(),
      whenReady: vi.fn(() => new Promise(() => {})), // never resolves in isolated unit tests
      quit: vi.fn()
    },
    protocol: {
      registerSchemesAsPrivileged: vi.fn(),
      handle: vi.fn()
    },
    ipcMain: {
      on: vi.fn(),
      handle: vi.fn()
    },
    BrowserWindow: {
      fromWebContents: vi.fn()
    },
    powerMonitor: {
      on: vi.fn(),
      removeAllListeners: vi.fn()
    }
  }
})

vi.mock('node:fs', () => ({
  existsSync: vi.fn((p: string) => {
    return p.includes('valid.png')
  }),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  statSync: vi.fn(),
  mkdirSync: vi.fn()
}))

vi.mock('../electron/main/powershell', () => ({
  psHost: {
    run: vi.fn()
  }
}))

vi.mock('../electron/main/state', () => ({
  getStore: vi.fn(),
  getWatcher: vi.fn(),
  pushState: {
    items: vi.fn(),
    togglePanel: vi.fn()
  }
}))

vi.mock('../electron/store/settings', () => ({
  loadSettings: vi.fn(() => ({ historyLimit: 250, incognito: false }))
}))

describe('writeImageToClipboard (#44)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes pure in-memory nativeImage to clipboard when image path exists on disk', async () => {
    const validPath = 'C:\\mock\\images\\valid.png'
    await writeImageToClipboard(validPath)

    expect(nativeImage.createFromPath).toHaveBeenCalledWith(validPath)
    expect(clipboard.clear).toHaveBeenCalledTimes(1)
    expect(clipboard.writeImage).toHaveBeenCalledTimes(1)
  })

  it('aborts with false and never degrades to a low-res preview when the image file is missing', async () => {
    const missingPath = 'C:\\mock\\images\\missing.png'
    const result = await writeImageToClipboard(missingPath)

    // Fix contract: silent quality degradation is worse than explicit failure.
    expect(result).toBe(false)
    expect(nativeImage.createFromDataURL).not.toHaveBeenCalled()
    expect(clipboard.clear).not.toHaveBeenCalled()
    expect(clipboard.writeImage).not.toHaveBeenCalled()
  })

  it('reports success explicitly when the full-resolution bitmap was written', async () => {
    const validPath = 'C:\\mock\\images\\valid.png'
    const result = await writeImageToClipboard(validPath)
    expect(result).toBe(true)
  })

  it('does not throw or corrupt clipboard when image is null/empty', async () => {
    await writeImageToClipboard(null)
    expect(clipboard.writeImage).not.toHaveBeenCalled()
  })
})
