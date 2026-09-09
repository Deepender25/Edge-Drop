import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const describeWindows = process.platform === 'win32' ? describe : describe.skip

const mocks = vi.hoisted(() => ({
  isPackaged: true,
  exePath: 'C:\\Users\\Test User\\AppData\\Local\\Programs\\Edge-Drop\\Edge-Drop.exe',
  launchItems: [] as Array<{ name: string; path: string; enabled: boolean; args?: string[] }>,
  executableWillLaunchAtLogin: false,
  settings: { launchAtLogin: true } as Record<string, unknown>,
  setLoginItemSettings: vi.fn(),
  execFileSync: vi.fn(),
  storeGet: vi.fn(async () => 2 as number | null),
  storeEnable: vi.fn(async () => 2 as number | null),
  storeDisable: vi.fn(async () => 0 as number | null),
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mocks.isPackaged
    },
    getPath: (name: string) => (name === 'exe' ? mocks.exePath : 'C:\\mock\\userData'),
    getAppPath: () => 'C:\\mock\\app',
    setLoginItemSettings: (...args: unknown[]) => mocks.setLoginItemSettings(...args),
    getLoginItemSettings: (...args: unknown[]) => ({
      launchItems: mocks.launchItems,
      executableWillLaunchAtLogin: mocks.executableWillLaunchAtLogin,
      wasOpenedAtLogin: false,
      wasOpenedAsHidden: false,
    }),
    getVersion: () => '0.3.1',
  },
}))

vi.mock('../electron/store/settings', () => ({
  loadSettings: () => ({ ...mocks.settings }),
  saveSettings: (patch: Record<string, unknown>) => {
    mocks.settings = { ...mocks.settings, ...patch }
    return { ...mocks.settings }
  },
}))

vi.mock('../electron/main/storeStartup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../electron/main/storeStartup')>()
  return {
    ...actual,
    getStatus: () => mocks.storeGet(),
    enable: () => mocks.storeEnable(),
    disable: () => mocks.storeDisable(),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execFileSync: (...args: unknown[]) => mocks.execFileSync(...args) }
})

import {
  applyLaunchAtLogin,
  deleteRawGithubRunValue,
  formatGithubRunCommand,
  getRawGithubRunCommand,
  isGithubRunKeyHealthy,
  isRunValueHealthy,
  reconcileLaunchAtLoginOnStartup,
} from '../electron/main/loginItems'
import { isStoreBuild, shouldStartHidden, wasLaunchedAtLogin } from '../electron/main/config'
import { parseStartupHelperState } from '../electron/main/storeStartup'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function regQueryOutput(value: string): string {
  return `\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n    Edge-Drop    REG_SZ    ${value}\r\n`
}

describe('GitHub Run-key health (quoted, current path, --hidden)', () => {
  const exe = 'C:\\Users\\Test User\\AppData\\Local\\Programs\\Edge-Drop\\Edge-Drop.exe'
  const want = `"${exe}" --hidden`

  it('healthy only for exact quoted command', () => {
    expect(isRunValueHealthy(want, exe)).toBe(true)
    expect(isRunValueHealthy(want.toLowerCase(), exe)).toBe(true)
    expect(isRunValueHealthy(null, exe)).toBe(false)
    expect(isRunValueHealthy('', exe)).toBe(false)
  })

  it('unhealthy for 0.3.0 unquoted regression', () => {
    expect(isRunValueHealthy(`${exe} --hidden`, exe)).toBe(false)
  })

  it('unhealthy for stale path after update/reinstall', () => {
    const stale = `"C:\\Users\\Test User\\AppData\\Local\\Programs\\Edge-Drop-old\\Edge-Drop.exe" --hidden`
    expect(isRunValueHealthy(stale, exe)).toBe(false)
  })

  it('unhealthy when --hidden flag missing', () => {
    expect(isRunValueHealthy(`"${exe}"`, exe)).toBe(false)
  })

  it('formatGithubRunCommand always quotes and appends --hidden', () => {
    expect(formatGithubRunCommand(exe)).toBe(want)
    expect(formatGithubRunCommand(`"${exe}"`)).toBe(want)
    expect(formatGithubRunCommand(`  ${exe}  `)).toBe(want)
  })
})

describeWindows('raw registry read (reg query)', () => {
  beforeEach(() => {
    delete process.env.APP_BUILD_TARGET
    mocks.isPackaged = true
    mocks.execFileSync.mockReset()
  })
  afterEach(() => {
    delete process.env.APP_BUILD_TARGET
  })

  it('parses REG_SZ value from reg query output', () => {
    const want = formatGithubRunCommand(mocks.exePath)
    mocks.execFileSync.mockReturnValue(regQueryOutput(want))
    expect(getRawGithubRunCommand('Edge-Drop')).toBe(want)
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      'reg',
      expect.arrayContaining(['query', expect.stringContaining('Run'), '/v', 'Edge-Drop']),
      expect.objectContaining({ windowsHide: true })
    )
  })

  it('returns null when value missing (reg throws)', () => {
    mocks.execFileSync.mockImplementation(() => {
      throw new Error('ERROR: The system was unable to find the specified registry key or value.')
    })
    expect(getRawGithubRunCommand('Edge-Drop')).toBeNull()
  })

  it('isGithubRunKeyHealthy reflects on-disk truth', () => {
    mocks.execFileSync.mockReturnValue(regQueryOutput(formatGithubRunCommand(mocks.exePath)))
    expect(isGithubRunKeyHealthy(mocks.exePath)).toBe(true)
    mocks.execFileSync.mockReturnValue(regQueryOutput(`${mocks.exePath} --hidden`))
    expect(isGithubRunKeyHealthy(mocks.exePath)).toBe(false)
  })

  it('deleteRawGithubRunValue uses reg delete', () => {
    mocks.execFileSync.mockReturnValue('')
    deleteRawGithubRunValue('Edge-Drop')
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      'reg',
      expect.arrayContaining(['delete', expect.stringContaining('Run'), '/v', 'Edge-Drop', '/f']),
      expect.anything()
    )
  })
})

describeWindows('reconcile never silently loses ON after update', () => {
  beforeEach(() => {
    delete process.env.APP_BUILD_TARGET
    mocks.isPackaged = true
    mocks.setLoginItemSettings.mockReset()
    mocks.execFileSync.mockReset()
    mocks.launchItems = []
    mocks.executableWillLaunchAtLogin = false
    mocks.settings = { launchAtLogin: true }
  })
  afterEach(() => {
    delete process.env.APP_BUILD_TARGET
  })

  it('settings ON + OS missing (not blocked) → heals and preserves ON', async () => {
    mocks.launchItems = []
    mocks.executableWillLaunchAtLogin = false
    // reg query finds nothing → heal path
    mocks.execFileSync.mockImplementation((bin: string, args: string[]) => {
      if ((args as string[])[0] === 'query') throw new Error('not found')
      return ''
    })
    const next = await reconcileLaunchAtLoginOnStartup()
    expect(next.launchAtLogin).toBe(true)
    expect(mocks.setLoginItemSettings).toHaveBeenCalledWith(
      expect.objectContaining({ openAtLogin: true, name: 'Edge-Drop' })
    )
  })

  it('settings ON + explicitly blocked in Task Manager → reflects OFF (OS wins)', async () => {
    mocks.launchItems = [{ name: 'Edge-Drop', path: mocks.exePath, enabled: false }]
    mocks.executableWillLaunchAtLogin = false
    mocks.execFileSync.mockImplementation(() => {
      throw new Error('not found')
    })
    const next = await reconcileLaunchAtLoginOnStartup()
    expect(next.launchAtLogin).toBe(false)
  })

  it('settings OFF + leftover ON → disables without re-enabling', async () => {
    mocks.settings = { launchAtLogin: false }
    mocks.launchItems = [{ name: 'Edge-Drop', path: mocks.exePath, enabled: true }]
    mocks.executableWillLaunchAtLogin = true
    mocks.execFileSync.mockImplementation((bin: string, args: string[]) => {
      if ((args as string[])[0] === 'query') throw new Error('not found')
      return ''
    })
    await reconcileLaunchAtLoginOnStartup()
    expect(mocks.setLoginItemSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ openAtLogin: true })
    )
  })

  it('unquoted 0.3.0 value gets healed to quoted form on next launch', async () => {
    mocks.settings = { launchAtLogin: true }
    mocks.launchItems = [{ name: 'Edge-Drop', path: mocks.exePath, enabled: true, args: ['--hidden'] }]
    mocks.executableWillLaunchAtLogin = true
    const unquoted = `${mocks.exePath} --hidden`
    mocks.execFileSync.mockImplementation((bin: string, args: string[]) => {
      const verb = (args as string[])[0]
      if (verb === 'query') return regQueryOutput(unquoted)
      return ''
    })
    await reconcileLaunchAtLoginOnStartup()
    const addCalls = mocks.execFileSync.mock.calls.filter(
      (c) => ((c[1] as unknown) as string[])[0] === 'add'
    )
    expect(addCalls.length).toBeGreaterThanOrEqual(1)
  })
})

describeWindows('Store detection is redundant (env + package + path)', () => {
  beforeEach(() => {
    delete process.env.APP_BUILD_TARGET
    delete (process as unknown as { windowsStore?: boolean }).windowsStore
    mocks.isPackaged = false
  })
  afterEach(() => {
    delete process.env.APP_BUILD_TARGET
    delete (process as unknown as { windowsStore?: boolean }).windowsStore
    mocks.isPackaged = false
  })

  it('still false for plain dev/GitHub', () => {
    mocks.exePath = 'C:\\Users\\Test\\AppData\\Local\\Programs\\Edge-Drop\\Edge-Drop.exe'
    expect(isStoreBuild()).toBe(false)
  })

  it('true for WindowsApps install path even without env stamp', () => {
    mocks.isPackaged = true
    mocks.exePath =
      'C:\\Program Files\\WindowsApps\\Deepender.EdgeDrop_0.3.1.0_x64__abc\\app\\Edge-Drop.exe'
    expect(isStoreBuild()).toBe(true)
  })

  it('Store apply never touches HKCU Run keys', async () => {
    process.env.APP_BUILD_TARGET = 'store'
    mocks.isPackaged = true
    mocks.execFileSync.mockReset()
    mocks.storeEnable.mockClear()
    await applyLaunchAtLogin(true)
    expect(mocks.storeEnable).toHaveBeenCalled()
    const regCalls = mocks.execFileSync.mock.calls.filter((c) => c[0] === 'reg')
    expect(regCalls).toHaveLength(0)
    delete process.env.APP_BUILD_TARGET
  })
})

describe('hidden login launch', () => {
  const argv = process.argv
  afterEach(() => {
    process.argv = argv
  })

  it('detects --hidden flag', () => {
    process.argv = ['electron.exe', 'app', '--hidden']
    expect(wasLaunchedAtLogin()).toBe(true)
    expect(shouldStartHidden()).toBe(true)
  })

  it('no hidden flag in normal double-click launch', () => {
    process.argv = ['electron.exe', 'app']
    // getLoginItemSettings mock reports wasOpenedAtLogin:false
    expect(shouldStartHidden()).toBe(false)
  })
})

describe('Store helper contract (stdout must be parsable)', () => {
  it('parses numeric state, rejects ERR output (winexe empty-stdout guard)', () => {
    expect(parseStartupHelperState('2\r\n')).toBe(2)
    expect(parseStartupHelperState('0')).toBe(0)
    expect(parseStartupHelperState('')).toBeNull()
    expect(parseStartupHelperState('ERR timeout')).toBeNull()
  })

  it('compile script uses console target so stdout is capturable', () => {
    const ps1 = readFileSync(join(__dirname, '..', 'scripts', 'compile-startup-helper.ps1'), 'utf8')
    expect(ps1).toMatch(/\/target:exe/)
    expect(ps1).not.toMatch(/\/target:winexe/)
  })

  it('C# source documents console-subsystem requirement', () => {
    const cs = readFileSync(join(__dirname, '..', 'resources', 'startup', 'EdgeDropStartup.cs'), 'utf8')
    expect(cs).toMatch(/console-subsystem|target:exe/i)
  })
})
