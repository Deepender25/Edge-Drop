import { useStore } from '../store/appStore'
import { useTranslation } from '../i18n'

export function EmptyState({ filtered }: { filtered: boolean }) {
  const { t } = useTranslation()
  const typeFilter = useStore((s) => s.typeFilter)

  let title = filtered ? t('emptyState.noResultsFound') : t('emptyState.shelfEmpty')
  let hint = filtered ? t('emptyState.noResultsHint') : t('emptyState.shelfEmptyHint')

  if (typeFilter !== 'all') {
    const labelKey =
      typeFilter === 'text'
        ? 'emptyState.textClips'
        : typeFilter === 'links'
          ? 'emptyState.links'
          : typeFilter === 'images'
            ? 'emptyState.images'
            : typeFilter === 'colors'
              ? 'filters.colors'
              : 'emptyState.files'
    const label = (t(labelKey) || 'colors').toLowerCase()
    title = t('emptyState.noClipsFound', { type: label })
    hint = t('emptyState.copyTypeHint', { type: label })
  }

  return (
    <div className="empty">
      <div className="empty-text">
        <div className="big">{title}</div>
        <div className="hint">{hint}</div>
      </div>
    </div>
  )
}
