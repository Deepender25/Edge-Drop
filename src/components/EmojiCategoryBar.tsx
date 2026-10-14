import { useCallback, useMemo, useState, useEffect } from 'react'
import {
  CATEGORY_ORDER,
  type EmojiCategoryId
} from '../lib/emoji/catalog'
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
  /** Hover-intent hook: warm a category's first screen before it's clicked. */
  onHoverCategory?: (id: EmojiCategoryId) => void
}

export function EmojiCategoryBar({ className = '', onHoverCategory }: EmojiCategoryBarProps) {
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

  return (
    <div className={`emoji-cat-bar${className ? ` ${className}` : ''}`} style={{ margin: 0 }}>
      <SegmentedControl
        items={shownCats.map((c) => {
          const Icon = CATEGORY_ICONS[c.id]
          return { value: c.id, label: t(c.labelKey), icon: <Icon width={14} height={14} /> }
        })}
        value={category}
        onChange={(val) => selectCategory(val)}
        onHoverItem={onHoverCategory}
        ariaLabel={t('emoji.categories')}
        reduceMotion={reduceMotion}
      />
    </div>
  )
}

export default EmojiCategoryBar
