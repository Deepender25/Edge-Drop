/**
 * Zero-cost offline URL preview parser.
 * Extracts rich metadata, brand badges, and titles from URLs in < 0.1ms without internet.
 */

export interface UrlPreviewInfo {
  url: string
  domain: string
  serviceName: string
  title?: string
  brandColor: string
  faviconUrl: string
}

const BRAND_PRESETS: Record<string, { serviceName: string; brandColor: string }> = {
  'github.com': { serviceName: 'GitHub', brandColor: '#24292e' },
  'youtube.com': { serviceName: 'YouTube', brandColor: '#ff0000' },
  'youtu.be': { serviceName: 'YouTube', brandColor: '#ff0000' },
  'pinterest.com': { serviceName: 'Pinterest', brandColor: '#e60023' },
  'instagram.com': { serviceName: 'Instagram', brandColor: '#e1306c' },
  'twitter.com': { serviceName: 'X / Twitter', brandColor: '#1da1f2' },
  'x.com': { serviceName: 'X', brandColor: '#14171a' },
  'reddit.com': { serviceName: 'Reddit', brandColor: '#ff4500' },
  'linkedin.com': { serviceName: 'LinkedIn', brandColor: '#0a66c2' },
  'wikipedia.org': { serviceName: 'Wikipedia', brandColor: '#636466' },
  'figma.com': { serviceName: 'Figma', brandColor: '#f24e1e' },
  'dribbble.com': { serviceName: 'Dribbble', brandColor: '#ea4c89' },
  'stackoverflow.com': { serviceName: 'Stack Overflow', brandColor: '#f48024' },
  'spotify.com': { serviceName: 'Spotify', brandColor: '#1ed760' },
  'medium.com': { serviceName: 'Medium', brandColor: '#000000' },
  'npmjs.com': { serviceName: 'NPM', brandColor: '#cb3837' },
  'amazon.com': { serviceName: 'Amazon', brandColor: '#ff9900' },
  'notion.so': { serviceName: 'Notion', brandColor: '#000000' },
  'vercel.com': { serviceName: 'Vercel', brandColor: '#000000' },
  'discord.com': { serviceName: 'Discord', brandColor: '#5865f2' },
  'facebook.com': { serviceName: 'Facebook', brandColor: '#1877f2' },
  'openai.com': { serviceName: 'ChatGPT', brandColor: '#10a37f' },
  'chatgpt.com': { serviceName: 'ChatGPT', brandColor: '#10a37f' },
  'docs.google.com': { serviceName: 'Google Docs', brandColor: '#4285f4' },
  'drive.google.com': { serviceName: 'Google Drive', brandColor: '#0f9d58' },
}

/** decodeURIComponent throws URIError on truncated %XX — never throw from render. */
export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function parseUrlPreview(rawUrl: string): UrlPreviewInfo {
  let urlObj: URL | null = null
  try {
    urlObj = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`)
  } catch {
    return {
      url: rawUrl,
      domain: rawUrl,
      serviceName: 'Web Link',
      brandColor: '#3f3f46',
      faviconUrl: '',
    }
  }

  const hostname = urlObj.hostname.replace(/^www\./, '').toLowerCase()
  const path = urlObj.pathname
  const pathSegments = path.split('/').filter(Boolean)

  let serviceName = ''
  let brandColor = '#3f3f46'
  let title: string | undefined = undefined

  // Match brand presets
  for (const [key, preset] of Object.entries(BRAND_PRESETS)) {
    if (hostname === key || hostname.endsWith(`.${key}`)) {
      serviceName = preset.serviceName
      brandColor = preset.brandColor
      break
    }
  }

  // Fallback Service Name from Domain
  if (!serviceName) {
    const parts = hostname.split('.')
    const mainName = parts.length >= 2 ? parts[parts.length - 2] : hostname
    serviceName = mainName.charAt(0).toUpperCase() + mainName.slice(1)
  }

  // Smart Offline Title & Breadcrumb Extraction
  if (hostname.includes('github.com')) {
    if (pathSegments.length >= 2) {
      const repo = `${pathSegments[0]}/${pathSegments[1]}`
      if (pathSegments.length >= 4 && (pathSegments[2] === 'issues' || pathSegments[2] === 'pull')) {
        title = `${repo} · ${pathSegments[2] === 'issues' ? 'Issue' : 'PR'} #${pathSegments[3]}`
      } else {
        title = repo
      }
    }
  } else if (hostname.includes('pinterest.com')) {
    if (pathSegments.length >= 2 && pathSegments[0] === 'pin') {
      title = `Pin #${pathSegments[1]}`
    } else if (pathSegments.length >= 1) {
      title = `@${pathSegments[0]}`
    }
  } else if (hostname.includes('wikipedia.org')) {
    if (pathSegments.length >= 2 && pathSegments[0] === 'wiki') {
      title = safeDecodeURIComponent(pathSegments[1]).replace(/_/g, ' ')
    }
  } else if (hostname.includes('reddit.com')) {
    if (pathSegments.length >= 2 && pathSegments[0] === 'r') {
      title = `r/${pathSegments[1]}`
    }
  } else if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
    const v = urlObj.searchParams.get('v')
    if (v) {
      title = `Video (${v})`
    } else if (pathSegments.length > 0) {
      title = `Video (${pathSegments[0]})`
    }
  } else if (pathSegments.length > 0) {
    const lastSeg = pathSegments[pathSegments.length - 1]
    const cleanSeg = safeDecodeURIComponent(lastSeg)
      .replace(/[-_]/g, ' ')
      .replace(/\.(html?|php|aspx?)$/i, '')
    if (cleanSeg.length > 3 && !/^[0-9a-f]{8,}$/i.test(cleanSeg) && !/%[0-9A-Fa-f]{0,1}$/.test(lastSeg)) {
      title = cleanSeg.charAt(0).toUpperCase() + cleanSeg.slice(1)
    }
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`

  return {
    url: rawUrl,
    domain: hostname,
    serviceName,
    title,
    brandColor,
    faviconUrl,
  }
}
