import React, { useMemo } from 'react'
import { parseUrlPreview, type UrlPreviewInfo } from '../lib/urlPreview'
import { LinkIcon } from './icons'

interface LinkPreviewCardProps {
  url: string
  /** The page title copied with the link, when the browser provided one. */
  pageTitle?: string
  compact?: boolean
  onClick?: (e: React.MouseEvent) => void
}

/**
 * A link card, worked out offline (lib/urlPreview.ts):
 *   top    — the site's name and what kind of page it is ("GitHub · Issue")
 *   body   — the page title copied with the link, else what the link itself
 *            tells (repo, article, search, place), else the link
 *   bottom — the link, readable, when the body shows a title
 */
export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({
  url,
  pageTitle,
  compact = false,
  onClick
}) => {
  const info: UrlPreviewInfo = useMemo(() => parseUrlPreview(url), [url])

  const top = info.subtitle ? `${info.serviceName} · ${info.subtitle}` : info.serviceName
  const link = info.displayUrl || info.url

  // The body says something the other two lines don't
  const candidate = (pageTitle || info.title || '').trim()
  const lower = candidate.toLowerCase()
  const hasTitle = Boolean(
    candidate &&
    lower !== link.toLowerCase() &&
    lower !== info.domain.toLowerCase() &&
    lower !== info.serviceName.toLowerCase()
  )

  return (
    <div
      className={`link-card${compact ? ' compact' : ''}`}
      onClick={onClick}
    >
      <div className="link-card-top">
        <LinkIcon width={12} height={12} className="link-card-icon" />
        <span className="link-card-domain" title={top}>{top}</span>
      </div>

      <div className="link-card-body" title={hasTitle ? candidate : link}>
        {hasTitle ? candidate : link}
      </div>

      {hasTitle && (
        <div className="link-card-url" title={link}>
          {link}
        </div>
      )}
    </div>
  )
}

export default LinkPreviewCard
