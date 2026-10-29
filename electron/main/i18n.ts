/**
 * The user's language in the main process: the tray menu, display names, and the names of files the
 * app writes (drag-out, paste into Explorer, Save to Downloads). One resolver for all of them, the same
 * language list the renderer knows (src/i18n/index.ts), read from settings each time so a change of
 * language applies at once.
 */
import { app } from 'electron'
import { loadSettings } from '../store/settings'
import { TRANSLATIONS, en } from '../../src/i18n/translations'

/** A language setting ('system' or a code) → a code TRANSLATIONS has. */
export function resolveLang(setting?: string): string {
  const code = setting || 'system'
  if (code !== 'system') return TRANSLATIONS[code] ? code : 'en'
  const first = (app.getPreferredSystemLanguages()[0] || '').toLowerCase()
  if (first.startsWith('zh-tw') || first.startsWith('zh-hk') || first.startsWith('zh-hant')) return 'zh-TW'
  if (first.startsWith('zh')) return 'zh-CN'
  if (first.startsWith('nb') || first.startsWith('nn')) return 'no'
  const base = first.split('-')[0]
  return TRANSLATIONS[base] ? base : 'en'
}

function lookup(dict: unknown, path: string): string | undefined {
  let cur: unknown = dict
  for (const part of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  if (cur && typeof cur === 'object' && typeof (cur as { other?: unknown }).other === 'string') return (cur as { other: string }).other
  return typeof cur === 'string' ? cur : undefined
}

/** `t()` for the main process: the user's language, else English, with `{name}` parameters filled in. */
export function mainT(path: string, params?: Record<string, string | number>, lang = resolveLang(loadSettings().language)): string {
  let val = lookup(TRANSLATIONS[lang], path) || lookup(en, path) || path
  if (params) {
    for (const [k, v] of Object.entries(params)) val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), () => String(v))
  }
  return val
}
