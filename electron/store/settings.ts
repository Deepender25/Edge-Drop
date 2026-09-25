/**
 * Settings persistence.
 *
 * Settings are small (a single flat object) so a plain JSON file is plenty.
 * The store guards against partial/corrupt files by deep-merging onto the
 * defaults so a bad field never takes the whole app down.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { DEFAULT_SETTINGS, isUpdateMode, type Settings } from '../../shared/types'
import { PATHS } from './paths'

let cache: Settings | null = null

function merge(base: Settings, patch: Partial<Settings>): Settings {
  const out = { ...base, ...patch } as Settings
  // Clamp the numeric slider into its valid range.
  out.hotZoneHeight = Math.min(0.6, Math.max(0.2, out.hotZoneHeight))
  out.historyLimit = Math.min(2000, Math.max(50, Math.round(out.historyLimit)))
  out.autoDeleteHours = Math.max(0, Number(out.autoDeleteHours) || 0)
  out.verticalOffset = Math.min(1.0, Math.max(0.0, typeof out.verticalOffset === 'number' ? out.verticalOffset : 0.5))
  if (out.uiStyle !== 'modern' && out.uiStyle !== 'compact') {
    out.uiStyle = 'modern'
  }
  if (out.stickPosition !== 'left' && out.stickPosition !== 'right' && out.stickPosition !== 'top') {
    out.stickPosition = 'left'
  }
  if (out.triggerAlignment !== 'top' && out.triggerAlignment !== 'center' && out.triggerAlignment !== 'bottom') {
    out.triggerAlignment = 'center'
  }
  if (typeof out.language !== 'string' || !out.language.trim()) {
    out.language = 'system'
  }
  // Update mode migration + validation. Legacy files carry only autoUpdates;
  // map them (false -> 'off', anything else -> 'auto') so existing installs
  // keep byte-identical behavior. Then sync the legacy boolean back from the
  // mode so downgraded app versions still read a sensible value.
  if (!isUpdateMode(out.updateMode)) {
    out.updateMode = out.autoUpdates === false ? 'off' : 'auto'
  }
  out.autoUpdates = out.updateMode === 'auto'
  // Skip is session-only by contract ("remind me next restart"), so a
  // persisted skip from older builds is self-healed away on load. This also
  // un-sticks anyone whose prompt went permanently silent.
  out.skippedUpdateVersion = undefined
  return out
}

export function getSettings(): Settings {
  return loadSettings()
}

export function loadSettings(): Settings {
  if (cache) return cache
  let file: Partial<Settings> = {}
  try {
    if (existsSync(PATHS.settingsFile())) {
      file = JSON.parse(readFileSync(PATHS.settingsFile(), 'utf8')) as Partial<Settings>
    }
  } catch {
    file = {}
  }
  cache = merge({ ...DEFAULT_SETTINGS }, file)
  return cache
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = merge(loadSettings(), patch)
  cache = next
  try {
    writeFileSync(PATHS.settingsFile(), JSON.stringify(next, null, 2), 'utf8')
  } catch {
    /* non-fatal; settings stay in memory */
  }
  return next
}

export function resetSettingsCache(): void {
  cache = null
}
