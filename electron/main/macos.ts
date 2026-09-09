import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function helperPath(): string | null {
  if (process.platform !== 'darwin') return null
  const candidate = app.isPackaged
    ? join(process.resourcesPath, 'macos', 'EdgeDropMacHelper')
    : join(app.getAppPath(), 'resources', 'macos', 'bin', 'EdgeDropMacHelper')
  return existsSync(candidate) ? candidate : null
}

async function runHelper(args: string[], timeout = 3000): Promise<string> {
  const helper = helperPath()
  if (!helper) throw new Error('macOS helper is not built')
  const { stdout } = await execFileAsync(helper, args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 1024 * 1024
  })
  return stdout
}

export async function readMacClipboardFiles(): Promise<string[] | null> {
  if (process.platform !== 'darwin') return null
  try {
    const raw = await runHelper(['read-files'])
    const value: unknown = JSON.parse(raw || '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : null
  } catch (err) {
    console.error('[macOS] Failed to read pasteboard file URLs:', err)
    return null
  }
}

export async function writeMacClipboardFiles(paths: string[]): Promise<boolean> {
  if (process.platform !== 'darwin' || paths.length === 0) return false
  try {
    await runHelper(['write-files', ...paths])
    return true
  } catch (err) {
    console.error('[macOS] Failed to write pasteboard file URLs:', err)
    return false
  }
}

export async function writeMacClipboardImage(imagePath: string, filePaths: string[] = []): Promise<boolean> {
  if (process.platform !== 'darwin') return false
  try {
    await runHelper(['write-image', imagePath, ...filePaths])
    return true
  } catch (err) {
    console.error('[macOS] Failed to write pasteboard image:', err)
    return false
  }
}

export async function simulateMacPaste(): Promise<boolean> {
  if (process.platform !== 'darwin') return false
  try {
    await runHelper(['paste'], 5000)
    return true
  } catch (err) {
    console.error('[macOS] Command+V simulation failed:', err)
    return false
  }
}

export async function isMacFullscreenAppActive(): Promise<boolean> {
  if (process.platform !== 'darwin') return false
  try {
    return (await runHelper(['frontmost-fullscreen'], 1500)).trim() === '1'
  } catch (err) {
    console.error('[macOS] Fullscreen detection failed:', err)
    return false
  }
}
