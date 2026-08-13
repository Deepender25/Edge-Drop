/**
 * Centralized filesystem locations for persisted state.
 *
 * Everything lives under the OS userData directory so the app is fully portable
 * and self-cleaning. Image files are kept in their own folder so the JSON index
 * stays small and fast to read/write.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

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

/** Idempotently create every directory the app needs. Safe to call repeatedly. */
export function ensureDirs(): void {
  for (const dir of [PATHS.imagesDir(), PATHS.payloadsDir(), PATHS.tempDir()]) {
    mkdirSync(dir, { recursive: true })
  }
}

/** Remove old temp drag files left over from a previous session. */
export function cleanTemp(): void {
  // Best-effort; failures are non-fatal.
  try {
    const fs = require('node:fs') as typeof import('node:fs')
    for (const entry of fs.readdirSync(PATHS.tempDir())) {
      try {
        fs.rmSync(join(PATHS.tempDir(), entry), { force: true })
      } catch {
        /* ignore individual file errors */
      }
    }
  } catch {
    /* dir may not exist yet */
  }
}
