/**
 * Launch-at-login.
 *
 * GitHub NSIS: Electron Run keys. Older builds used different value names, so
 * disable still clears leftover names. Enable must not disable Edge-Drop first
 * — that stamps Windows Startup apps as Off and the toggle then fails.
 *
 * Store / AppX: Windows.ApplicationModel.StartupTask only —
 * getStatus / enable (RequestEnableAsync) / disable. Same API as
 * electron-winstore-auto-launch. Electron setLoginItemSettings is not used.
 */
import { app } from 'electron'
import { isStoreBuild } from './config'
import { loadSettings, saveSettings } from '../store/settings'
import type { Settings } from '../../shared/types'
import { disable, enable, getStatus, StartupTaskState } from './storeStartup'

export { StartupTaskState }

/** Historical + current Run-key names written by this app. */
export const GITHUB_LOGIN_ITEM_NAMES = [
  'Edge-Drop',
  'com.edgedrop.app',
  'electron.app.Edge-Drop'
] as const

export const CANONICAL_LOGIN_ITEM_NAME = 'Edge-Drop'

export interface LaunchAtLoginResult {
  enabled: boolean
  blockedByUser: boolean
  ok: boolean
}

export function normalizeLoginPath(p: string): string {
  let s = p.trim().replace(/\//g, '\\').toLowerCase()
  if (s.startsWith('"')) {
    const end = s.indexOf('"', 1)
    s = end > 0 ? s.slice(1, end) : s.replace(/"/g, '')
  } else {
    const exe = s.indexOf('.exe')
    if (exe >= 0) s = s.slice(0, exe + 4)
  }
  return s
}

export function isOurLoginExe(candidate: string | undefined, exePath: string): boolean {
  if (!candidate) return false
  return normalizeLoginPath(candidate) === normalizeLoginPath(exePath)
}

function resultFromState(state: number | null, wantEnabled?: boolean): LaunchAtLoginResult {
  if (state === null) {
    if (wantEnabled === undefined) {
      return { enabled: loadSettings().launchAtLogin, blockedByUser: false, ok: false }
    }
    return { enabled: !wantEnabled, blockedByUser: false, ok: false }
  }
  const enabled = state === StartupTaskState.Enabled || state === StartupTaskState.EnabledByPolicy
  return {
    enabled,
    blockedByUser: state === StartupTaskState.DisabledByUser || state === StartupTaskState.DisabledByPolicy,
    ok: wantEnabled === undefined ? true : enabled === wantEnabled
  }
}

function collectGithubLoginNames(exePath: string): Set<string> {
  const names = new Set<string>(GITHUB_LOGIN_ITEM_NAMES)
  try {
    const items = app.getLoginItemSettings({ path: exePath }).launchItems ?? []
    for (const item of items) {
      if (item.name && isOurLoginExe(item.path, exePath)) names.add(item.name)
    }
  } catch {
    /* ignore */
  }
  return names
}

function readGithubLaunchAtLogin(): LaunchAtLoginResult {
  const exePath = app.getPath('exe')
  const seen = app.getLoginItemSettings({
    path: exePath,
    args: ['--hidden']
  })
  const items = seen.launchItems ?? []
  const ours = items.filter((item) => isOurLoginExe(item.path, exePath))
  const anyEnabled = ours.some((item) => item.enabled)
  const enabled = anyEnabled || !!seen.executableWillLaunchAtLogin
  return {
    enabled,
    blockedByUser: ours.length > 0 && !anyEnabled && ours.some((item) => !item.enabled) && !seen.executableWillLaunchAtLogin,
    ok: true
  }
}

function applyGithubLaunchAtLogin(wantLaunch: boolean): LaunchAtLoginResult {
  const exePath = app.getPath('exe')
  const names = collectGithubLoginNames(exePath)

  if (wantLaunch) {
    // Do not disable Edge-Drop before enabling it. That writes Windows
    // StartupApproved as Off and the in-app toggle then fails after upgrades.
    for (const name of names) {
      if (name === CANONICAL_LOGIN_ITEM_NAME) continue
      app.setLoginItemSettings({
        openAtLogin: false,
        path: exePath,
        name
      })
    }
    app.setLoginItemSettings({
      openAtLogin: true,
      path: exePath,
      args: ['--hidden'],
      name: CANONICAL_LOGIN_ITEM_NAME,
      enabled: true
    })
    const read = readGithubLaunchAtLogin()
    if (read.blockedByUser) return { ...read, ok: false }
    return { enabled: true, blockedByUser: false, ok: true }
  }

  for (const name of names) {
    app.setLoginItemSettings({
      openAtLogin: false,
      path: exePath,
      name
    })
  }
  return readGithubLaunchAtLogin()
}

export async function readLaunchAtLogin(): Promise<LaunchAtLoginResult> {
  if (!app.isPackaged) {
    return { enabled: loadSettings().launchAtLogin, blockedByUser: false, ok: true }
  }
  if (isStoreBuild()) {
    return resultFromState(await getStatus())
  }
  return readGithubLaunchAtLogin()
}

let appliesInFlight = 0

export async function applyLaunchAtLogin(wantLaunch: boolean): Promise<LaunchAtLoginResult> {
  appliesInFlight++
  try {
    if (!app.isPackaged) {
      return { enabled: wantLaunch, blockedByUser: false, ok: true }
    }
    if (isStoreBuild()) {
      try {
        const state = wantLaunch ? await enable() : await disable()
        return resultFromState(state, wantLaunch)
      } catch (err) {
        console.error('[LoginItems] Store StartupTask update failed:', err)
        return { enabled: !wantLaunch, blockedByUser: false, ok: false }
      }
    }
    try {
      const result = applyGithubLaunchAtLogin(wantLaunch)
      if (wantLaunch) return result
      return { ...result, ok: !result.enabled }
    } catch (err) {
      console.error('[LoginItems] GitHub Run-key update failed:', err)
      return { enabled: !wantLaunch, blockedByUser: false, ok: false }
    }
  } finally {
    appliesInFlight--
  }
}

export async function reconcileLaunchAtLoginOnStartup(): Promise<Settings> {
  const settings = loadSettings()
  if (!app.isPackaged) return settings

  const os = await readLaunchAtLogin()
  if (!os.ok) return settings

  if (settings.launchAtLogin === false && os.enabled) {
    const applied = await applyLaunchAtLogin(false)
    if (applied.enabled !== settings.launchAtLogin) {
      return saveSettings({ launchAtLogin: applied.enabled })
    }
    return settings
  }

  if (settings.launchAtLogin === true && !os.enabled) {
    return saveSettings({ launchAtLogin: false })
  }

  if (settings.launchAtLogin && os.enabled && !isStoreBuild()) {
    applyGithubLaunchAtLogin(true)
  }

  return loadSettings()
}

export async function refreshLaunchAtLoginFromOs(): Promise<Settings> {
  if (appliesInFlight > 0) return loadSettings()
  const os = await readLaunchAtLogin()
  if (!os.ok) return loadSettings()
  if (os.enabled !== loadSettings().launchAtLogin) {
    return saveSettings({ launchAtLogin: os.enabled })
  }
  return loadSettings()
}
