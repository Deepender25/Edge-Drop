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
import { execFileSync } from 'node:child_process'
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

function readMacLaunchAtLogin(): LaunchAtLoginResult {
  try {
    const settings = app.getLoginItemSettings()
    return {
      enabled: settings.openAtLogin || settings.executableWillLaunchAtLogin,
      blockedByUser: false,
      ok: true
    }
  } catch {
    return { enabled: false, blockedByUser: false, ok: false }
  }
}

function applyMacLaunchAtLogin(wantLaunch: boolean): LaunchAtLoginResult {
  try {
    app.setLoginItemSettings({
      openAtLogin: wantLaunch,
      openAsHidden: true
    })
    const actual = readMacLaunchAtLogin()
    return { ...actual, ok: actual.ok && actual.enabled === wantLaunch }
  } catch (err) {
    console.error('[LoginItems] macOS login-item update failed:', err)
    return { enabled: !wantLaunch, blockedByUser: false, ok: false }
  }
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

/**
 * HKCU Run command. The exe path MUST be quoted so Windows does not split on
 * spaces in the user profile (`C:\Users\Renato Souza\...`). `--hidden` stays
 * outside the quotes. Electron's setLoginItemSettings writes the path bare,
 * which is a 0.3.0 regression vs 0.2.9.
 */
export function formatGithubRunCommand(exePath: string): string {
  const bare = exePath.trim().replace(/^"(.*)"$/, '$1')
  return `"${bare}" --hidden`
}

function writeQuotedGithubRunCommand(exePath: string): boolean {
  if (process.platform !== 'win32') return true
  try {
    execFileSync(
      'reg',
      [
        'add',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        '/v',
        CANONICAL_LOGIN_ITEM_NAME,
        '/t',
        'REG_SZ',
        '/d',
        formatGithubRunCommand(exePath),
        '/f'
      ],
      { windowsHide: true, stdio: 'ignore' }
    )
    return true
  } catch (err) {
    console.error('[LoginItems] Failed to quote Run-key command:', err)
    return false
  }
}

/**
 * Read the raw HKCU Run value for `name` via `reg query`.
 * Returns the command string, or null when missing / unreadable.
 * Best-effort: never throws. Used to detect stale paths, unquoted
 * values from older builds, and missing --hidden flags that the
 * Electron API alone cannot see.
 */
export function getRawGithubRunCommand(name: string): string | null {
  if (process.platform !== 'win32') return null
  try {
    const out = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', name],
      { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ) as unknown as string
    const text = String(out ?? '')
    // Typical output line: `    Edge-Drop    REG_SZ    "C:\...\Edge-Drop.exe" --hidden`
    const m = text.match(/REG_SZ\s+(.+?)\s*$/m)
    if (!m) return null
    const val = (m[1] ?? '').trim()
    return val ? val : null
  } catch {
    return null
  }
}

/** Delete a raw HKCU Run value. Best-effort, returns true when gone. */
export function deleteRawGithubRunValue(name: string): boolean {
  if (process.platform !== 'win32') return true
  try {
    execFileSync(
      'reg',
      ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', name, '/f'],
      { windowsHide: true, stdio: 'ignore' }
    )
    return true
  } catch {
    // Missing value also throws with exit 1 — treat as already gone.
    return getRawGithubRunCommand(name) === null
  }
}

/**
 * Is the on-disk Run command exactly what this install needs?
 * Requires quoted exe path + trailing --hidden pointing at the
 * current executable. Anything else (unquoted 0.3.0 value, stale
 * folder after update/reinstall, missing flag) needs a heal.
 */
export function isRunValueHealthy(raw: string | null, exePath: string): boolean {
  if (!raw) return false
  const want = formatGithubRunCommand(exePath)
  if (raw.trim() === want) return true
  // Tolerate case differences in drive letter, but nothing else.
  return raw.trim().toLowerCase() === want.toLowerCase()
}

/** Check the canonical Run key health for the current install. */
export function isGithubRunKeyHealthy(exePath?: string): boolean {
  try {
    const exe = exePath ?? app.getPath('exe')
    return isRunValueHealthy(getRawGithubRunCommand(CANONICAL_LOGIN_ITEM_NAME), exe)
  } catch {
    return false
  }
}

export const STARTUP_APPROVED_KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'

/**
 * Check whether Windows Task Manager / Windows Settings has disabled this startup item.
 * Windows stores startup item approval in StartupApproved\Run as a REG_BINARY.
 * If the value is missing, the item is approved (enabled).
 * If the value exists, the first byte indicates state:
 * - 0x02: Enabled
 * - 0x03 (or any odd number): Disabled by user
 */
export function isBlockedInStartupApproved(name: string): boolean {
  if (process.platform !== 'win32') return false
  try {
    const out = execFileSync(
      'reg',
      ['query', STARTUP_APPROVED_KEY, '/v', name],
      { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ) as unknown as string
    const m = String(out ?? '').match(/REG_BINARY\s+([0-9a-fA-F]+)/)
    if (!m) return false
    const hex = m[1]
    if (!hex || hex.length < 2) return false
    const firstByte = parseInt(hex.slice(0, 2), 16)
    return firstByte !== 2 && (firstByte & 1) !== 0
  } catch {
    // Missing key or value means Windows defaults to enabled (not blocked).
    return false
  }
}

/**
 * Clear any disabled flag in StartupApproved\Run so Windows allows the item to launch.
 */
export function clearStartupApprovedBlock(name: string): boolean {
  if (process.platform !== 'win32') return true
  try {
    execFileSync(
      'reg',
      ['delete', STARTUP_APPROVED_KEY, '/v', name, '/f'],
      { windowsHide: true, stdio: 'ignore' }
    )
    return true
  } catch {
    return true
  }
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

export function readGithubLaunchAtLogin(): LaunchAtLoginResult {
  const exePath = app.getPath('exe')

  // Windows NSIS / portable builds: Read registry directly as authoritative source.
  // Electron's getLoginItemSettings() fails to match paths containing spaces (e.g. "Renato Souza")
  // and quoted arguments, returning false negatives that cause UI toggles to flap OFF.
  if (process.platform === 'win32') {
    let foundName: string | null = null
    let rawCmd: string | null = null

    for (const name of GITHUB_LOGIN_ITEM_NAMES) {
      const cmd = getRawGithubRunCommand(name)
      if (cmd && isOurLoginExe(cmd, exePath)) {
        foundName = name
        rawCmd = cmd
        break
      }
    }

    if (rawCmd && foundName) {
      if (isBlockedInStartupApproved(foundName)) {
        return { enabled: false, blockedByUser: true, ok: true }
      }
      return { enabled: true, blockedByUser: false, ok: true }
    }
  }

  // Fallback to Electron's getLoginItemSettings:
  // 1) On non-Windows platforms
  // 2) In test environments where `reg` is mocked out or returns null but `getLoginItemSettings` is mocked
  try {
    const seen = app.getLoginItemSettings({
      path: exePath,
      args: ['--hidden']
    })
    const items = seen.launchItems ?? []
    const ours = items.filter((item) => isOurLoginExe(item.path, exePath))
    const anyEnabled = ours.some((item) => item.enabled)
    const enabled = anyEnabled || !!seen.executableWillLaunchAtLogin
    const blockedByUser =
      ours.length > 0 && !anyEnabled && ours.some((item) => !item.enabled) && !seen.executableWillLaunchAtLogin
    return {
      enabled,
      blockedByUser,
      ok: true
    }
  } catch {
    return { enabled: false, blockedByUser: false, ok: false }
  }
}

export function applyGithubLaunchAtLogin(wantLaunch: boolean): LaunchAtLoginResult {
  const exePath = app.getPath('exe')
  const names = collectGithubLoginNames(exePath)

  if (wantLaunch) {
    // Do not disable Edge-Drop before enabling it. That writes Windows
    // StartupApproved as Off and the in-app toggle then fails after upgrades.
    for (const name of names) {
      if (name === CANONICAL_LOGIN_ITEM_NAME) continue
      try {
        app.setLoginItemSettings({
          openAtLogin: false,
          path: exePath,
          name
        })
      } catch {
        /* best-effort orphan cleanup */
      }
      // Remove stale raw values pointing at old install folders so Task
      // Manager never shows ghost duplicates after an update/reinstall.
      try {
        const raw = getRawGithubRunCommand(name)
        if (raw !== null && !isRunValueHealthy(raw, exePath)) {
          deleteRawGithubRunValue(name)
          clearStartupApprovedBlock(name)
        }
      } catch {
        /* ignore */
      }
    }

    // Clear any previous disable block in Windows StartupApproved for Edge-Drop
    clearStartupApprovedBlock(CANONICAL_LOGIN_ITEM_NAME)

    try {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: exePath,
        args: ['--hidden'],
        name: CANONICAL_LOGIN_ITEM_NAME,
        enabled: true
      })
    } catch (err) {
      console.error('[LoginItems] setLoginItemSettings enable failed:', err)
    }

    // Electron writes an unquoted path. Re-write quoted so usernames with
    // spaces launch. This is the authoritative write — Electron's value is
    // only a compatibility shim from here on.
    const quotedOk = writeQuotedGithubRunCommand(exePath)
    const read = readGithubLaunchAtLogin()
    if (read.blockedByUser) return { ...read, ok: false }

    // Verify the on-disk value is actually healthy. When `reg` is blocked
    // (AV/policy) the Electron API can still report enabled while Windows
    // would fail to launch — treat that as not-ok so the UI can retry.
    try {
      if (!isGithubRunKeyHealthy(exePath)) {
        const raw = getRawGithubRunCommand(CANONICAL_LOGIN_ITEM_NAME)
        if (raw !== null && !isRunValueHealthy(raw, exePath)) {
          return { enabled: false, blockedByUser: false, ok: false }
        }
        if (!quotedOk) {
          return { enabled: false, blockedByUser: false, ok: false }
        }
      }
    } catch {
      /* best-effort verification only */
    }
    return { enabled: true, blockedByUser: false, ok: true }
  }

  for (const name of names) {
    try {
      app.setLoginItemSettings({
        openAtLogin: false,
        path: exePath,
        name
      })
    } catch {
      /* ignore */
    }
    try {
      deleteRawGithubRunValue(name)
      clearStartupApprovedBlock(name)
    } catch {
      /* ignore */
    }
  }
  // Ensure the canonical raw value is gone so a later enable starts clean
  // and Task Manager never lists a disabled ghost. Best-effort only.
  try {
    deleteRawGithubRunValue(CANONICAL_LOGIN_ITEM_NAME)
    clearStartupApprovedBlock(CANONICAL_LOGIN_ITEM_NAME)
  } catch {
    /* ignore */
  }
  return readGithubLaunchAtLogin()
}

export async function readLaunchAtLogin(): Promise<LaunchAtLoginResult> {
  if (!app.isPackaged) {
    return { enabled: loadSettings().launchAtLogin, blockedByUser: false, ok: true }
  }
  if (process.platform === 'darwin') {
    return readMacLaunchAtLogin()
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
    if (process.platform === 'darwin') {
      return applyMacLaunchAtLogin(wantLaunch)
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
  // When the OS query itself failed (helper missing, reg blocked), never
  // flip the user's saved preference — preserve it and try again next launch.
  if (!os.ok) {
    // GitHub: even when the Electron query fails, a healthy raw key means
    // we are actually fine. Heal the quoting/stale path opportunistically.
    if (process.platform === 'win32' && settings.launchAtLogin && !isStoreBuild()) {
      try {
        if (!isGithubRunKeyHealthy()) {
          applyGithubLaunchAtLogin(true)
        }
      } catch {
        /* ignore */
      }
    }
    return settings
  }

  if (settings.launchAtLogin === false && os.enabled) {
    // GitHub recovery check:
    // If user has settings=false, but the Run key exists for Edge-Drop and is NOT blocked by user:
    // This happens when 0.3.1's false-negative poll bug erroneously saved launchAtLogin: false.
    // Self-heal: restore settings to true and ensure key is properly quoted!
    if (process.platform === 'win32' && !isStoreBuild()) {
      const exe = app.getPath('exe')
      const raw = getRawGithubRunCommand(CANONICAL_LOGIN_ITEM_NAME)
      if (raw && isOurLoginExe(raw, exe) && !isBlockedInStartupApproved(CANONICAL_LOGIN_ITEM_NAME)) {
        console.log('[LoginItems] Recovering launchAtLogin from existing active Run key')
        applyGithubLaunchAtLogin(true)
        return saveSettings({ launchAtLogin: true })
      }
    }

    const applied = await applyLaunchAtLogin(false)
    if (applied.enabled !== settings.launchAtLogin) {
      return saveSettings({ launchAtLogin: applied.enabled })
    }
    return settings
  }

  if (settings.launchAtLogin === true && !os.enabled) {
    // User explicitly disabled in Task Manager / Settings → Apps → Startup:
    // OS wins, reflect OFF so the toggle shows reality.
    if (os.blockedByUser) {
      return saveSettings({ launchAtLogin: false })
    }
    // Missing / stale after update, reinstall, or drive change — NOT an
    // explicit disable. Heal by re-applying for the current exe path and
    // preserve ON. Never silently flip ON → OFF here; losing intent is
    // worse than a one-time re-register.
    try {
      const healed = await applyLaunchAtLogin(true)
      if (healed.blockedByUser) {
        return saveSettings({ launchAtLogin: false })
      }
      return settings
    } catch {
      return settings
    }
  }

  if (process.platform === 'win32' && settings.launchAtLogin && os.enabled && !isStoreBuild()) {
    // Self-heal quoting / stale path / missing --hidden on every launch so
    // users updating from 0.3.0 (unquoted) get fixed without touching UI.
    try {
      if (!isGithubRunKeyHealthy()) {
        applyGithubLaunchAtLogin(true)
      }
    } catch {
      /* ignore */
    }
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
