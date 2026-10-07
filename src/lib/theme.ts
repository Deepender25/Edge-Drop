/**
 * Runtime theme application.
 *
 * CSS owns the visual contract; this module only swaps semantic custom
 * properties on :root. The default palette exactly mirrors tokens.css so
 * startup remains visually stable before persisted settings hydrate.
 */
import { COLOR_THEMES, resolveColorTheme, type ColorTheme } from '../../shared/types'

export interface ColorThemePalette {
  bg0: string
  bg1: string
  bg2: string
  bg3: string
  bgGlass: string
  bgCard: string
  bgCardHover: string
  bgChip: string
  bgPinned: string
  bgDeepRaised: string
  bgPreview: string
  bgPreviewDeep: string
  bgOverlayStrong: string
  bgStrongHover: string
  bgStrongHover2: string
  edgeLight: string
  edgeStrong: string
  divider: string
  textPrimary: string
  textSecondary: string
  textTertiary: string
  accent: string
  accentGlow: string
  scrollbarThumb: string
  scrollbarThumbHover: string
}

export interface ColorThemePreview {
  id: ColorTheme
  background: string
  surface: string
  hover: string
  accent: string
}

export const COLOR_THEME_PALETTES = {
  default: {
    bg0: '#000000', bg1: '#000000', bg2: '#141414', bg3: '#1c1c1c',
    bgGlass: 'rgba(12, 12, 16, 0.72)', bgCard: '#141414', bgCardHover: '#1c1c1c', bgChip: '#141414',
    bgPinned: '#181818', bgDeepRaised: '#121214', bgPreview: '#141418', bgPreviewDeep: '#121216', bgOverlayStrong: 'rgba(28, 28, 32, 0.96)', bgStrongHover: '#252525', bgStrongHover2: '#262626',
    edgeLight: 'rgba(255, 255, 255, 0.06)', edgeStrong: 'rgba(255, 255, 255, 0.12)', divider: 'rgba(255, 255, 255, 0.08)',
    textPrimary: '#ffffff', textSecondary: 'rgba(255, 255, 255, 0.78)', textTertiary: 'rgba(255, 255, 255, 0.48)',
    accent: '#8b5cf6', accentGlow: 'rgba(139, 92, 246, 0.55)',
    scrollbarThumb: 'rgba(255, 255, 255, 0.12)', scrollbarThumbHover: 'rgba(255, 255, 255, 0.22)'
  },
  ocean: {
    bg0: '#02070d', bg1: '#030910', bg2: '#0b1722', bg3: '#102332',
    bgGlass: 'rgba(4, 13, 22, 0.78)', bgCard: '#0b1722', bgCardHover: '#102332', bgChip: '#0d1b28',
    bgPinned: '#0e1c28', bgDeepRaised: '#07111a', bgPreview: '#0c1824', bgPreviewDeep: '#07131d', bgOverlayStrong: 'rgba(16, 35, 50, 0.96)', bgStrongHover: '#163044', bgStrongHover2: '#183347',
    edgeLight: 'rgba(202, 234, 255, 0.07)', edgeStrong: 'rgba(202, 234, 255, 0.14)', divider: 'rgba(202, 234, 255, 0.09)',
    textPrimary: '#f5fbff', textSecondary: 'rgba(235, 248, 255, 0.80)', textTertiary: 'rgba(222, 243, 255, 0.50)',
    accent: '#38bdf8', accentGlow: 'rgba(56, 189, 248, 0.50)',
    scrollbarThumb: 'rgba(202, 234, 255, 0.14)', scrollbarThumbHover: 'rgba(202, 234, 255, 0.25)'
  },
  emerald: {
    bg0: '#020806', bg1: '#030b08', bg2: '#0a1712', bg3: '#10231a',
    bgGlass: 'rgba(4, 14, 10, 0.78)', bgCard: '#0a1712', bgCardHover: '#10231a', bgChip: '#0c1b14',
    bgPinned: '#0d1c15', bgDeepRaised: '#07130e', bgPreview: '#0b1913', bgPreviewDeep: '#07150f', bgOverlayStrong: 'rgba(16, 35, 26, 0.96)', bgStrongHover: '#173023', bgStrongHover2: '#193426',
    edgeLight: 'rgba(211, 255, 231, 0.07)', edgeStrong: 'rgba(211, 255, 231, 0.14)', divider: 'rgba(211, 255, 231, 0.09)',
    textPrimary: '#f5fff9', textSecondary: 'rgba(235, 255, 244, 0.80)', textTertiary: 'rgba(220, 255, 235, 0.50)',
    accent: '#34d399', accentGlow: 'rgba(52, 211, 153, 0.48)',
    scrollbarThumb: 'rgba(211, 255, 231, 0.14)', scrollbarThumbHover: 'rgba(211, 255, 231, 0.25)'
  },
  rose: {
    bg0: '#0a0306', bg1: '#0d0508', bg2: '#1b0d13', bg3: '#27131c',
    bgGlass: 'rgba(18, 7, 12, 0.78)', bgCard: '#1b0d13', bgCardHover: '#27131c', bgChip: '#201018',
    bgPinned: '#211018', bgDeepRaised: '#15090e', bgPreview: '#1d0f16', bgPreviewDeep: '#170a11', bgOverlayStrong: 'rgba(39, 19, 28, 0.96)', bgStrongHover: '#341925', bgStrongHover2: '#371b27',
    edgeLight: 'rgba(255, 220, 231, 0.07)', edgeStrong: 'rgba(255, 220, 231, 0.14)', divider: 'rgba(255, 220, 231, 0.09)',
    textPrimary: '#fff7fa', textSecondary: 'rgba(255, 238, 244, 0.80)', textTertiary: 'rgba(255, 224, 234, 0.50)',
    accent: '#fb7185', accentGlow: 'rgba(251, 113, 133, 0.48)',
    scrollbarThumb: 'rgba(255, 220, 231, 0.14)', scrollbarThumbHover: 'rgba(255, 220, 231, 0.25)'
  },
  amber: {
    bg0: '#0a0702', bg1: '#0d0903', bg2: '#1a1308', bg3: '#251b0b',
    bgGlass: 'rgba(18, 12, 4, 0.78)', bgCard: '#1a1308', bgCardHover: '#251b0b', bgChip: '#20180a',
    bgPinned: '#201709', bgDeepRaised: '#140f06', bgPreview: '#1c1509', bgPreviewDeep: '#160f06', bgOverlayStrong: 'rgba(37, 27, 11, 0.96)', bgStrongHover: '#33260f', bgStrongHover2: '#362811',
    edgeLight: 'rgba(255, 239, 202, 0.07)', edgeStrong: 'rgba(255, 239, 202, 0.14)', divider: 'rgba(255, 239, 202, 0.09)',
    textPrimary: '#fffaf0', textSecondary: 'rgba(255, 246, 224, 0.80)', textTertiary: 'rgba(255, 238, 199, 0.50)',
    accent: '#fbbf24', accentGlow: 'rgba(251, 191, 36, 0.48)',
    scrollbarThumb: 'rgba(255, 239, 202, 0.14)', scrollbarThumbHover: 'rgba(255, 239, 202, 0.25)'
  },
  arctic: {
    bg0: '#04060a', bg1: '#060911', bg2: '#101722', bg3: '#182232',
    bgGlass: 'rgba(7, 11, 18, 0.80)', bgCard: '#101722', bgCardHover: '#182232', bgChip: '#121b28',
    bgPinned: '#141c29', bgDeepRaised: '#0b111b', bgPreview: '#121a27', bgPreviewDeep: '#0c121d', bgOverlayStrong: 'rgba(24, 34, 50, 0.96)', bgStrongHover: '#202d42', bgStrongHover2: '#223047',
    edgeLight: 'rgba(225, 239, 255, 0.07)', edgeStrong: 'rgba(225, 239, 255, 0.14)', divider: 'rgba(225, 239, 255, 0.09)',
    textPrimary: '#f7fbff', textSecondary: 'rgba(239, 247, 255, 0.80)', textTertiary: 'rgba(225, 239, 255, 0.50)',
    accent: '#93c5fd', accentGlow: 'rgba(147, 197, 253, 0.48)',
    scrollbarThumb: 'rgba(225, 239, 255, 0.14)', scrollbarThumbHover: 'rgba(225, 239, 255, 0.25)'
  }
} satisfies Record<ColorTheme, ColorThemePalette>

const THEME_VAR_MAP: ReadonlyArray<[keyof ColorThemePalette, string]> = [
  ['bg0', '--bg-0'], ['bg1', '--bg-1'], ['bg2', '--bg-2'], ['bg3', '--bg-3'],
  ['bgGlass', '--bg-glass'], ['bgCard', '--bg-card'], ['bgCardHover', '--bg-card-hover'], ['bgChip', '--bg-chip'],
  ['bgPinned', '--bg-pinned'], ['bgDeepRaised', '--bg-deep-raised'], ['bgPreview', '--bg-preview'], ['bgPreviewDeep', '--bg-preview-deep'],
  ['bgOverlayStrong', '--bg-overlay-strong'], ['bgStrongHover', '--bg-strong-hover'], ['bgStrongHover2', '--bg-strong-hover-2'],
  ['edgeLight', '--edge-light'], ['edgeStrong', '--edge-strong'], ['divider', '--divider'],
  ['textPrimary', '--text-primary'], ['textSecondary', '--text-secondary'], ['textTertiary', '--text-tertiary'],
  ['accent', '--accent'], ['accentGlow', '--accent-glow'],
  ['scrollbarThumb', '--scrollbar-thumb'], ['scrollbarThumbHover', '--scrollbar-thumb-hover']
]

export const COLOR_THEME_PREVIEWS: readonly ColorThemePreview[] = COLOR_THEMES.map((id) => {
  const palette = COLOR_THEME_PALETTES[id]
  return {
    id,
    background: palette.bg1,
    surface: palette.bgCard,
    hover: palette.bgCardHover,
    accent: palette.accent
  }
})

/** Apply a curated color theme and return the normalized theme id. */
export function applyColorTheme(theme: unknown): ColorTheme {
  const id = resolveColorTheme(theme)
  const root = document.documentElement
  const palette = COLOR_THEME_PALETTES[id]

  root.dataset.colorTheme = id
  for (const [key, cssVar] of THEME_VAR_MAP) {
    root.style.setProperty(cssVar, palette[key])
  }
  return id
}

/** Apply reduce-motion preference as a data attribute the CSS can key off. */
export function applyReduceMotion(reduce: boolean): void {
  document.documentElement.dataset.motion = reduce ? 'reduce' : 'full'
}
