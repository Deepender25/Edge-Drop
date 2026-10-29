import { describe, it, expect, beforeEach } from 'vitest'
import { TRANSLATIONS, en, LANGUAGES } from '../src/i18n/translations'
import { t, languageLabel } from '../src/i18n'
import { useStore } from '../src/store/appStore'
import { localizeLinkInfo } from '../src/lib/linkLabels'
import { parseUrlPreview } from '../src/lib/urlPreview'
import { formatBytes } from '../src/lib/format'
import { kindBadge } from '../src/lib/fileType'
import { matches } from '../src/hooks/useFilteredItems'
import { queryWords } from '../src/lib/search'
import { demoLink, demoNote, demoPdf, demoQuery, demoStackWithPhoto, demoText, pageLines } from '../src/onboarding/demoItems'

type Tree = { [k: string]: string | Tree }
const isPlural = (v: unknown): v is Record<string, string> =>
  !!v && typeof v === 'object' && typeof (v as { other?: unknown }).other === 'string'

/** Every leaf: 'section.key' -> string, or the plural group as a whole. */
function leaves(o: Tree, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'object' && !isPlural(v)) leaves(v as Tree, key, out)
    else out[key] = v
  }
  return out
}
const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
const EN = leaves(en as unknown as Tree)
const CODES = Object.keys(TRANSLATIONS).filter((c) => c !== 'en')

function setLanguage(code: string) {
  useStore.setState((s) => ({ settings: { ...s.settings, language: code } }))
}

describe('every language has every string', () => {
  it('31 languages, each with the language picker entry', () => {
    expect(Object.keys(TRANSLATIONS)).toHaveLength(31)
    for (const code of Object.keys(TRANSLATIONS)) expect(LANGUAGES.some((l) => l.code === code), code).toBe(true)
  })

  it.each(CODES)('%s: no key missing, none extra, same placeholders', (code) => {
    const L = leaves(TRANSLATIONS[code] as unknown as Tree)
    for (const [key, enVal] of Object.entries(EN)) {
      const v = L[key]
      expect(v, `${code} ${key}`).toBeDefined()
      if (isPlural(enVal)) {
        expect(isPlural(v), `${code} ${key} is a plural group`).toBe(true)
        continue
      }
      expect(typeof v, `${code} ${key}`).toBe('string')
      expect((v as string).trim().length, `${code} ${key} empty`).toBeGreaterThan(0)
      expect(params(v as string), `${code} ${key} placeholders`).toBe(params(enVal as string))
    }
    for (const key of Object.keys(L)) expect(key in EN, `${code} has unknown key ${key}`).toBe(true)
  })

  it.each(Object.keys(TRANSLATIONS))('%s: plural groups have exactly the language\'s plural forms, each with the number', (code) => {
    const cats = new Intl.PluralRules(code).resolvedOptions().pluralCategories
    const L = leaves(TRANSLATIONS[code] as unknown as Tree)
    for (const [key, v] of Object.entries(L)) {
      if (!isPlural(v)) continue
      expect(Object.keys(v).sort(), `${code} ${key}`).toEqual([...cats].sort())
      for (const [cat, form] of Object.entries(v)) expect(form, `${code} ${key}.${cat}`).toContain('{count}')
    }
  })
})

describe('plural forms are chosen by the number', () => {
  beforeEach(() => setLanguage('en'))

  it('English: one and other', () => {
    expect(t('count.files', { count: 1 })).toBe('1 file')
    expect(t('count.files', { count: 3 })).toBe('3 files')
    expect(t('count.moreFiles', { count: 1 })).toBe('+1 more file')
  })

  it('Russian picks one / few / many', () => {
    setLanguage('ru')
    const forms = TRANSLATIONS.ru.count.files as unknown as Record<string, string>
    expect(t('count.files', { count: 1 })).toBe(forms.one.replace('{count}', '1'))
    expect(t('count.files', { count: 3 })).toBe(forms.few.replace('{count}', '3'))
    expect(t('count.files', { count: 5 })).toBe(forms.many.replace('{count}', '5'))
    expect(t('count.files', { count: 21 })).toBe(forms.one.replace('{count}', '21'))
  })

  it('Arabic picks zero / two / many', () => {
    setLanguage('ar')
    const forms = TRANSLATIONS.ar.count.images as unknown as Record<string, string>
    expect(t('count.images', { count: 0 })).toBe(forms.zero.replace('{count}', '0'))
    expect(t('count.images', { count: 2 })).toBe(forms.two.replace('{count}', '2'))
    expect(t('count.images', { count: 11 })).toBe(forms.many.replace('{count}', '11'))
  })
})

describe('the onboarding demo works in every language', () => {
  it.each(Object.keys(TRANSLATIONS))('%s: searching the demo word finds only the noted card', (code) => {
    setLanguage(code)
    const words = queryWords(demoQuery())
    expect(words.length, `${code} query is one word`).toBe(1)
    const now = Date.now()
    const items = [demoPdf(now, demoNote()), demoStackWithPhoto(now), demoLink(now), demoText(now)]
    expect(items.filter((it) => matches(it, words)).map((it) => it.id), code).toEqual(['demo-pdf'])
  })

  it.each(Object.keys(TRANSLATIONS))('%s: the page sentence has three lines, demo file names are legal', (code) => {
    setLanguage(code)
    const lines = pageLines()
    expect(lines).toHaveLength(3)
    expect(new Set(lines).size).toBe(3)
    for (const k of ['fileItinerary', 'fileSlides', 'fileBudget', 'fileChecklist', 'filePacking', 'filePhotos', 'filePhoto'] as const) {
      expect(TRANSLATIONS[code].tour[k], `${code} tour.${k}`).not.toMatch(/[\\/:*?"<>|]/)
    }
  })
})

describe('names of files the app writes', () => {
  it.each(Object.keys(TRANSLATIONS))('%s: Windows-legal, with the time stamp', (code) => {
    const f = TRANSLATIONS[code].files
    for (const v of [f.screenshotName, f.imageName, f.image, f.snippet]) expect(v, code).not.toMatch(/[\\/:*?"<>|]/)
    expect(f.screenshotName).toContain('{stamp}')
    expect(f.imageName).toContain('{stamp}')
    expect(f.snippet, code).not.toMatch(/\s/)
  })
})

describe('words built in code are in the language', () => {
  beforeEach(() => setLanguage('en'))

  it('link card words: generic words translated, site names kept', () => {
    const gh = parseUrlPreview('https://github.com/Deepender25/Edge-Drop/issues/71')
    expect(localizeLinkInfo(gh).subtitle).toBe('Issue')
    setLanguage('de')
    const de = localizeLinkInfo(gh)
    expect(de.serviceName).toBe('GitHub')
    expect(de.subtitle).toBe(TRANSLATIONS.de.link.issue)
    const local = localizeLinkInfo(parseUrlPreview('http://localhost:3000/app'))
    expect(local.serviceName).toBe(TRANSLATIONS.de.link.thisComputer)
    expect(local.subtitle).toBe(TRANSLATIONS.de.link.port.replace('{port}', '3000'))
    const yt = localizeLinkInfo(parseUrlPreview('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=65'))
    expect(yt.title).toBe(TRANSLATIONS.de.link.startsAt.replace('{time}', '1:05'))
  })

  it('sizes: English as before, other languages with their unit and decimal mark', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(412_000)).toBe('402.3 KB')
    expect(formatBytes(2_318_400)).toBe('2.2 MB')
    setLanguage('fr')
    expect(formatBytes(412_000)).toBe(TRANSLATIONS.fr.units.kb.replace('{n}', '402,3'))
  })

  it('kind badges: English as before', () => {
    expect(kindBadge('pdf')).toBe('pdf')
    expect(kindBadge('powerpoint')).toBe('slides')
    expect(kindBadge('executable')).toBe('installer')
    expect(t('badge.links')).toBe('links')
    expect(t('badge.image')).toBe('image')
  })

  it('language picker: English as before; other interfaces name languages in their own words', () => {
    const de = LANGUAGES.find((l) => l.code === 'de')!
    const system = LANGUAGES.find((l) => l.code === 'system')!
    expect(languageLabel(de, 'en')).toBe('Deutsch (German)')
    expect(languageLabel(system, 'en')).toBe(en.behaviour.systemDefault)
    setLanguage('fr')
    expect(languageLabel(de, 'fr')).toBe('Deutsch (allemand)')
    expect(languageLabel(system, 'fr')).toBe(TRANSLATIONS.fr.behaviour.systemDefault)
    // the interface's own language is not named twice
    expect(languageLabel(LANGUAGES.find((l) => l.code === 'fr')!, 'fr')).toBe('Français')
  })
})
