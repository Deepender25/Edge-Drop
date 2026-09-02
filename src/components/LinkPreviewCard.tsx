import React, { useMemo } from 'react'
import { parseUrlPreview, type UrlPreviewInfo } from '../lib/urlPreview'
import { LinkIcon } from './icons'

interface LinkPreviewCardProps {
  url: string
  compact?: boolean
  onClick?: (e: React.MouseEvent) => void
}

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({
  url,
  compact = false,
  onClick
}) => {
  const info: UrlPreviewInfo = useMemo(() => parseUrlPreview(url), [url])

  // Clean, professional display:
  // Top: Link SVG + Domain (e.g. 🔗 github.com)
  const domain = info.domain || 'link'

  // Main: Clean, human-readable link target or title
  const displayTitle = info.title || info.cleanUrl.replace(/^https?:\/\//, '')

  return (
    <div
      className={`link-card${compact ? ' compact' : ''}`}
      onClick={onClick}
    >
      <div className="link-card-top">
        <LinkIcon width={12} height={12} className="link-card-icon" />
        <span className="link-card-domain">{domain}</span>
      </div>

      <div className="link-card-body" title={info.cleanUrl}>
        {displayTitle}
      </div>
    </div>
  )
}

export default LinkPreviewCard
