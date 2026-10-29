import { describe, it, expect, vi, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({ system: ['en-US'], language: 'system' }))

vi.mock('electron', () => ({
  app: { getPreferredSystemLanguages: () => mocks.system, getPath: () => 'C:\\mock' },
  nativeImage: { createFromPath: vi.fn(), createFromBuffer: vi.fn() }
}))
vi.mock('../electron/store/settings', () => ({ loadSettings: () => ({ language: mocks.language }) }))
vi.mock('../electron/store/paths', () => ({
  PATHS: { tempDir: () => 'C:\\mock\\temp', imagesDir: () => 'C:\\mock\\images' },
  getUnpackagedTempDir: () => 'C:\\mock\\temp',
  toUnpackagedFilePath: (p: string) => p,
  toUnpackagedFilePaths: (ps: string[]) => ps
}))
vi.mock('../electron/main/state', () => ({ getStore: () => ({}) }))

import { mainT, resolveLang } from '../electron/main/i18n'
import { formatClipboardImageFilename, setFileNameWords } from '../electron/main/drag'
import { fileBaseFromNote } from '../electron/main/saveImages'
import { TRANSLATIONS } from '../src/i18n/translations'

afterEach(() => {
  mocks.system = ['en-US']
  mocks.language = 'system'
})

describe('main process language', () => {
  it('"system" follows Windows for every language the app has (the old copy knew 9)', () => {
    const cases: Array<[string, string]> = [
      ['it-IT', 'it'], ['pt-BR', 'pt'], ['ko-KR', 'ko'], ['ar-SA', 'ar'], ['bn-BD', 'bn'], ['tr-TR', 'tr'],
      ['vi-VN', 'vi'], ['pl-PL', 'pl'], ['nl-NL', 'nl'], ['sv-SE', 'sv'], ['id-ID', 'id'], ['uk-UA', 'uk'],
      ['el-GR', 'el'], ['cs-CZ', 'cs'], ['ro-RO', 'ro'], ['hu-HU', 'hu'], ['da-DK', 'da'], ['fi-FI', 'fi'],
      ['th-TH', 'th'], ['he-IL', 'he'], ['nb-NO', 'no'], ['nn-NO', 'no'], ['zh-HK', 'zh-TW'], ['zh-Hant-TW', 'zh-TW'],
      ['zh-CN', 'zh-CN'], ['ja-JP', 'ja'], ['xx-YY', 'en']
    ]
    for (const [sys, want] of cases) {
      mocks.system = [sys]
      expect(resolveLang('system'), sys).toBe(want)
    }
    expect(resolveLang('de')).toBe('de')
    expect(resolveLang('nonsense')).toBe('en')
  })

  it('mainT: the language, English when missing, parameters filled in', () => {
    mocks.language = 'de'
    expect(mainT('position.displayN', { n: 2 })).toBe(TRANSLATIONS.de.position.displayN.replace('{n}', '2'))
    mocks.language = 'en'
    expect(mainT('position.displayN', { n: 2 })).toBe('Display 2')
    expect(mainT('no.such.key')).toBe('no.such.key')
  })
})

describe('names of files the app writes', () => {
  afterEach(() => setFileNameWords(() => ({ screenshotName: 'Screenshot {stamp}', imageName: 'Image {stamp}', image: 'Image', snippet: 'Snippet' })))

  it('English by default, the user\'s language once main supplies the words', () => {
    const at = new Date(2026, 7, 15, 22, 30, 45).getTime()
    expect(formatClipboardImageFilename(at, 'png')).toBe('Screenshot 2026-08-15 22.30.45.png')
    const ru = TRANSLATIONS.ru.files
    setFileNameWords(() => ru)
    expect(formatClipboardImageFilename(at, 'png')).toBe(`${ru.screenshotName.replace('{stamp}', '2026-08-15 22.30.45')}.png`)
    expect(formatClipboardImageFilename(at, 'png', { source: 'image', indexSuffix: 2 })).toBe(`${ru.imageName.replace('{stamp}', '2026-08-15 22.30.45')} (2).png`)
    // a name the clipboard gave is kept as it is
    expect(formatClipboardImageFilename(at, 'png', { fileName: 'Отпуск.jpg' })).toBe('Отпуск.jpg')
  })

  it('a word with characters Windows forbids cannot break a file name', () => {
    const at = new Date(2026, 0, 1, 9, 5, 2).getTime()
    setFileNameWords(() => ({ screenshotName: 'Shot: {stamp}?', imageName: 'Image {stamp}', image: 'Image', snippet: 'Snippet' }))
    expect(formatClipboardImageFilename(at, 'png')).toBe('Shot_ 2026-01-01 09.05.02_.png')
  })

  it('Save to Downloads: a note with nothing usable falls back to the given word', () => {
    expect(fileBaseFromNote('...')).toBe('Image')
    expect(fileBaseFromNote('...', TRANSLATIONS.fr.files.image)).toBe(TRANSLATIONS.fr.files.image)
  })
})
