/**
 * Store launch-at-login: the same three calls as electron-winstore-auto-launch
 * (getStatus / enable / disable).
 *
 * That npm package cannot run on Electron 34 — its NodeRT native addon will not
 * compile (`/std:c++20` vs `/ZW`). These methods call the identical WinRT API
 * (StartupTask.GetAsync / RequestEnableAsync / Disable) from a tiny in-package
 * helper that has AppX identity. No registry writes. No PowerShell.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import { STORE_STARTUP_TASK_ID } from './config'

const execFileAsync = promisify(execFile)

export const StartupTaskState = {
  Disabled: 0,
  DisabledByUser: 1,
  Enabled: 2,
  DisabledByPolicy: 3,
  EnabledByPolicy: 4
} as const

export function resolveStartupHelperPath(): string | null {
  const candidates: string[] = []
  if (typeof process.resourcesPath === 'string' && process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'startup', 'EdgeDropStartup.exe'))
  }
  try {
    const appPath = app.getAppPath()
    candidates.push(join(appPath, '..', 'startup', 'EdgeDropStartup.exe'))
    candidates.push(join(appPath, 'resources', 'startup', 'EdgeDropStartup.exe'))
  } catch {
    /* tests / app not ready */
  }
  candidates.push(join(process.cwd(), 'resources', 'startup', 'EdgeDropStartup.exe'))
  return candidates.find((path) => path && existsSync(path)) ?? null
}

function parseState(stdout: string): number | null {
  const match = String(stdout).trim().match(/^(\d+)\s*$/m)
  if (!match) return null
  const state = Number(match[1])
  return Number.isInteger(state) ? state : null
}

async function run(action: 'get' | 'enable' | 'disable'): Promise<number | null> {
  const exe = resolveStartupHelperPath()
  if (!exe) {
    console.error('[StoreStartup] helper missing')
    return null
  }
  try {
    const result = await execFileAsync(exe, [action, STORE_STARTUP_TASK_ID], {
      encoding: 'utf8',
      timeout: 20000,
      windowsHide: true,
      cwd: process.env.TEMP || process.cwd()
    })
    const stdout = typeof result === 'string' ? result : String((result as { stdout?: string }).stdout ?? '')
    return parseState(stdout)
  } catch (err) {
    console.error('[StoreStartup] helper failed:', err)
    return null
  }
}

export async function getStatus(): Promise<number | null> {
  return run('get')
}

export async function enable(): Promise<number | null> {
  return run('enable')
}

export async function disable(): Promise<number | null> {
  return run('disable')
}

export { parseState as parseStartupHelperState }
