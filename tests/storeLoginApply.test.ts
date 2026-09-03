import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  get: vi.fn(async () => 2 as number | null),
  enable: vi.fn(async () => 2 as number | null),
  disable: vi.fn(async () => 0 as number | null)
}))

const child = vi.hoisted(() => ({
  execFileSync: vi.fn()
}))

const mocks = vi.hoisted(() => ({
  isPackaged: true,
  exePath: 'C:\\Program Files\\WindowsApps\\Deepender.EdgeDrop_0.3.0.0_x64__aqnvcnjbf5ns8\\app\\Edge-Drop.exe',
  loadSettings: vi.fn(() => ({ launchAtLogin: false })),
  saveSettings: vi.fn((patch: Record<string, unknown>) => ({ launchAtLogin: false, ...patch }))
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mocks.isPackaged
    },
    getPath: (name: string) => (name === 'exe' ? mocks.exePath : 'C:\\mock\\userData'),
    getAppPath: () => 'C:\\mock\\app',
    setLoginItemSettings: vi.fn(),
    getLoginItemSettings: vi.fn(() => ({ launchItems: [], executableWillLaunchAtLogin: false }))
  }
}))

vi.mock('../electron/store/settings', () => ({
  loadSettings: () => mocks.loadSettings(),
  saveSettings: (patch: Record<string, unknown>) => mocks.saveSettings(patch)
}))

vi.mock('../electron/main/storeStartup', () => ({
  getStatus: () => store.get(),
  enable: () => store.enable(),
  disable: () => store.disable(),
  StartupTaskState: {
    Disabled: 0,
    DisabledByUser: 1,
    Enabled: 2,
    DisabledByPolicy: 3,
    EnabledByPolicy: 4
  }
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execFileSync: (...args: unknown[]) => child.execFileSync(...args)
  }
})

import { app } from 'electron'
import { applyLaunchAtLogin, reconcileLaunchAtLoginOnStartup, refreshLaunchAtLoginFromOs } from '../electron/main/loginItems'

describe('Store applyLaunchAtLogin uses only enable / disable / getStatus', () => {
  beforeEach(() => {
    process.env.APP_BUILD_TARGET = 'store'
    mocks.isPackaged = true
    mocks.loadSettings.mockReturnValue({ launchAtLogin: false })
    store.get.mockReset()
    store.enable.mockReset()
    store.disable.mockReset()
    store.get.mockResolvedValue(0)
    store.enable.mockResolvedValue(2)
    store.disable.mockResolvedValue(0)
    mocks.saveSettings.mockClear()
    child.execFileSync.mockReset()
    vi.mocked(app.setLoginItemSettings).mockClear()
  })

  afterEach(() => {
    delete process.env.APP_BUILD_TARGET
  })

  it('On calls enable(), Off calls disable()', async () => {
    const on = await applyLaunchAtLogin(true)
    expect(store.enable).toHaveBeenCalledOnce()
    expect(store.disable).not.toHaveBeenCalled()
    expect(on).toEqual({ enabled: true, blockedByUser: false, ok: true })

    store.enable.mockClear()
    const off = await applyLaunchAtLogin(false)
    expect(store.disable).toHaveBeenCalledOnce()
    expect(store.enable).not.toHaveBeenCalled()
    expect(off).toEqual({ enabled: false, blockedByUser: false, ok: true })
  })

  it('DisabledByUser is reported so the toggle is not treated as a generic failure', async () => {
    store.enable.mockResolvedValue(1)
    const result = await applyLaunchAtLogin(true)
    expect(result).toEqual({ enabled: false, blockedByUser: true, ok: false })
  })

  it('refresh does not overwrite settings while enable is still running', async () => {
    mocks.loadSettings.mockReturnValue({ launchAtLogin: false })
    let release: ((value: number) => void) | undefined
    store.enable.mockImplementation(() => new Promise((resolve) => { release = resolve }))
    const pending = applyLaunchAtLogin(true)
    const mid = await refreshLaunchAtLoginFromOs()
    expect(mocks.saveSettings).not.toHaveBeenCalled()
    expect(mid.launchAtLogin).toBe(false)
    release!(2)
    expect((await pending).ok).toBe(true)
  })

  it('Store enable / disable never writes HKCU Run keys', async () => {
    await applyLaunchAtLogin(true)
    await applyLaunchAtLogin(false)
    expect(child.execFileSync).not.toHaveBeenCalled()
    expect(app.setLoginItemSettings).not.toHaveBeenCalled()
  })

  it('Store startup reconcile never heals via Run keys even when launch-at-login is on', async () => {
    mocks.loadSettings.mockReturnValue({ launchAtLogin: true })
    store.get.mockResolvedValue(2)
    await reconcileLaunchAtLoginOnStartup()
    expect(child.execFileSync).not.toHaveBeenCalled()
    expect(app.setLoginItemSettings).not.toHaveBeenCalled()
    expect(store.enable).not.toHaveBeenCalled()
    expect(store.disable).not.toHaveBeenCalled()
  })
})
