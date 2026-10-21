/**
 * TagSuggest — while the search ends in `#word`, a row of matching tags
 * (most used first, with counts). Clicking one completes the query.
 *
 * Side docks: a row between the search box and the list. Top dock: a strip
 * floating over the top of the list, so the fixed-height cards never move.
 * Buttons never take focus, so typing continues in the search box.
 */
import { useMemo } from 'react'
import { useStore } from '../store/appStore'
import { useTranslation } from '../i18n'
import { activeTagPrefix, completeTag, suggestTags, tagCounts } from '../lib/tagQuery'

export function TagSuggest({ isHorizontal }: { isHorizontal: boolean }) {
  const { t } = useTranslation()
  const query = useStore((s) => s.query)
  const items = useStore((s) => s.items)
  const prefix = activeTagPrefix(query)
  const active = prefix !== null
  const counts = useMemo(() => (active ? tagCounts(items) : null), [items, active])
  const suggestions = useMemo(
    () => (prefix === null || !counts ? [] : suggestTags(counts, prefix, { limit: isHorizontal ? 6 : 8 })),
    [counts, prefix, isHorizontal]
  )
  if (suggestions.length === 0) return null

  return (
    <div className={`tag-suggest${isHorizontal ? ' is-horizontal' : ''}`} role="listbox" aria-label={t('menu.tags')}>
      {suggestions.map((s) => (
        <button
          key={s.tag}
          type="button"
          role="option"
          aria-selected={false}
          className="tag-suggest-chip"
          tabIndex={-1}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => useStore.getState().setQuery(completeTag(useStore.getState().query, s.tag))}
        >
          <span className="tag-suggest-name">#{s.tag}</span>
          <span className="tag-suggest-count">{s.count}</span>
        </button>
      ))}
    </div>
  )
}
