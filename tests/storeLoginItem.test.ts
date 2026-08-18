import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isPackaged: true,
  setLoginItemSettings: vi.fn(),
  getLoginItemSettings: vi.fn(() => ({
    launchItems: [] as Array<{ name: string; path: string; enabled: boolean; args?: string[] }>,
    executableWillLaunchAtLogin: false
  })),
  exePath: 'C:\\Users\\yadav\\AppData\\Local\\Programs\\Edge-Drop\\Edge-Drop.exe',
  loadSettings: vi.fn(() => ({ launchAtLogin: true })),
  saveSettings: vi.fn((patch: Record<string, unknown>) => ({ launchAtLogin: true, ...patch }))
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mocks.isPackaged
    },
    getPath: (name: string) => (name === 'exe' ? mocks.exePath : 'C:\\mock\\userData'),
    setLoginItemSettings: (...args: unknown[]) => mocks.setLoginItemSettings(...args),
    getLoginItemSettings: (...args: unknown[]) => mocks.getLoginItemSettings(...args),
    getVersion: () => '0.2.7',
    getAppPath: () => 'C:\\mock\\app',
    disableHardwareAcceleration: vi.fn(),
    enableSandbox: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
    setAppUserModelId: vi.fn(),
    commandLine: { appendSwitch: vi.fn() },
    on: vi.fn(),
    whenReady: vi.fn(() => new Promise(() => {})),
    quit: vi.fn()
  },
  clipboard: { clear: vi.fn(), writeImage: vi.fn(), readImage: vi.fn(), write: vi.fn(), writeText: vi.fn() },
  nativeImage: { createFromPath: vi.fn(), createFromDataURL: vi.fn() },
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn() },
  powerMonitor: { on: vi.fn(), removeAllListeners: vi.fn() },
  shell: { showItemInFolder: vi.fn(), openExternal: vi.fn() },
  net: { request: vi.fn(), fetch: vi.fn() }
}))

vi.mock('../electron/main/state', () => ({
  loadSettings: () => mocks.loadSettings(),
  saveSettings: (patch: Record<string, unknown>) => mocks.saveSettings(patch),
  getStore: vi.fn(),
  getWatcher: vi.fn(),
  addFiles: vi.fn(),
  pushState: { items: vi.fn(), settings: vi.fn(), togglePanel: vi.fn() }
}))

vi.mock('../electron/store/settings', () => ({
  loadSettings: () => mocks.loadSettings(),
  saveSettings: (patch: Record<string, unknown>) => mocks.saveSettings(patch)
}))

vi.mock('../electron/main/powershell', () => ({
  psHost: { run: vi.fn() },
  getSystemPowerShellPath: () => 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  getWritableCwd: () => 'C:\\Temp'
}))

import { applyLaunchAtLogin, reconcileLaunchAtLoginOnStartup, GITHUB_LOGIN_ITEM_NAMES } from '../electron/main/loginItems'
import { syncLoginItemSettings } from '../electron/main/ipc'

describe('GitHub exe launch-at-login (orphan Run keys)', () => {
  beforeEach(() => {
    delete process.env.APP_BUILD_TARGET
    mocks.isPackaged = true
    mocks.setLoginItemSettings.mockReset()
    mocks.getLoginItemSettings.mockReset()
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [],
      executableWillLaunchAtLogin: false
    })
    mocks.loadSettings.mockReturnValue({ launchAtLogin: true })
  })

  afterEach(() => {
    delete process.env.APP_BUILD_TARGET
  })

  it('unpackaged / dev: does not write Run keys', async () => {
    mocks.isPackaged = false
    const result = await applyLaunchAtLogin(true)
    expect(result).toEqual({ enabled: true, blockedByUser: false, ok: true })
    expect(mocks.setLoginItemSettings).not.toHaveBeenCalled()
  })

  it('enable: clears every historical name then writes Edge-Drop with --hidden and enabled:true', async () => {
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [
        { name: 'Edge-Drop', path: mocks.exePath, enabled: true, args: ['--hidden'] }
      ],
      executableWillLaunchAtLogin: true
    })
    const result = await applyLaunchAtLogin(true)
    expect(result.ok).toBe(true)
    expect(result.enabled).toBe(true)
    for (const name of GITHUB_LOGIN_ITEM_NAMES) {
      expect(mocks.setLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: false,
        path: mocks.exePath,
        name
      })
    }
    expect(mocks.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      path: mocks.exePath,
      args: ['--hidden'],
      name: 'Edge-Drop',
      enabled: true
    })
  })

  it('disable: removes every historical name, including leftovers Task Manager still lists', async () => {
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [
        { name: 'com.edgedrop.app', path: mocks.exePath, enabled: false, args: [] },
        { name: 'Edge-Drop', path: mocks.exePath, enabled: false, args: ['--hidden'] }
      ],
      executableWillLaunchAtLogin: false
    })
    const result = await applyLaunchAtLogin(false)
    expect(result.enabled).toBe(false)
    expect(mocks.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: false,
      path: mocks.exePath,
      name: 'com.edgedrop.app'
    })
    expect(mocks.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: false,
      path: mocks.exePath,
      name: 'Edge-Drop'
    })
    expect(mocks.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: false,
      path: mocks.exePath,
      name: 'electron.app.Edge-Drop'
    })
    expect(mocks.setLoginItemSettings).not.toHaveBeenCalledWith(expect.objectContaining({ openAtLogin: true }))
  })

  it('reads Task Manager disabled items as not launching', async () => {
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [
        { name: 'Edge-Drop', path: mocks.exePath, enabled: false, args: ['--hidden'] }
      ],
      executableWillLaunchAtLogin: false
    })
    const result = await applyLaunchAtLogin(false)
    expect(result.enabled).toBe(false)
    expect(result.blockedByUser).toBe(true)
  })

  it('startup reconcile: Task Manager off + settings still on → settings become off (OS wins)', async () => {
    mocks.loadSettings.mockReturnValue({ launchAtLogin: true })
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [{ name: 'Edge-Drop', path: mocks.exePath, enabled: false }],
      executableWillLaunchAtLogin: false
    })
    const next = await reconcileLaunchAtLoginOnStartup()
    expect(mocks.saveSettings).toHaveBeenCalledWith({ launchAtLogin: false })
    expect(next.launchAtLogin).toBe(false)
  })

  it('startup reconcile: settings off + leftover enabled Run key → retries disable', async () => {
    mocks.loadSettings.mockReturnValue({ launchAtLogin: false })
    mocks.getLoginItemSettings
      .mockReturnValueOnce({
        launchItems: [{ name: 'com.edgedrop.app', path: mocks.exePath, enabled: true }],
        executableWillLaunchAtLogin: true
      })
      .mockReturnValue({
        launchItems: [],
        executableWillLaunchAtLogin: false
      })
    await reconcileLaunchAtLoginOnStartup()
    expect(mocks.setLoginItemSettings).toHaveBeenCalledWith(expect.objectContaining({
      openAtLogin: false,
      name: 'com.edgedrop.app'
    }))
  })

  it('ipc syncLoginItemSettings forwards to applyLaunchAtLogin', async () => {
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [],
      executableWillLaunchAtLogin: false
    })
    await syncLoginItemSettings(false)
    expect(mocks.setLoginItemSettings).toHaveBeenCalled()
  })
})
