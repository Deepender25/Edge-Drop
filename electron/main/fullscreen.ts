/**
 * Fullscreen Game & Presentation Detection Module.
 *
 * Detects when a Direct3D fullscreen game, full-screen video, or presentation
 * is active in the foreground using Windows API `SHQueryUserNotificationState`.
 *
 * Queries in the background every 2 seconds so edge hover polling (`startCursorPoll`)
 * reads a cached boolean with 0ms performance overhead.
 */
import { execFile } from 'node:child_process'
import { getSystemPowerShellPath } from './powershell'

let isFullscreenActiveCache = false
let checkTimer: ReturnType<typeof setInterval> | null = null
let isChecking = false
let onFullscreenDetectedFn: (() => void) | null = null

export function registerFullscreenActiveListener(fn: () => void): void {
  onFullscreenDetectedFn = fn
}

const psScript = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("shell32.dll")]
    public static extern int SHQueryUserNotificationState(out int pstate);
    public static int Check() {
        int state = 5;
        try { SHQueryUserNotificationState(out state); } catch {}
        return state;
    }
}
"@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
[WinAPI]::Check()
`.trim()

export function isFullscreenAppActive(): boolean {
  return isFullscreenActiveCache
}

export function triggerFullscreenCheck(): void {
  if (process.platform !== 'win32' || isChecking) return
  isChecking = true
  try {
    execFile(
      getSystemPowerShellPath(),
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { windowsHide: true },
      (error, stdout) => {
        isChecking = false
        if (!error && stdout) {
          const state = parseInt(stdout.trim(), 10)
          // Windows Notification States:
          // 2 = QUNS_BUSY (Fullscreen app / presentation mode)
          // 3 = QUNS_RUNNING_D3D_FULL_SCREEN (Direct3D Fullscreen Game)
          // 4 = QUNS_PRESENTATION_MODE (PowerPoint / Keynote Presentation)
          // 5 = QUNS_ACCEPTS_NOTIFICATIONS (Normal Desktop)
          const isNowFullscreen = !isNaN(state) && state >= 2 && state <= 4
          isFullscreenActiveCache = isNowFullscreen
          if (isNowFullscreen) {
            onFullscreenDetectedFn?.()
          }
        }
      }
    )
  } catch {
    isChecking = false
  }
}

export function startFullscreenMonitor(): void {
  if (process.platform !== 'win32') return
  if (checkTimer !== null) return

  triggerFullscreenCheck()
  checkTimer = setInterval(triggerFullscreenCheck, 1000)
}

export function stopFullscreenMonitor(): void {
  if (checkTimer !== null) {
    clearInterval(checkTimer)
    checkTimer = null
  }
  isFullscreenActiveCache = false
}
