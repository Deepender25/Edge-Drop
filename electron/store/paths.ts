/**
 * Centralized filesystem locations for persisted state.
 *
 * Everything lives under the OS userData directory so the app is fully portable
 * and self-cleaning. Image files are kept in their own folder so the JSON index
 * stays small and fast to read/write.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { extname, join, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { app } from 'electron'
import { isStoreBuild } from '../main/config'

const root = () => app.getPath('userData')

export const PATHS = {
  /** userData root. */
  root,
  /** Directory holding text payloads for large text entries. */
  payloadsDir: () => join(root(), 'payloads'),
  /** Directory holding one PNG per captured image item. */
  imagesDir: () => join(root(), 'images'),
  /** Path to the items index JSON. */
  indexFile: () => join(root(), 'items.json'),
  /** Path to the settings JSON. */
  settingsFile: () => join(root(), 'settings.json'),
  /** Scratch dir for temp files handed to native drag-out. */
  tempDir: () => join(root(), 'temp'),
  /** App icon (used by window + native drag image). */
  icon: () => join(app.getAppPath(), 'resources', 'icon.png'),
  /** Tray icon (pure white logo without background). */
  trayIcon: () => join(app.getAppPath(), 'resources', 'tray.png')
} as const

/**
 * Directory other Win32 processes can open.
 *
 * GitHub NSIS: same as PATHS.tempDir() (userData/temp) — unchanged.
 * Store/MSIX: USERPROFILE\AppData\Local\Temp\Edge-Drop. Packaged APPDATA is
 * virtualized; Explorer/Word/PowerShell do not see those redirected writes.
 */
export function getUnpackagedTempDir(): string {
  if (isStoreBuild()) {
    return join(homedir(), 'AppData', 'Local', 'Temp', 'Edge-Drop')
  }
  return PATHS.tempDir()
}

/** True when `p` is one of our own staged drag/clipboard temp files. */
export function isStagedTempPath(p: string): boolean {
  if (!p) return false
  const roots = new Set([PATHS.tempDir(), getUnpackagedTempDir()])
  return [...roots].some((rootDir) => {
    if (!rootDir) return false
    if (p === rootDir) return true
    const prefix = rootDir.endsWith('\\') || rootDir.endsWith('/') ? rootDir : rootDir + sep
    return p.startsWith(prefix)
  })
}

function needsUnpackagedCopy(filePath: string): boolean {
  if (!isStoreBuild() || !filePath) return false
  const lower = filePath.toLowerCase()
  if (lower.includes('\\packages\\') || lower.includes('\\windowsapps\\')) return true
  try {
    return lower.startsWith(PATHS.root().toLowerCase())
  } catch {
    return false
  }
}

/**
 * Path an unpackaged process (PowerShell, Explorer, Photoshop) can open.
 * No-op on the GitHub .exe. On Store, copies package-private files into the
 * real user temp so CF_HDROP / FromFile targets resolve.
 */
export function toUnpackagedFilePath(filePath: string): string {
  if (!needsUnpackagedCopy(filePath) || !existsSync(filePath)) return filePath
  const dir = getUnpackagedTempDir()
  mkdirSync(dir, { recursive: true })
  const stamp = createHash('sha1').update(filePath).digest('hex').slice(0, 10)
  const dest = join(dir, `${stamp}${extname(filePath) || ''}`)
  try {
    copyFileSync(filePath, dest)
    return dest
  } catch (err) {
    console.error('[paths] Failed to stage unpackaged copy of', filePath, err)
    return filePath
  }
}

export function toUnpackagedFilePaths(filePaths: string[]): string[] {
  return filePaths.map(toUnpackagedFilePath)
}

/** Idempotently create every directory the app needs. Safe to call repeatedly. */
export function ensureDirs(): void {
  for (const dir of [PATHS.imagesDir(), PATHS.payloadsDir(), PATHS.tempDir()]) {
    mkdirSync(dir, { recursive: true })
  }
  if (isStoreBuild()) {
    mkdirSync(getUnpackagedTempDir(), { recursive: true })
  }
}

function emptyDir(dir: string): void {
  try {
    for (const entry of readdirSync(dir)) {
      try {
        rmSync(join(dir, entry), { force: true })
      } catch {
        /* ignore individual file errors */
      }
    }
  } catch {
    /* dir may not exist yet */
  }
}

/** Remove old temp drag files left over from a previous session. */
export function cleanTemp(): void {
  emptyDir(PATHS.tempDir())
  const unpackaged = getUnpackagedTempDir()
  if (unpackaged !== PATHS.tempDir()) {
    emptyDir(unpackaged)
  }
}
