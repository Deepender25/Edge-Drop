import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const describeWindows = process.platform === 'win32' ? describe : describe.skip

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
    getVersion: () => '0.3.1',
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
  clearStartupApprovedBlock,
  formatGithubRunCommand,
  isBlockedInStartupApproved,
  normalizeLoginPath,
  readGithubLaunchAtLogin,
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

describeWindows('GitHub exe launch-at-login (orphan Run keys)', () => {
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

describeWindows('GitHub Run-key quoting and update heal', () => {
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
      // Enable performs health-check `reg query` calls plus the authoritative
      // `reg add`. Assert the authoritative write happened with exact quoting.
      const addCalls = mocks.execFileSync.mock.calls.filter((c) => (c[1] as string[])[0] === 'add')
      expect(addCalls.length).toBeGreaterThanOrEqual(1)
      const [, argv, opts] = addCalls[0] as unknown as [string, string[], Record<string, unknown>]
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
      // All reg invocations must be hidden, never via shell string.
      for (const [bin] of mocks.execFileSync.mock.calls) {
        expect(bin).toBe('reg')
      }
    }
  })

  it('disable removes the raw Run value (reg delete) and never re-adds it', async () => {
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [{ name: 'Edge-Drop', path: mocks.exePath, enabled: false, args: ['--hidden'] }],
      executableWillLaunchAtLogin: false
    })
    await applyLaunchAtLogin(false)
    if (process.platform === 'win32') {
      const calls = mocks.execFileSync.mock.calls.map((c) => (c[1] as string[])[0])
      expect(calls).toContain('delete')
      expect(calls).not.toContain('add')
    } else {
      expect(mocks.execFileSync).not.toHaveBeenCalled()
    }
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
    const addCalls = mocks.execFileSync.mock.calls.filter(
      (c) => ((c[1] as unknown) as string[])[0] === 'add'
    )
    expect(addCalls).toHaveLength(0)
    expect(mocks.setLoginItemSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ openAtLogin: true })
    )
  })

  it('update heal: settings off cleans the leftover key but never re-enables', async () => {
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

    if (process.platform === 'win32') {
      const verbs = mocks.execFileSync.mock.calls.map((c) => (c[1] as string[])[0])
      // Disable path must delete the raw value so no ghost remains...
      expect(verbs).toContain('delete')
      // ...but must never re-add / re-enable.
      expect(verbs).not.toContain('add')
    } else {
      expect(mocks.execFileSync).not.toHaveBeenCalled()
    }
    expect(mocks.setLoginItemSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ openAtLogin: true })
    )
  })

  it('readGithubLaunchAtLogin reads spaced paths directly from registry even if Electron API fails', () => {
    mocks.exePath = spacedExe
    // Simulate Electron returning false negative for spaced path
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [],
      executableWillLaunchAtLogin: false
    })
    // Simulate reg query returning healthy quoted command
    mocks.execFileSync.mockImplementation((bin: string, args: string[]) => {
      if (bin === 'reg' && (args as string[])[0] === 'query') {
        if ((args as string[])[1].includes('Run') && (args as string[])[3] === 'Edge-Drop') {
          return `\r\n    Edge-Drop    REG_SZ    "${spacedExe}" --hidden\r\n`
        }
      }
      throw new Error('not found')
    })

    const res = readGithubLaunchAtLogin()
    expect(res.enabled).toBe(true)
    expect(res.blockedByUser).toBe(false)
    expect(res.ok).toBe(true)
  })

  it('0.3.1 bug recovery: restores launchAtLogin: true when unblocked Run key exists', async () => {
    mocks.exePath = spacedExe
    mocks.loadSettings.mockReturnValue({ launchAtLogin: false })
    mocks.getLoginItemSettings.mockReturnValue({
      launchItems: [],
      executableWillLaunchAtLogin: false
    })
    // Simulate reg query finding the Run key
    mocks.execFileSync.mockImplementation((bin: string, args: string[]) => {
      if (bin === 'reg') {
        const verb = (args as string[])[0]
        if (verb === 'query') {
          if ((args as string[])[1].includes('StartupApproved')) {
            throw new Error('not found') // Not blocked
          }
          if ((args as string[])[1].includes('Run') && (args as string[])[3] === 'Edge-Drop') {
            return `\r\n    Edge-Drop    REG_SZ    "${spacedExe}" --hidden\r\n`
          }
        }
      }
      return ''
    })

    const next = await reconcileLaunchAtLoginOnStartup()
    expect(mocks.saveSettings).toHaveBeenCalledWith({ launchAtLogin: true })
    expect(next.launchAtLogin).toBe(true)
  })

  it('StartupApproved block detection and unblocking', () => {
    // 1. Blocked when odd byte
    mocks.execFileSync.mockReturnValueOnce('\r\n    Edge-Drop    REG_BINARY    0300000053FD31D3D585DA01\r\n')
    expect(isBlockedInStartupApproved('Edge-Drop')).toBe(true)

    // 2. Unblocked when 02
    mocks.execFileSync.mockReturnValueOnce('\r\n    Edge-Drop    REG_BINARY    0200000053FD31D3D585DA01\r\n')
    expect(isBlockedInStartupApproved('Edge-Drop')).toBe(false)

    // 3. Clear block issues reg delete
    clearStartupApprovedBlock('Edge-Drop')
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      'reg',
      expect.arrayContaining(['delete', expect.stringContaining('StartupApproved'), '/v', 'Edge-Drop', '/f']),
      expect.anything()
    )
  })

  it('unpackaged / dev never writes a Run key on startup reconcile', async () => {
    mocks.isPackaged = false
    await reconcileLaunchAtLoginOnStartup()
    expect(mocks.setLoginItemSettings).not.toHaveBeenCalled()
    expect(mocks.execFileSync).not.toHaveBeenCalled()
  })
})
