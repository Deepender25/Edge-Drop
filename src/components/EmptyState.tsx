import { useStore } from '../store/appStore'
import { useTranslation } from '../i18n'

const FILTER_KIND: Record<string, string> = { text: 'Text', links: 'Links', images: 'Images', files: 'Files', colors: 'Colors' }

export function EmptyState({ filtered }: { filtered: boolean }) {
  const { t } = useTranslation()
  const typeFilter = useStore((s) => s.typeFilter)

  let title = filtered ? t('emptyState.noResultsFound') : t('emptyState.shelfEmpty')
  let hint = filtered ? t('emptyState.noResultsHint') : t('emptyState.shelfEmptyHint')

  // a whole sentence per filter: the word for the kind must agree with the rest of it
  const kind = FILTER_KIND[typeFilter]
  if (kind) {
    title = t(`emptyState.none${kind}`)
    hint = t(`emptyState.hint${kind}`)
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
