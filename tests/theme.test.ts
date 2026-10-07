import { afterEach, describe, expect, it } from 'vitest'
import { COLOR_THEMES, DEFAULT_SETTINGS, resolveColorTheme } from '../shared/types'
import { applyColorTheme, COLOR_THEME_PALETTES, COLOR_THEME_PREVIEWS } from '../src/lib/theme'

describe('color theme system', () => {
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document
  })

  it('ships six curated themes and preserves Default as the migration fallback', () => {
    expect(COLOR_THEMES).toEqual(['default', 'ocean', 'emerald', 'rose', 'amber', 'arctic'])
    expect(DEFAULT_SETTINGS.colorTheme).toBe('default')
    expect(resolveColorTheme('ocean')).toBe('ocean')
    expect(resolveColorTheme('unknown')).toBe('default')
    expect(resolveColorTheme(undefined)).toBe('default')
  })

  it('keeps every theme definition complete and every preview addressable', () => {
    const expectedKeys = Object.keys(COLOR_THEME_PALETTES.default).sort()
    for (const id of COLOR_THEMES) {
      expect(Object.keys(COLOR_THEME_PALETTES[id]).sort()).toEqual(expectedKeys)
    }
    expect(COLOR_THEME_PREVIEWS.map((preview) => preview.id)).toEqual(COLOR_THEMES)
  })

  it('applies a normalized palette to semantic root CSS variables', () => {
    const writes = new Map<string, string>()
    const dataset: Record<string, string> = {}
    ;(globalThis as any).document = {
      documentElement: {
        dataset,
        style: {
          setProperty: (name: string, value: string) => writes.set(name, value)
        }
      }
    }

    expect(applyColorTheme('emerald')).toBe('emerald')
    expect(dataset.colorTheme).toBe('emerald')
    expect(writes.get('--bg-card')).toBe(COLOR_THEME_PALETTES.emerald.bgCard)
    expect(writes.get('--accent')).toBe(COLOR_THEME_PALETTES.emerald.accent)
    expect(writes.get('--scrollbar-thumb')).toBe(COLOR_THEME_PALETTES.emerald.scrollbarThumb)

    expect(applyColorTheme('bad-value')).toBe('default')
    expect(dataset.colorTheme).toBe('default')
    expect(writes.get('--bg-card')).toBe(COLOR_THEME_PALETTES.default.bgCard)
  })
})
