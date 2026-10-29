import { useStore } from '../store/appStore'
import { LANGUAGES, TRANSLATIONS, en, type LanguageMeta } from './translations'

/**
 * Resolves the active language code.
 * If 'system', automatically matches navigator.language (e.g. 'es-ES' -> 'es').
 */
export function getResolvedLanguage(settingLang?: string): string {
  const code = settingLang || useStore.getState().settings.language || 'system'
  if (code !== 'system') return code

  const g = globalThis as any
  if (!g.window || !g.window.navigator) return 'en'
  const navLang = ((g.window.navigator.language as string) || '').toLowerCase()

  if (navLang.startsWith('zh-tw') || navLang.startsWith('zh-hk')) return 'zh-TW'
  if (navLang.startsWith('zh')) return 'zh-CN'
  if (navLang.startsWith('es')) return 'es'
  if (navLang.startsWith('fr')) return 'fr'
  if (navLang.startsWith('de')) return 'de'
  if (navLang.startsWith('hi')) return 'hi'
  if (navLang.startsWith('ja')) return 'ja'
  if (navLang.startsWith('ru')) return 'ru'
  if (navLang.startsWith('it')) return 'it'
  if (navLang.startsWith('pt')) return 'pt'
  if (navLang.startsWith('ko')) return 'ko'
  if (navLang.startsWith('ar')) return 'ar'
  if (navLang.startsWith('fa')) return 'fa'
  if (navLang.startsWith('bn')) return 'bn'
  if (navLang.startsWith('tr')) return 'tr'
  if (navLang.startsWith('vi')) return 'vi'
  if (navLang.startsWith('pl')) return 'pl'
  if (navLang.startsWith('nl')) return 'nl'
  if (navLang.startsWith('sv')) return 'sv'
  if (navLang.startsWith('id')) return 'id'
  if (navLang.startsWith('uk')) return 'uk'
  if (navLang.startsWith('el')) return 'el'
  if (navLang.startsWith('cs')) return 'cs'
  if (navLang.startsWith('ro')) return 'ro'
  if (navLang.startsWith('hu')) return 'hu'
  if (navLang.startsWith('da')) return 'da'
  if (navLang.startsWith('fi')) return 'fi'
  if (navLang.startsWith('th')) return 'th'
  if (navLang.startsWith('he')) return 'he'
  if (navLang.startsWith('no') || navLang.startsWith('nb') || navLang.startsWith('nn')) return 'no'

  return 'en'
}

/**
 * Retrieves a nested string property safely from a translation dictionary. A plural group
 * (`{ one, few, many, other }`) gives the form for `count` in that language (Intl.PluralRules).
 */
function getNestedProp(obj: any, path: string, lang?: string, count?: number): string | undefined {
  const parts = path.split('.')
  let curr = obj
  for (const part of parts) {
    if (!curr || typeof curr !== 'object') return undefined
    curr = curr[part]
  }
  if (curr && typeof curr === 'object' && typeof curr.other === 'string') {
    if (typeof count !== 'number') return curr.other
    return curr[pluralCategory(lang || 'en', count)] ?? curr.other
  }
  return typeof curr === 'string' ? curr : undefined
}

const pluralRules = new Map<string, Intl.PluralRules>()

/** The plural category of `count` in `lang` ('one', 'few', 'other', …). */
function pluralCategory(lang: string, count: number): string {
  let rules = pluralRules.get(lang)
  if (!rules) {
    try {
      rules = new Intl.PluralRules(lang)
    } catch {
      rules = new Intl.PluralRules('en')
    }
    pluralRules.set(lang, rules)
  }
  return rules.select(count)
}

/**
 * Main translation function.
 * E.g., t('header.searchPlaceholder')
 * E.g., t('behaviour.updateAvailableTitle', { version: '0.3.1' })
 */
export function t(path: string, params?: Record<string, string | number>): string {
  const settingsLang = useStore.getState().settings.language
  const langCode = getResolvedLanguage(settingsLang)
  const dict = TRANSLATIONS[langCode]

  const count = typeof params?.count === 'number' ? params.count : undefined
  let val = dict ? getNestedProp(dict, path, langCode, count) : undefined
  if (!val) {
    val = getNestedProp(en, path, 'en', count) || path
  }

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      // Function form: a value containing "$&" / "$1" (e.g. a file name)
      // is inserted literally instead of as a replacement pattern.
      val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), () => String(v))
    }
  }

  return val
}

const languageNames = new Map<string, Intl.DisplayNames | null>()

/** Codes Intl knows a language's name by, where the app's code is a region variant. */
const NAME_CODES: Record<string, string> = { 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant' }

/**
 * The second name of a language in the picker, in the interface's language: "German" in English,
 * "немецкий" in Russian (from the browser's own language names). Empty when it would only repeat
 * the native name, and for "System default".
 */
export function languageSubName(l: LanguageMeta, uiLang: string): string {
  if (l.code === 'system' || l.nativeName.includes('(')) return ''
  let name = l.name
  if (uiLang !== 'en') {
    let names = languageNames.get(uiLang)
    if (names === undefined) {
      try {
        names = new Intl.DisplayNames([uiLang], { type: 'language' })
      } catch {
        names = null
      }
      languageNames.set(uiLang, names)
    }
    name = names?.of(NAME_CODES[l.code] || l.code) || l.name
  }
  return name.toLocaleLowerCase(uiLang) === l.nativeName.toLocaleLowerCase(uiLang) ? '' : name
}

/** A language as the picker shows it: "Deutsch (German)", "System default" in the interface's language. */
export function languageLabel(l: LanguageMeta, uiLang: string): string {
  if (l.code === 'system') return t('behaviour.systemDefault')
  const sub = languageSubName(l, uiLang)
  return sub ? `${l.nativeName} (${sub})` : l.nativeName
}

/**
 * Hook that subscribes to settings.language changes and returns the translation function t.
 */
export function useTranslation() {
  const language = useStore((s) => s.settings.language)
  const resolvedLang = getResolvedLanguage(language)

  // Update text direction for RTL languages like Arabic, Persian & Hebrew
  const g = globalThis as any
  if (g.document && g.document.documentElement) {
    const isRtl = resolvedLang === 'ar' || resolvedLang === 'fa' || resolvedLang === 'he'
    g.document.documentElement.dir = isRtl ? 'rtl' : 'ltr'
  }

  return {
    t,
    language,
    resolvedLang,
    languages: LANGUAGES
  }
}
