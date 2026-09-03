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
  saveSettings: vi.fn((patch: Record<string, unknown>) => ({ launchAtLogin: true, ...patch })),
  execFileSync: vi.fn()
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

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execFileSync: (...args: unknown[]) => mocks.execFileSync(...args)
  }
})

import {
  applyLaunchAtLogin,
  formatGithubRunCommand,
  normalizeLoginPath,
  reconcileLaunchAtLoginOnStartup
} from '../electron/main/loginItems'
import { syncLoginItemSettings } from '../electron/main/ipc'

/** How Windows parses an unquoted HKCU Run value (CreateProcess command line). */
function parseWindowsRunCommand(cmd: string): { exe: string; args: string[] } {
  const t = cmd.trim()
  if (t.startsWith('"')) {
    const end = t.indexOf('"', 1)
    if (end < 0) return { exe: t.slice(1), args: [] }
    const rest = t.slice(end + 1).trim()
    return { exe: t.slice(1, end), args: rest ? rest.split(/\s+/) : [] }
  }
  const space = t.indexOf(' ')
  if (space < 0) return { exe: t, args: [] }
  return { exe: t.slice(0, space), args: t.slice(space + 1).split(/\s+/) }
}

describe('GitHub exe launch-at-login (orphan Run keys)', () => {
  beforeEach(() => {
    delete process.env.APP_BUILD_TARGET
    mocks.isPackaged = true
    mocks.setLoginItemSettings.mockReset()
    mocks.execFileSync.mockReset()
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

  it('enable: writes Edge-Drop on without disabling it first, and only clears other leftover names', async () => {
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [
        { name: 'Edge-Drop', path: mocks.exePath, enabled: true, args: ['--hidden'] }
      ],
      executableWillLaunchAtLogin: true
    })
    const result = await applyLaunchAtLogin(true)
    expect(result.ok).toBe(true)
    expect(result.enabled).toBe(true)
    expect(mocks.setLoginItemSettings).not.toHaveBeenCalledWith({
      openAtLogin: false,
      path: mocks.exePath,
      name: 'Edge-Drop'
    })
    expect(mocks.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: false,
      path: mocks.exePath,
      name: 'com.edgedrop.app'
    })
    expect(mocks.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: false,
      path: mocks.exePath,
      name: 'electron.app.Edge-Drop'
    })
    expect(mocks.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      path: mocks.exePath,
      args: ['--hidden'],
      name: 'Edge-Drop',
      enabled: true
    })
    if (process.platform === 'win32') {
      expect(mocks.execFileSync).toHaveBeenCalledWith(
        'reg',
        expect.arrayContaining([
          'add',
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
          '/v',
          'Edge-Drop',
          '/d',
          `"${mocks.exePath}" --hidden`
        ]),
        expect.anything()
      )
    }
  })

  it('quotes the Run-key exe path so usernames with spaces still launch', () => {
    const spaced = 'C:\\Users\\Renato Souza\\AppData\\Local\\Programs\\Edge-Drop\\Edge-Drop.exe'
    expect(formatGithubRunCommand(spaced)).toBe(
      '"C:\\Users\\Renato Souza\\AppData\\Local\\Programs\\Edge-Drop\\Edge-Drop.exe" --hidden'
    )
    expect(formatGithubRunCommand(`"${spaced}"`)).toBe(
      '"C:\\Users\\Renato Souza\\AppData\\Local\\Programs\\Edge-Drop\\Edge-Drop.exe" --hidden'
    )
  })

  it('enable: does not fail the toggle when read-back is empty after writing', async () => {
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [],
      executableWillLaunchAtLogin: false
    })
    const result = await applyLaunchAtLogin(true)
    expect(result.ok).toBe(true)
    expect(result.enabled).toBe(true)
    expect(mocks.setLoginItemSettings).toHaveBeenCalledWith(expect.objectContaining({
      openAtLogin: true,
      name: 'Edge-Drop',
      enabled: true
    }))
  })

  it('enable: Windows Startup apps Off is blocked, not treated as success', async () => {
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [
        { name: 'Edge-Drop', path: mocks.exePath, enabled: false, args: ['--hidden'] }
      ],
      executableWillLaunchAtLogin: false
    })
    const result = await applyLaunchAtLogin(true)
    expect(result.enabled).toBe(false)
    expect(result.blockedByUser).toBe(true)
    expect(result.ok).toBe(false)
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

describe('GitHub Run-key quoting and update heal', () => {
  const spacedExe = 'C:\\Users\\Renato Souza\\AppData\\Local\\Programs\\Edge-Drop\\Edge-Drop.exe'
  const plainExe = 'C:\\Users\\yadav\\AppData\\Local\\Programs\\Edge-Drop\\Edge-Drop.exe'
  const programFilesExe = 'C:\\Program Files\\Edge-Drop\\Edge-Drop.exe'
  const quotedSpaced = `"${spacedExe}" --hidden`

  beforeEach(() => {
    delete process.env.APP_BUILD_TARGET
    mocks.isPackaged = true
    mocks.exePath = plainExe
    mocks.setLoginItemSettings.mockReset()
    mocks.execFileSync.mockReset()
    mocks.saveSettings.mockClear()
    mocks.getLoginItemSettings.mockReset()
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [{ name: 'Edge-Drop', path: mocks.exePath, enabled: true, args: ['--hidden'] }],
      executableWillLaunchAtLogin: true
    })
    mocks.loadSettings.mockReturnValue({ launchAtLogin: true })
  })

  afterEach(() => {
    delete process.env.APP_BUILD_TARGET
    mocks.exePath = plainExe
  })

  it('formatGithubRunCommand quotes the exe and leaves --hidden outside quotes', () => {
    expect(formatGithubRunCommand(spacedExe)).toBe(quotedSpaced)
    expect(formatGithubRunCommand(`"${spacedExe}"`)).toBe(quotedSpaced)
    expect(formatGithubRunCommand(`  ${spacedExe}  `)).toBe(quotedSpaced)
    expect(formatGithubRunCommand(plainExe)).toBe(`"${plainExe}" --hidden`)
    expect(formatGithubRunCommand(programFilesExe)).toBe(`"${programFilesExe}" --hidden`)
  })

  it('the 0.3.0 unquoted command splits at the first space; the quoted command does not', () => {
    const broken = `${spacedExe} --hidden`
    const brokenParse = parseWindowsRunCommand(broken)
    expect(brokenParse.exe).toBe('C:\\Users\\Renato')
    expect(brokenParse.args[0]).toBe('Souza\\AppData\\Local\\Programs\\Edge-Drop\\Edge-Drop.exe')

    const fixedParse = parseWindowsRunCommand(formatGithubRunCommand(spacedExe))
    expect(fixedParse.exe).toBe(spacedExe)
    expect(fixedParse.args).toEqual(['--hidden'])

    const programFilesParse = parseWindowsRunCommand(formatGithubRunCommand(programFilesExe))
    expect(programFilesParse.exe).toBe(programFilesExe)
    expect(programFilesParse.args).toEqual(['--hidden'])
  })

  it('normalizeLoginPath still matches our exe after the Run value is quoted', () => {
    expect(normalizeLoginPath(quotedSpaced)).toBe(normalizeLoginPath(spacedExe))
    expect(normalizeLoginPath(`${spacedExe} --hidden`)).toBe(normalizeLoginPath(spacedExe))
  })

  it('enable with a spaced username writes the quoted command via reg add, not a shell string', async () => {
    mocks.exePath = spacedExe
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [{ name: 'Edge-Drop', path: spacedExe, enabled: true, args: ['--hidden'] }],
      executableWillLaunchAtLogin: true
    })
    const result = await applyLaunchAtLogin(true)
    expect(result.ok).toBe(true)
    expect(result.enabled).toBe(true)

    if (process.platform === 'win32') {
      expect(mocks.execFileSync).toHaveBeenCalledTimes(1)
      const [bin, argv, opts] = mocks.execFileSync.mock.calls[0]
      expect(bin).toBe('reg')
      expect(argv).toEqual([
        'add',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        '/v',
        'Edge-Drop',
        '/t',
        'REG_SZ',
        '/d',
        quotedSpaced,
        '/f'
      ])
      expect(opts).toMatchObject({ windowsHide: true, stdio: 'ignore' })
    }
  })

  it('disable does not write a Run command — it only turns the login item off', async () => {
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [{ name: 'Edge-Drop', path: mocks.exePath, enabled: false, args: ['--hidden'] }],
      executableWillLaunchAtLogin: false
    })
    await applyLaunchAtLogin(false)
    expect(mocks.execFileSync).not.toHaveBeenCalled()
    expect(mocks.setLoginItemSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ openAtLogin: true })
    )
  })

  it('update heal: first launch of a fixed build rewrites the quoted Run key while launch-at-login is still on', async () => {
    mocks.exePath = spacedExe
    mocks.loadSettings.mockReturnValue({ launchAtLogin: true })
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [{ name: 'Edge-Drop', path: spacedExe, enabled: true, args: ['--hidden'] }],
      executableWillLaunchAtLogin: true
    })

    const next = await reconcileLaunchAtLoginOnStartup()

    expect(next.launchAtLogin).toBe(true)
    expect(mocks.saveSettings).not.toHaveBeenCalled()
    expect(mocks.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      path: spacedExe,
      args: ['--hidden'],
      name: 'Edge-Drop',
      enabled: true
    })
    if (process.platform === 'win32') {
      expect(mocks.execFileSync).toHaveBeenCalledWith(
        'reg',
        expect.arrayContaining(['/v', 'Edge-Drop', '/d', quotedSpaced, '/f']),
        expect.anything()
      )
    }
  })

  it('update heal: Task Manager / settings already off is not re-enabled', async () => {
    mocks.loadSettings.mockReturnValue({ launchAtLogin: true })
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [{ name: 'Edge-Drop', path: mocks.exePath, enabled: false }],
      executableWillLaunchAtLogin: false
    })

    const next = await reconcileLaunchAtLoginOnStartup()

    expect(mocks.saveSettings).toHaveBeenCalledWith({ launchAtLogin: false })
    expect(next.launchAtLogin).toBe(false)
    expect(mocks.execFileSync).not.toHaveBeenCalled()
    expect(mocks.setLoginItemSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ openAtLogin: true })
    )
  })

  it('update heal: settings off does not rewrite a quoted Run key', async () => {
    mocks.loadSettings.mockReturnValue({ launchAtLogin: false })
    mocks.getLoginItemSettings
      .mockReturnValueOnce({
        launchItems: [{ name: 'Edge-Drop', path: mocks.exePath, enabled: true }],
        executableWillLaunchAtLogin: true
      })
      .mockReturnValue({
        launchItems: [],
        executableWillLaunchAtLogin: false
      })

    await reconcileLaunchAtLoginOnStartup()

    expect(mocks.execFileSync).not.toHaveBeenCalled()
    expect(mocks.setLoginItemSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ openAtLogin: true })
    )
  })

  it('unpackaged / dev never writes a Run key on startup reconcile', async () => {
    mocks.isPackaged = false
    await reconcileLaunchAtLoginOnStartup()
    expect(mocks.setLoginItemSettings).not.toHaveBeenCalled()
    expect(mocks.execFileSync).not.toHaveBeenCalled()
  })
})
