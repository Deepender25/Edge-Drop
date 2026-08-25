import { useId, useEffect, useState, type SVGProps, type JSX } from 'react'
import { getFileKind, getFileKindByExt, extOf, type FileKind } from '../lib/fileType'

export interface CustomFileIconProps extends SVGProps<SVGSVGElement> {
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
        <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
        </g>
      )
    case 'image':
      return (
        <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8" cy="8" r="1.5" fill={color} />
          <path d="m21 15-5-5L5 21" />
        </g>
      )
    case 'video':
      return (
        <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="2" y="4" width="20" height="16" rx="3" />
          <polygon points="10,8 16,12 10,16" fill={color} />
        </g>
      )
    case 'audio':
      return (
        <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" fill={color} />
          <circle cx="18" cy="16" r="3" fill={color} />
        </g>
      )
    case 'code':
      return (
        <g stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </g>
      )
    case 'archive':
      return (
        <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="2 2" />
          <rect x="10" y="8" width="4" height="5" rx="1" fill={color} />
        </g>
      )
    case 'excel':
      return (
        <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="12" y1="3" x2="12" y2="21" />
          <line x1="3" y1="12" x2="21" y2="12" />
        </g>
      )
    case 'executable':
      return (
        <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
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
        <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="12" y2="17" />
        </g>
      )
  }
}

/**
 * 3D Layered Category-Based Pastel Folder Icon Suite
 * 1:1 Implementation of the exact SVG designs in "new icons" directory.
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
  ...rest
}: CustomFileIconProps): JSX.Element {
  const uid = useId().replace(/:/g, '')
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
          : { kind: 'file' as FileKind, color: '#B0C0D0', label: 'FILE' }

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
        {...rest}
      >
        {renderMicroIcon(kind, info.color)}
      </svg>
    )
  }

  const folderShadowId = `folderShadow-${uid}`
  const sheetShadowId = `sheetShadow-${uid}`
  const glyphShadowId = `glyphShadow-${uid}`

  // Common SVG wrapper props
  const svgProps = {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 512 512',
    width,
    height: resolvedHeight,
    fill: 'none',
    className,
    style: {
      display: 'inline-block',
      verticalAlign: 'middle',
      flexShrink: 0,
      ...style
    },
    ...rest
  }

  // 1. Folders (folder svg icon.svg)
  if (kind === 'folder') {
    return (
      <svg {...svgProps}>
        <defs>
          <filter id={folderShadowId} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#D97706" floodOpacity="0.12" />
          </filter>
        </defs>
        <g filter={`url(#${folderShadowId})`}>
          {/* 1. Folder Back Plate & Tab */}
          <path
            d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z"
            fill="#FDE68A"
          />
          {/* 2. Paper Sheet Peeking Inside */}
          <path
            d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z"
            fill="#FFFDF5"
          />
          {/* 3. Clean Yellow Front Flap */}
          <path
            d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z"
            fill="#FBBF24"
          />
        </g>
      </svg>
    )
  }

  // 2. Executable / Installer Files (.exe, .msi, .apk, etc. - exe svg icon.svg)
  if (kind === 'executable') {
    return (
      <svg {...svgProps}>
        <defs>
          <filter id={glyphShadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#3730A3" floodOpacity="0.22" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.05" />
          </filter>
          <filter id={folderShadowId} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#4338CA" floodOpacity="0.12" />
          </filter>
        </defs>
        <g filter={`url(#${folderShadowId})`}>
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#C7D2FE" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#F5F7FF" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#93A4FC" />
          <g filter={`url(#${glyphShadowId})`}>
            <g stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round">
              <line x1="226" y1="235" x2="226" y2="218" />
              <line x1="256" y1="235" x2="256" y2="218" />
              <line x1="286" y1="235" x2="286" y2="218" />
              <line x1="226" y1="343" x2="226" y2="360" />
              <line x1="256" y1="343" x2="256" y2="360" />
              <line x1="286" y1="343" x2="286" y2="360" />
              <line x1="202" y1="259" x2="185" y2="259" />
              <line x1="202" y1="289" x2="185" y2="289" />
              <line x1="202" y1="319" x2="185" y2="319" />
              <line x1="310" y1="259" x2="327" y2="259" />
              <line x1="310" y1="289" x2="327" y2="289" />
              <line x1="310" y1="319" x2="327" y2="319" />
            </g>
            <rect x="202" y="235" width="108" height="108" rx="20" fill="#FFFFFF" />
            <rect x="226" y="259" width="60" height="60" rx="12" fill="#93A4FC" />
          </g>
        </g>
      </svg>
    )
  }

  // 3. Audio Files (.mp3, .wav, .flac, etc. - audio svg icon.svg)
  if (kind === 'audio') {
    return (
      <svg {...svgProps}>
        <defs>
          <filter id={glyphShadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#6B21A8" floodOpacity="0.22" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.05" />
          </filter>
          <filter id={folderShadowId} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#7E22CE" floodOpacity="0.12" />
          </filter>
        </defs>
        <g filter={`url(#${folderShadowId})`}>
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#E2D0FE" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#FAF5FF" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#C495FD" />
          <g transform="translate(167.8, 190.6) scale(12)" filter={`url(#${glyphShadowId})`} fill="#FFFFFF">
            <path d="M 10.888 2.518 L 6.132 3.477 C 5.98 3.508 5.86 3.565 5.76 3.65 C 5.66 3.735 5.6 3.86 5.6 4.02 C 5.596 4.047 5.59 4.1 5.59 4.18 L 5.59 10.132 C 5.59 10.272 5.578 10.407 5.484 10.522 C 5.389 10.637 5.274 10.672 5.137 10.699 L 4.827 10.762 C 4.434 10.842 4.177 10.895 3.946 10.985 C 3.738 11.066 3.555 11.186 3.427 11.318 C 3.25 11.5 3.12 11.75 3.095 12.313 C 3.126 12.61 3.261 12.895 3.49 13.105 C 3.646 13.247 3.84 13.355 4.068 13.401 C 4.304 13.448 4.558 13.432 4.926 13.358 C 5.122 13.318 5.306 13.256 5.481 13.153 C 5.656 13.05 5.81 12.89 5.919 12.748 C 6.028 12.606 6.12 12.36 6.152 12.198 C 6.194 11.996 6.204 11.812 6.204 11.61 L 6.204 6.347 C 6.204 6.071 6.284 5.997 6.506 5.943 C 6.53 5.938 10.46 5.146 10.644 5.11 C 10.901 5.061 11.022 5.135 11.022 5.404 L 11.022 8.928 C 11.022 9.068 11.021 9.208 10.926 9.324 C 10.832 9.439 10.715 9.474 10.578 9.502 L 10.268 9.564 C 9.875 9.644 9.619 9.697 9.388 9.787 C 9.18 9.868 8.997 9.988 8.868 10.121 C 8.69 10.3 8.56 10.55 8.528 11.115 C 8.558 11.412 8.702 11.697 8.932 11.907 C 9.088 12.049 9.282 12.157 9.51 12.203 C 9.745 12.25 10 12.234 10.367 12.16 C 10.564 12.12 10.747 12.058 10.923 11.955 C 11.098 11.852 11.251 11.692 11.361 11.55 C 11.467 11.393 11.546 11.206 11.594 11 C 11.636 10.798 11.646 10.614 11.646 10.412 L 11.646 2.812 C 11.646 2.666 11.593 2.562 11.486 2.502 C 11.38 2.44 11.19 2.456 10.888 2.518 Z" />
          </g>
        </g>
      </svg>
    )
  }

  // 4. Code & Developer Files (.js, .ts, .py, .html, .css, etc. - code svg icon.svg)
  if (kind === 'code') {
    return (
      <svg {...svgProps}>
        <defs>
          <filter id={glyphShadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#0369A1" floodOpacity="0.18" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.05" />
          </filter>
          <filter id={folderShadowId} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#0284C7" floodOpacity="0.12" />
          </filter>
        </defs>
        <g filter={`url(#${folderShadowId})`}>
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#86DDFB" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#F0FBFF" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#53CAF7" />
          <g filter={`url(#${glyphShadowId})`} fill="none" stroke="#FFFFFF" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 200 240 L 156 289 L 200 338" />
            <line x1="282" y1="222" x2="230" y2="356" />
            <path d="M 312 240 L 356 289 L 312 338" />
          </g>
        </g>
      </svg>
    )
  }

  // 5. Word Documents (.doc, .docx, .odt, etc. - doc svg icon.svg)
  if (kind === 'word') {
    return (
      <svg {...svgProps}>
        <defs>
          <filter id={sheetShadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.06" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.04" />
          </filter>
          <filter id={folderShadowId} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#000000" floodOpacity="0.08" />
          </filter>
        </defs>
        <g filter={`url(#${folderShadowId})`}>
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#9DC5FA" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#F2F7FE" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#7BAFF8" />
          <g filter={`url(#${sheetShadowId})`}>
            <path d="M 204 200 C 195 200 188 207 188 216 L 188 364 C 188 373 195 380 204 380 L 308 380 C 317 380 324 373 324 364 L 324 244 C 324 240 322 236 319 233 L 291 205 C 288 202 284 200 280 200 Z" fill="#F2F7FE" />
            <path d="M 281 201 L 281 232 C 281 238 286 243 292 243 L 323 243" fill="none" stroke="#7BAFF8" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <text x="210" y="278" fill="#7BAFF8" fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" fontSize="52" fontWeight="800" letterSpacing="-0.5" textAnchor="start">W</text>
            <line x1="210" y1="306" x2="302" y2="306" stroke="#7BAFF8" strokeWidth="7" strokeLinecap="round" />
            <line x1="210" y1="328" x2="302" y2="328" stroke="#7BAFF8" strokeWidth="7" strokeLinecap="round" />
            <line x1="210" y1="350" x2="258" y2="350" stroke="#7BAFF8" strokeWidth="7" strokeLinecap="round" />
          </g>
        </g>
      </svg>
    )
  }

  // 6. Image Files (.png, .jpg, .webp, .svg, etc. - imge svg icon.svg)
  if (kind === 'image') {
    return (
      <svg {...svgProps}>
        <defs>
          <filter id={glyphShadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#6B4F3B" floodOpacity="0.22" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.05" />
          </filter>
          <filter id={folderShadowId} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#8C6A4F" floodOpacity="0.14" />
          </filter>
        </defs>
        <g filter={`url(#${folderShadowId})`}>
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#DFCEBC" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#FFFDF9" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#BA9B7B" />
          <g filter={`url(#${glyphShadowId})`}>
            <circle cx="272" cy="260" r="14" fill="#FFFFFF" />
            <path d="M 178 346 L 178 326 L 230 274 L 266 308 L 298 282 L 334 324 L 334 346 Z" fill="#FFFFFF" />
            <rect x="176" y="228" width="160" height="122" rx="18" fill="none" stroke="#FFFFFF" strokeWidth="12" />
          </g>
        </g>
      </svg>
    )
  }

  // 7. PDF Documents (.pdf - pdf svg icon.svg)
  if (kind === 'pdf') {
    return (
      <svg {...svgProps}>
        <defs>
          <filter id={sheetShadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.06" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.04" />
          </filter>
          <filter id={folderShadowId} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#000000" floodOpacity="0.08" />
          </filter>
        </defs>
        <g filter={`url(#${folderShadowId})`}>
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#FF92A0" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#FFF0F2" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#FF7C8E" />
          <g filter={`url(#${sheetShadowId})`}>
            <path d="M 204 200 C 195 200 188 207 188 216 L 188 364 C 188 373 195 380 204 380 L 308 380 C 317 380 324 373 324 364 L 324 244 C 324 240 322 236 319 233 L 291 205 C 288 202 284 200 280 200 Z" fill="#FFF0F2" />
            <path d="M 281 201 L 281 232 C 281 238 286 243 292 243 L 323 243" fill="none" stroke="#FF7C8E" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <text x="256" y="302" fill="#FF7C8E" fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" fontSize="38" fontWeight="800" letterSpacing="0.5" textAnchor="middle">PDF</text>
            <line x1="208" y1="330" x2="304" y2="330" stroke="#FF7C8E" strokeWidth="7" strokeLinecap="round" />
            <line x1="208" y1="352" x2="304" y2="352" stroke="#FF7C8E" strokeWidth="7" strokeLinecap="round" />
          </g>
        </g>
      </svg>
    )
  }

  // 8. Presentation Slides (.ppt, .pptx, .key, etc. - ppt svg icon.svg)
  if (kind === 'powerpoint') {
    return (
      <svg {...svgProps}>
        <defs>
          <filter id={sheetShadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.06" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.04" />
          </filter>
          <filter id={folderShadowId} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#000000" floodOpacity="0.08" />
          </filter>
        </defs>
        <g filter={`url(#${folderShadowId})`}>
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#FFC492" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#FFF8F2" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#FFA25B" />
          <g filter={`url(#${sheetShadowId})`}>
            <line x1="256" y1="306" x2="256" y2="368" stroke="#FFF8F2" strokeWidth="8" strokeLinecap="round" />
            <line x1="256" y1="312" x2="222" y2="368" stroke="#FFF8F2" strokeWidth="8" strokeLinecap="round" />
            <line x1="256" y1="312" x2="290" y2="368" stroke="#FFF8F2" strokeWidth="8" strokeLinecap="round" />
            <rect x="182" y="196" width="148" height="14" rx="7" fill="#FFF8F2" />
            <rect x="188" y="210" width="136" height="96" rx="8" fill="#FFF8F2" />
            <path d="M 252 230 A 28 28 0 1 0 273 277 L 252 258 Z" fill="#FFA25B" />
            <path d="M 260 228 A 28 28 0 0 1 288 255 L 260 255 Z" fill="#FFA25B" />
            <path d="M 288 261 A 28 28 0 0 1 279 280 L 260 261 Z" fill="#FFA25B" />
          </g>
        </g>
      </svg>
    )
  }

  // 9. Spreadsheet & Data Files (.xlsx, .xls, .csv, etc. - sheet svg icon.svg)
  if (kind === 'excel') {
    return (
      <svg {...svgProps}>
        <defs>
          <filter id={sheetShadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.06" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.04" />
          </filter>
          <filter id={folderShadowId} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#000000" floodOpacity="0.08" />
          </filter>
        </defs>
        <g filter={`url(#${folderShadowId})`}>
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#7EE6BC" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#F0FDF8" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#52D7A4" />
          <g filter={`url(#${sheetShadowId})`}>
            <path d="M 204 200 C 195 200 188 207 188 216 L 188 364 C 188 373 195 380 204 380 L 308 380 C 317 380 324 373 324 364 L 324 244 C 324 240 322 236 319 233 L 291 205 C 288 202 284 200 280 200 Z" fill="#F0FDF8" />
            <path d="M 281 201 L 281 232 C 281 238 286 243 292 243 L 323 243" fill="none" stroke="#52D7A4" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="210" y="262" width="92" height="86" rx="8" fill="none" stroke="#52D7A4" strokeWidth="5" />
            <line x1="210" y1="290" x2="302" y2="290" stroke="#52D7A4" strokeWidth="5" />
            <line x1="210" y1="319" x2="302" y2="319" stroke="#52D7A4" strokeWidth="5" />
            <line x1="241" y1="262" x2="241" y2="348" stroke="#52D7A4" strokeWidth="5" />
            <line x1="271" y1="262" x2="271" y2="348" stroke="#52D7A4" strokeWidth="5" />
          </g>
        </g>
      </svg>
    )
  }

  // 10. Plain Text & Notes (.txt, .md, .log, etc. - text svg icon.svg)
  if (kind === 'text') {
    return (
      <svg {...svgProps}>
        <defs>
          <filter id={sheetShadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.06" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.04" />
          </filter>
          <filter id={folderShadowId} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#4A5F3B" floodOpacity="0.14" />
          </filter>
        </defs>
        <g filter={`url(#${folderShadowId})`}>
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#CEDDC3" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#F8FAF6" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#8CA77B" />
          <g filter={`url(#${sheetShadowId})`}>
            <path d="M 204 200 C 195 200 188 207 188 216 L 188 364 C 188 373 195 380 204 380 L 308 380 C 317 380 324 373 324 364 L 324 244 C 324 240 322 236 319 233 L 291 205 C 288 202 284 200 280 200 Z" fill="#F8FAF6" />
            <path d="M 281 201 L 281 232 C 281 238 286 243 292 243 L 323 243" fill="none" stroke="#8CA77B" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="210" y1="268" x2="256" y2="268" stroke="#8CA77B" strokeWidth="7" strokeLinecap="round" />
            <line x1="210" y1="294" x2="300" y2="294" stroke="#8CA77B" strokeWidth="7" strokeLinecap="round" />
            <line x1="210" y1="320" x2="300" y2="320" stroke="#8CA77B" strokeWidth="7" strokeLinecap="round" />
            <line x1="210" y1="346" x2="276" y2="346" stroke="#8CA77B" strokeWidth="7" strokeLinecap="round" />
          </g>
        </g>
      </svg>
    )
  }

  // 11. Video & Cinema Files (.mp4, .mkv, .mov, etc. - vidoe svg icon.svg)
  if (kind === 'video') {
    return (
      <svg {...svgProps}>
        <defs>
          <filter id={sheetShadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.06" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.04" />
          </filter>
          <filter id={folderShadowId} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#1E293B" floodOpacity="0.14" />
          </filter>
        </defs>
        <g filter={`url(#${folderShadowId})`}>
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#94A3B8" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#F8FAFC" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#64748B" />
          <g filter={`url(#${sheetShadowId})`}>
            <rect x="176" y="224" width="160" height="128" rx="20" fill="#F8FAFC" />
            <rect x="192" y="240" width="16" height="16" rx="4" fill="#64748B" />
            <rect x="192" y="266.67" width="16" height="16" rx="4" fill="#64748B" />
            <rect x="192" y="293.33" width="16" height="16" rx="4" fill="#64748B" />
            <rect x="192" y="320" width="16" height="16" rx="4" fill="#64748B" />
            <rect x="216" y="240" width="80" height="96" rx="8" fill="#64748B" />
            <rect x="304" y="240" width="16" height="16" rx="4" fill="#64748B" />
            <rect x="304" y="266.67" width="16" height="16" rx="4" fill="#64748B" />
            <rect x="304" y="293.33" width="16" height="16" rx="4" fill="#64748B" />
            <rect x="304" y="320" width="16" height="16" rx="4" fill="#64748B" />
            <path d="M 243 274 C 243 271 246.5 269 249.5 270.8 L 269.5 284.8 C 272.5 286.5 272.5 289.5 269.5 291.2 L 249.5 305.2 C 246.5 307 243 305 243 302 Z" fill="#FFFFFF" />
          </g>
        </g>
      </svg>
    )
  }

  // 12. Compressed Archives (.zip, .rar, .7z, etc. - zip svg icon.svg)
  if (kind === 'archive') {
    return (
      <svg {...svgProps}>
        <defs>
          <filter id={glyphShadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#B45309" floodOpacity="0.22" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.05" />
          </filter>
          <filter id={folderShadowId} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#D97706" floodOpacity="0.12" />
          </filter>
        </defs>
        <g filter={`url(#${folderShadowId})`}>
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#FDE68A" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#FFFDF5" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#FBBF24" />
          <g filter={`url(#${glyphShadowId})`}>
            <line x1="256" y1="178" x2="256" y2="284" stroke="#FFFDF5" strokeWidth="6" strokeLinecap="round" />
            <rect x="236" y="184" width="20" height="6" rx="3" fill="#FFFDF5" />
            <rect x="236" y="204" width="20" height="6" rx="3" fill="#FFFDF5" />
            <rect x="236" y="224" width="20" height="6" rx="3" fill="#FFFDF5" />
            <rect x="236" y="244" width="20" height="6" rx="3" fill="#FFFDF5" />
            <rect x="236" y="264" width="20" height="6" rx="3" fill="#FFFDF5" />
            <rect x="256" y="194" width="20" height="6" rx="3" fill="#FFFDF5" />
            <rect x="256" y="214" width="20" height="6" rx="3" fill="#FFFDF5" />
            <rect x="256" y="234" width="20" height="6" rx="3" fill="#FFFDF5" />
            <rect x="256" y="254" width="20" height="6" rx="3" fill="#FFFDF5" />
            <rect x="256" y="274" width="20" height="6" rx="3" fill="#FFFDF5" />
            <path d="M 242 282 L 270 282 C 274 282 277 285 277 289 L 275 304 C 275 310 277 314 273 320 L 260 327 C 257.5 328.5 254.5 328.5 252 327 L 239 320 C 235 314 237 310 237 304 L 235 289 C 235 285 238 282 242 282 Z" fill="#FFFDF5" />
            <path d="M 249 314 C 249 311 251 309 254 309 L 258 309 C 261 309 263 311 263 314 L 264 346 C 266 354 275 362 275 374 C 275 384.5 266.5 393 256 393 C 245.5 393 237 384.5 237 374 C 237 362 246 354 248 346 Z" fill="#FFFDF5" />
            <rect x="252" y="294" width="8" height="22" rx="4" fill="#FBBF24" />
            <circle cx="256" cy="374" r="9" fill="#FBBF24" />
          </g>
        </g>
      </svg>
    )
  }

  // 13. Generic / Uncategorized File Fallback (geniric svg icon.svg)
  return (
    <svg {...svgProps}>
      <defs>
        <filter id={sheetShadowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.06" />
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.04" />
        </filter>
        <filter id={folderShadowId} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#475569" floodOpacity="0.12" />
        </filter>
      </defs>
      <g filter={`url(#${folderShadowId})`}>
        <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#D4DFE9" />
        <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#F8FAFC" />
        <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#B0C0D0" />
        <g filter={`url(#${sheetShadowId})`}>
          <path d="M 204 200 C 195 200 188 207 188 216 L 188 364 C 188 373 195 380 204 380 L 308 380 C 317 380 324 373 324 364 L 324 244 C 324 240 322 236 319 233 L 291 205 C 288 202 284 200 280 200 Z" fill="#F8FAFC" />
          <path d="M 281 201 L 281 232 C 281 238 286 243 292 243 L 323 243" fill="none" stroke="#B0C0D0" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
    </svg>
  )
}

/** Same 512 viewBox and body silhouette as FileKindIcon. */
const FILE_ICON_BODY =
  'M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z'

const FILE_ICON_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="white" d="${FILE_ICON_BODY}"/></svg>`
)}")`

export function FileStackPhoto({
  src,
  width = 112,
  height,
  fallbackSrc,
}: {
  src: string
  width?: number | string
  height?: number | string
  /**
   * Streamed full-res substitute used when the bounded thumbnail cannot be
   * produced. Electron's nativeImage decodes only PNG/JPEG — formats like
   * GIF make the thumb endpoint answer 415, and without this fallback the
   * masked tile renders as an empty broken image (animated GIFs lose their
   * stack tile). Swapping to edgelocal://file/ lets Chromium play them.
   */
  fallbackSrc?: string
}) {
  const resolvedHeight = height ?? width
  // One-shot swap on load failure; keyed back to src whenever a different
  // image reuses this element.
  const [activeSrc, setActiveSrc] = useState(src)
  useEffect(() => { setActiveSrc(src) }, [src])
  return (
    <img
      src={activeSrc}
      alt=""
      draggable={false}
      width={typeof width === 'number' ? width : undefined}
      height={typeof resolvedHeight === 'number' ? resolvedHeight : undefined}
      onError={() => {
        if (fallbackSrc && activeSrc !== fallbackSrc) setActiveSrc(fallbackSrc)
      }}
      style={{
        width,
        height: resolvedHeight,
        objectFit: 'cover',
        flexShrink: 0,
        display: 'block',
        WebkitMaskImage: FILE_ICON_MASK,
        maskImage: FILE_ICON_MASK,
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center'
      }}
    />
  )
}
