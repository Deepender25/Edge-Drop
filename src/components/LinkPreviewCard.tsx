import React, { useMemo } from 'react'
import { parseUrlPreview, type UrlPreviewInfo } from '../lib/urlPreview'
import { GlobeIcon } from './icons'

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

  return (
    <div
      className={`link-preview-apple${compact ? ' compact' : ''}`}
      onClick={onClick}
    >
      <div className="link-apple-icon-box" aria-hidden>
        <GlobeIcon width={18} height={18} className="link-apple-icon" />
      </div>

      <div className="link-apple-content">
        <div className="link-apple-header">
          <span className="link-apple-service">{info.serviceName}</span>
          <span className="link-apple-dot">·</span>
          <span className="link-apple-domain">{info.domain}</span>
        </div>

        <div className="link-apple-title" title={info.title || info.cleanUrl}>
          {info.title || info.cleanUrl}
        </div>

        <div className="link-apple-path" title={info.cleanUrl}>
          {info.cleanUrl.replace(/^https?:\/\//, '')}
        </div>
      </div>
    </div>
  )
}

export default LinkPreviewCard
