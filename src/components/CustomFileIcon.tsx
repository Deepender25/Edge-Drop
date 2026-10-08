import { useState, type ImgHTMLAttributes, type SVGProps, type JSX } from 'react'
import { getFileKind, getFileKindByExt, extOf, fileIconUrl, type FileKind } from '../lib/fileType'

export interface CustomFileIconProps extends ImgHTMLAttributes<HTMLImageElement> {
  ext?: string
  path?: string
  kind?: FileKind
  isDirectory?: boolean
  isFolder?: boolean
  width?: number | string
  height?: number | string
}

/** Micro-mode simplified icons for tiny sizes (width <= 16px) */
function renderMicroIcon(kind: FileKind, color: string): JSX.Element {
  switch (kind) {
    case 'folder':
      return (
        <g stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
        </g>
      )
    case 'image':
      return (
        <g stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8" cy="8" r="1.5" fill={color} />
          <path d="m21 15-5-5L5 21" />
        </g>
      )
    case 'video':
      return (
        <g stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="2" y="4" width="20" height="16" rx="3" />
          <polygon points="10,8 16,12 10,16" fill={color} />
        </g>
      )
    case 'audio':
      return (
        <g stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" fill={color} />
          <circle cx="18" cy="16" r="3" fill={color} />
        </g>
      )
    case 'code':
      return (
        <g stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </g>
      )
    case 'archive':
      return (
        <g stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="2 2" />
          <rect x="10" y="8" width="4" height="5" rx="1" fill={color} />
        </g>
      )
    case 'excel':
      return (
        <g stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="12" y1="3" x2="12" y2="21" />
          <line x1="3" y1="12" x2="21" y2="12" />
        </g>
      )
    case 'executable':
      return (
        <g stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" fill={color} />
          <line x1="9" y1="1" x2="9" y2="4" />
          <line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" />
          <line x1="15" y1="20" x2="15" y2="23" />
        </g>
      )
    case 'pdf':
    case 'word':
    case 'powerpoint':
    case 'text':
    case 'file':
    default:
      return (
        <g stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="12" y2="17" />
        </g>
      )
  }
}

/**
 * Vintage textured folder icons (PNG, resources/file-icons, served over
 * edgelocal://icon/). One static file per kind — no per-mount SVG
 * construction, gradients, or unique gradient IDs. The <=16px micro vector
 * path stays for tiny badges where a raster would soften.
 */
export function CustomFileIcon({
  ext,
  path,
  kind: explicitKind,
  isDirectory,
  isFolder,
  width = 32,
  height,
  style,
  className,
  alt = '',
  ...rest
}: CustomFileIconProps): JSX.Element {
  const numericWidth = typeof width === 'number' ? width : parseInt(String(width), 10) || 32
  const resolvedHeight = height ?? width

  const isDir = Boolean(isDirectory || isFolder)
  const resolvedExt = (ext ?? (path ? extOf(path) : '')).toLowerCase()

  const info = explicitKind
    ? { kind: explicitKind, color: getFileKindByExt(explicitKind, isDir).color, label: explicitKind.toUpperCase() }
    : isDir || resolvedExt === 'folder'
      ? getFileKindByExt('folder', true)
      : resolvedExt
        ? getFileKindByExt(resolvedExt)
        : path
          ? getFileKind(path, isDir)
          : { kind: 'file' as FileKind, color: '#E2E8F0', label: 'FILE' }

  const kind: FileKind = explicitKind ?? info.kind

  // Micro size fallback for 11px–16px badges
  if (numericWidth <= 16) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={width}
        height={resolvedHeight}
        fill="none"
        className={className}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          flexShrink: 0,
          ...style
        }}
        {...(rest as SVGProps<SVGSVGElement>)}
      >
        {renderMicroIcon(kind, info.color)}
      </svg>
    )
  }

  return (
    <img
      src={fileIconUrl(kind)}
      width={width}
      height={resolvedHeight}
      alt={alt}
      draggable={false}
      className={['file-kind-img', className].filter(Boolean).join(' ') || undefined}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        // 3:2 art in the square boxes the vector icons used — letterbox,
        // never stretch. Transparent margins blend into the dark cards.
        objectFit: 'contain',
        ...style
      }}
      {...rest}
    />
  )
}

const FOLDER_MASK_PATH =
  'M 116 136 L 176 136 C 202 136 210 160 238 160 L 398 160 C 411 160 422 171 422 184 L 422 348 C 422 364 410 376 394 376 L 118 376 C 102 376 90 364 90 348 L 90 162 C 90 148 102 136 116 136 Z'

export const FILE_ICON_MASK = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><path fill='black' d='${FOLDER_MASK_PATH}'/></svg>")`

export interface FileStackPhotoProps {
  src?: string
  fallbackSrc?: string
  width?: number | string
  height?: number | string
  className?: string
  style?: React.CSSProperties
  alt?: string
}

/** Render a photo preview masked into the 3D folder silhouette for multi-file bundles */
export function FileStackPhoto({
  src,
  fallbackSrc,
  width = 56,
  height,
  className,
  style,
  alt = ''
}: FileStackPhotoProps): JSX.Element {
  const resolvedHeight = height ?? width
  const [imgSrc, setImgSrc] = useState(src)

  return (
    <div
      className={className}
      style={{
        width,
        height: resolvedHeight,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        maskImage: FILE_ICON_MASK,
        WebkitMaskImage: FILE_ICON_MASK,
        maskSize: '100% 100%',
        WebkitMaskSize: '100% 100%',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.06)',
        ...style
      }}
    >
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={alt}
          onError={() => {
            if (fallbackSrc && imgSrc !== fallbackSrc) {
              setImgSrc(fallbackSrc)
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />
      ) : null}
    </div>
  )
}

