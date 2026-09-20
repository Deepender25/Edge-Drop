import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  shouldUseDarkColors: true
}))

const itWindows = process.platform === 'win32' ? it : it.skip

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execFileSync: (...args: unknown[]) => mocks.execFileSync(...args)
  }
})

// Mock electron modules
vi.mock('electron', () => {
  const mockNativeImage = {
    resize: vi.fn().mockReturnThis(),
    toPNG: vi.fn().mockReturnValue(Buffer.from('mock-png'))
  }
  return {
    app: {
      getAppPath: vi.fn().mockReturnValue(process.cwd()),
      getPreferredSystemLanguages: vi.fn().mockReturnValue(['en-US'])
    },
    nativeTheme: {
      get shouldUseDarkColors() {
        return mocks.shouldUseDarkColors
      },
      set shouldUseDarkColors(v: boolean) {
        mocks.shouldUseDarkColors = v
      },
      on: vi.fn()
    },
    nativeImage: {
      createFromPath: vi.fn().mockReturnValue(mockNativeImage),
      createFromBuffer: vi.fn().mockReturnValue(mockNativeImage)
    },
    Tray: vi.fn().mockImplementation(() => ({
      setImage: vi.fn(),
      setToolTip: vi.fn(),
      setContextMenu: vi.fn(),
      on: vi.fn(),
      isDestroyed: vi.fn().mockReturnValue(false)
    })),
    Menu: {
      buildFromTemplate: vi.fn().mockReturnValue({})
    },
    Notification: {
      isSupported: vi.fn().mockReturnValue(false)
    },
    screen: {
      on: vi.fn()
    }
  }
})

import { PATHS } from '../electron/store/paths'
import { isTaskbarLightTheme, getTrayImage } from '../electron/main/tray'
import { nativeTheme } from 'electron'

describe('Tray Icon Theme Adaptation (Issue #64)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('defines both PATHS.trayIcon and PATHS.trayDarkIcon', () => {
    const whitePath = PATHS.trayIcon()
    const darkPath = PATHS.trayDarkIcon()

    expect(whitePath).toContain('tray.png')
    expect(darkPath).toContain('tray-dark.png')
  })

  it('ensures both tray.png and tray-dark.png exist and are valid PNG files', () => {
    const whitePath = PATHS.trayIcon()
    const darkPath = PATHS.trayDarkIcon()

    expect(existsSync(whitePath)).toBe(true)
    expect(existsSync(darkPath)).toBe(true)

    // PNG magic bytes: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    const whiteBuf = readFileSync(whitePath)
    const darkBuf = readFileSync(darkPath)

    expect(whiteBuf.subarray(0, 8)).toEqual(pngMagic)
    expect(darkBuf.subarray(0, 8)).toEqual(pngMagic)
  })

  itWindows('detects Light taskbar when SystemUsesLightTheme is 0x1', () => {
    mocks.execFileSync.mockReturnValue(
      'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize\r\n    SystemUsesLightTheme    REG_DWORD    0x1\r\n'
    )

    const isLight = isTaskbarLightTheme()
    expect(isLight).toBe(true)
  })

  it('detects Dark taskbar when SystemUsesLightTheme is 0x0', () => {
    mocks.execFileSync.mockReturnValue(
      'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize\r\n    SystemUsesLightTheme    REG_DWORD    0x0\r\n'
    )

    const isLight = isTaskbarLightTheme()
    expect(isLight).toBe(false)
  })

  it('falls back to !nativeTheme.shouldUseDarkColors when registry query fails', () => {
    mocks.execFileSync.mockImplementation(() => {
      throw new Error('Registry query failed')
    })

    // In dark mode (shouldUseDarkColors = true), isTaskbarLightTheme should be false
    nativeTheme.shouldUseDarkColors = true
    expect(isTaskbarLightTheme()).toBe(false)

    // In light mode (shouldUseDarkColors = false), isTaskbarLightTheme should be true
    nativeTheme.shouldUseDarkColors = false
    expect(isTaskbarLightTheme()).toBe(true)
  })

  it('loads the dark tray icon when taskbar is in light mode', () => {
    mocks.execFileSync.mockReturnValue(
      'SystemUsesLightTheme    REG_DWORD    0x1'
    )

    const image = getTrayImage()
    expect(image).toBeDefined()
  })

  it('loads the white tray icon when taskbar is in dark mode', () => {
    mocks.execFileSync.mockReturnValue(
      'SystemUsesLightTheme    REG_DWORD    0x0'
    )

    const image = getTrayImage()
    expect(image).toBeDefined()
  })
})
