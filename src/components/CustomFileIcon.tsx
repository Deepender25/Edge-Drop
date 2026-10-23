import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes, type SVGProps, type JSX } from 'react'
import { getFileKind, getFileKindByExt, extOf, fileIconUrl, type FileKind } from '../lib/fileType'
import { useIconLayers } from '../lib/iconLayers'
import { ICON_LAYER_PARTS } from '../../shared/fileIconLayers'

export interface CustomFileIconProps extends ImgHTMLAttributes<HTMLImageElement> {
  ext?: string
  path?: string
  kind?: FileKind
  isDirectory?: boolean
  isFolder?: boolean
  width?: number | string
  height?: number | string
  /**
   * Let hovering its card open the folder: the pocket tips forward, the
   * papers rise and fan out (item.css, .file-kind-opening). At rest it is the
   * plain icon; the moving layers are pre-rendered bitmaps (lib/iconLayers).
   */
  layered?: boolean
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
 * Frosted-glass folder icons (SVG, resources/file-icons, served over
 * edgelocal://icon/). One static file per kind, drawn as an <img>: each
 * file is its own document, so its gradient / filter IDs never collide and
 * Chromium caches the raster per size. The files are square and cropped to
 * the folder (viewBox 64 60 384 384 of the 512 art), so the folder fills
 * about 80% of any square box, as the previous art did. The <=16px micro
 * line icons stay for tiny badges, where the folder art turns to a blur.
 */
export function CustomFileIcon({
  ext,
  path,
  kind: explicitKind,
  isDirectory,
  isFolder,
  layered = false,
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

  if (layered) {
    return <OpeningFileIcon kind={kind} width={width} height={resolvedHeight} className={className} style={style} alt={alt} />
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
        // Square art in square boxes; contain keeps it unstretched if a
        // caller ever passes a non-square box.
        objectFit: 'contain',
        ...style
      }}
      {...rest}
    />
  )
}

/**
 * Outline of the folder icons (back panel + front pocket, copied from the
 * SVGs in resources/file-icons) in the same cropped frame, so a photo
 * masked with it lines up with the file icons next to it in a stack.
 */
/**
 * A folder icon that opens when its card is hovered. At rest it shows the
 * plain icon; next to it sit the five layer bitmaps (back, three papers,
 * front pocket) drawn once at this exact size, hidden until hover, when CSS
 * swaps them in and moves them (see .file-kind-opening in item.css). The
 * bitmaps are built the first time its card is hovered; until they are ready
 * the icon simply stays closed.
 */
function OpeningFileIcon({
  kind,
  width,
  height,
  className,
  style,
  alt
}: {
  kind: FileKind
  width: number | string
  height: number | string
  className?: string
  style?: CSSProperties
  alt: string
}): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  // The size it is really shown at (CSS may override the prop, e.g. in the flyout).
  const [cssSize, setCssSize] = useState<number | null>(null)
  useLayoutEffect(() => {
    const w = ref.current?.offsetWidth
    if (w) setCssSize(w)
  }, [width, height])
  // Build on the first hover of the card it sits in (the hover that opens it).
  const [wanted, setWanted] = useState(false)
  useEffect(() => {
    if (wanted) return
    const card = ref.current?.closest('.item-main, .flyout-subitem')
    if (!card) return
    const onEnter = (): void => setWanted(true)
    card.addEventListener('pointerenter', onEnter, { once: true })
    return () => card.removeEventListener('pointerenter', onEnter)
  }, [wanted])
  const layers = useIconLayers(kind, cssSize, wanted)
  // Layers that appear while the card is already hovered must first take
  // their closed style, or they would jump open with no motion: style them,
  // then arm the opening rules (CSS keys them on .is-armed).
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!layers || armed) return
    const el = ref.current?.querySelector('.fko-layers')
    if (el) void getComputedStyle(el).visibility
    setArmed(true)
  }, [layers, armed])

  return (
    <span
      ref={ref}
      className={['file-kind-img', 'file-kind-opening', armed ? 'is-armed' : '', className].filter(Boolean).join(' ')}
      style={{ width, height, flexShrink: 0, ...style }}
    >
      <img className="fko-plain" src={fileIconUrl(kind)} alt={alt} draggable={false} />
      {layers && (
        <span className="fko-layers" aria-hidden="true">
          {ICON_LAYER_PARTS.map((part) => (
            <img key={part} className={`fil fil-${part}`} src={layers[part]} alt="" draggable={false} />
          ))}
        </span>
      )}
    </span>
  )
}

const FOLDER_MASK_SHAPES =
  "<g transform='translate(0 14)' fill='black'>" +
  "<rect x='120' y='118' width='272' height='246' rx='24'/>" +
  "<path d='M124 180 L250 180 C262 180 268 184 274 192 L290 214 C295 221 300 224 310 224 L390 224 C402 224 410 232 408 244 L398 344 C396 356 388 364 376 364 L136 364 C124 364 116 356 114 344 L104 200 C103 188 112 180 124 180 Z'/>" +
  '</g>'

export const FILE_ICON_MASK = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='64 60 384 384'>${FOLDER_MASK_SHAPES}</svg>")`

export interface FileStackPhotoProps {
  src?: string
  fallbackSrc?: string
  width?: number | string
  height?: number | string
  className?: string
  style?: React.CSSProperties
  alt?: string
}

/** Render a photo preview masked into the folder silhouette for multi-file bundles */
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

