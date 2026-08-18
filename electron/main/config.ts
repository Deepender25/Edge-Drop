/** App-wide constants and environment flags for the main process. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/** Mutable runtime flags (kept separate from the frozen config object). */
export const runtime = {
  /** Set true only while the app is genuinely quitting (tray -> Quit). */
  quitting: false
}

/**
 * StartupTask Id declared in resources/appx/startup-extensions.xml.
 * Must stay in sync with that file.
 */
export const STORE_STARTUP_TASK_ID = 'EdgeDropStartup'

/**
 * True when running as the Microsoft Store / MSIX package.
 * The GitHub NSIS .exe never sets these signals.
 */
export function isStoreBuild(): boolean {
  if (process.windowsStore || process.env.APP_BUILD_TARGET === 'store') {
    return true
  }
  try {
    if (app.isPackaged) {
      const pkgPath = join(app.getAppPath(), 'package.json')
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { buildTarget?: string }
        if (pkg.buildTarget === 'store') {
          return true
        }
      }
    }
  } catch {
    /* unpackaged tests / app-not-ready */
  }
  return false
}

export const APP_CONFIG = {
  appName: 'Edge-Drop',
  /** Custom protocol used to serve local image files to the renderer securely. */
  imageProtocol: 'edgelocal',
  is: {
    get dev(): boolean {
      return !!process.env.ELECTRON_RENDERER_URL || process.env.NODE_ENV === 'development'
    }
  }
} as const
