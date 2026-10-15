import { memo, useCallback, useMemo, useRef, useState, useEffect } from 'react'
import {
  CATEGORY_ORDER,
  entriesForCategory,
  type EmojiCategoryId
} from '../lib/emoji/catalog'
import { loadGlyphs, screenGlyphCount } from '../lib/emoji/glyphCache'
import { peekEmojiCatalog } from '../lib/emoji/load'
import { loadRecents } from '../lib/emoji/prefs'
import { useStore } from '../store/appStore'
import { playButtonClickSound } from '../lib/soundEffects'
import { useTranslation } from '../i18n'
import { SegmentedControl } from './SegmentedControl'
import {
  EmojiSmileIcon,
  EmojiClockIcon,
  EmojiPawIcon,
  EmojiFoodIcon,
  EmojiPlaneIcon,
  EmojiTrophyIcon,
  EmojiBulbIcon,
  EmojiShapesIcon
} from './icons'
import type { SVGProps } from 'react'

type IconCmp = (p: SVGProps<SVGSVGElement>) => JSX.Element

export const CATEGORY_ICONS: Record<EmojiCategoryId, IconCmp> = {
  recents: EmojiClockIcon,
  smileys: EmojiSmileIcon,
  animals: EmojiPawIcon,
  food: EmojiFoodIcon,
  travel: EmojiPlaneIcon,
  activities: EmojiTrophyIcon,
  objects: EmojiBulbIcon,
  symbols: EmojiShapesIcon
}

export interface EmojiCategoryBarProps {
  /** Which dock the bar is in. The control is the same size in both. */
  isHorizontal?: boolean
  className?: string
}

/** How long the pointer must rest on a category before its glyphs are warmed. */
const WARM_DWELL_MS = 80

function CategoryBar({ className = '' }: EmojiCategoryBarProps) {
  const { t } = useTranslation()
  const category = useStore((s) => s.emojiCategory)
  const setCategory = useStore((s) => s.setEmojiCategory)
  const [recents, setRecents] = useState<string[]>(loadRecents)

  useEffect(() => {
    const handleStorage = () => setRecents(loadRecents())
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const shownCats = useMemo(() => {
    return CATEGORY_ORDER.filter((c) => c.id !== 'recents' || recents.length > 0)
  }, [recents])

  const selectCategory = useCallback(
    (id: EmojiCategoryId) => {
      playButtonClickSound()
      setCategory(id)
    },
    [setCategory]
  )

  const reduceMotion = useStore((s) => !!s.settings.reduceMotion)

  // Hover warm-up: when the pointer rests on a category, load its first
  // screen of glyphs (one call, kept by glyphCache) so the click shows them
  // at once. The short dwell skips categories the pointer only passes over.
  const warmTimer = useRef<number | null>(null)
  const cancelWarm = useCallback(() => {
    if (warmTimer.current === null) return
    window.clearTimeout(warmTimer.current)
    warmTimer.current = null
  }, [])
  const warmOnRest = useCallback(
    (id: EmojiCategoryId) => {
      cancelWarm()
      if (id === useStore.getState().emojiCategory) return
      warmTimer.current = window.setTimeout(() => {
        warmTimer.current = null
        const catalog = peekEmojiCatalog()
        if (!catalog || id === useStore.getState().emojiCategory) return
        loadGlyphs(entriesForCategory(catalog, id, loadRecents()).slice(0, screenGlyphCount()).map((item) => item.file))
      }, WARM_DWELL_MS)
    },
    [cancelWarm]
  )
  useEffect(() => cancelWarm, [cancelWarm])

  return (
    <div
      className={`emoji-cat-bar${className ? ` ${className}` : ''}`}
      style={{ margin: 0 }}
      onPointerLeave={cancelWarm}
      onPointerDown={cancelWarm}
    >
      <SegmentedControl
        items={shownCats.map((c) => {
          const Icon = CATEGORY_ICONS[c.id]
          return { value: c.id, label: t(c.labelKey), icon: <Icon width={14} height={14} /> }
        })}
        value={category}
        onChange={(val) => selectCategory(val)}
        onHoverItem={warmOnRest}
        ariaLabel={t('emoji.categories')}
        reduceMotion={reduceMotion}
      />
    </div>
  )
}

// Memoised: the picker re-renders every frame while its grid fills in after
// a switch; the bar only needs to when its own props or store values change.
export const EmojiCategoryBar = memo(CategoryBar)

export default EmojiCategoryBar
