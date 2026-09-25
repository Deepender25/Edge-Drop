import { useCallback, useMemo, useState, useEffect } from 'react'
import {
  CATEGORY_ORDER,
  type EmojiCategoryId
} from '../lib/emoji/catalog'
import { loadRecents } from '../lib/emoji/prefs'
import { useStore } from '../store/appStore'
import { playButtonClickSound } from '../lib/soundEffects'
import { useTranslation } from '../i18n'
import RubberSegment from './RubberSegment'
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
  isHorizontal?: boolean
  className?: string
  /** Hover-intent hook: warm a category's first screen before it's clicked. */
  onHoverCategory?: (id: EmojiCategoryId) => void
}

export function EmojiCategoryBar({ isHorizontal = false, className = '', onHoverCategory }: EmojiCategoryBarProps) {
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

  const slotSize = isHorizontal ? 28 : 24
  const trackHeight = isHorizontal ? 30 : 28
  const iconSize = isHorizontal ? 14 : 14

  return (
    <div
      className={`emoji-cat-bar${className ? ` ${className}` : ''}`}
      role="tablist"
      aria-label={t('emoji.categories')}
      style={{ margin: 0 }}
    >
      <RubberSegment
        items={shownCats.map((c) => {
          const Icon = CATEGORY_ICONS[c.id]
          const label = t(c.labelKey)
          return {
            value: c.id,
            label,
            title: label,
            icon: <Icon width={iconSize} height={iconSize} />
          }
        })}
        value={category}
        onChange={(val) => selectCategory(val as EmojiCategoryId)}
        trackColor="#141414"
        thumbColor="#ffffff"
        textColor="rgba(255, 255, 255, 0.72)"
        activeTextColor="#000000"
        size="custom"
        height={trackHeight}
        minWidth={slotSize}
        radius={9999}
        inset={2}
        equalSlots={true}
        stretch={80}
        squash={2}
        glide={60}
        draggable={true}
        onHoverItem={onHoverCategory ? (val) => onHoverCategory(val as EmojiCategoryId) : undefined}
        aria-label={t('emoji.categories')}
      />
    </div>
  )
}

export default EmojiCategoryBar
