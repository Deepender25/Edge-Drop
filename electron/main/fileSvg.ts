import type { FileKind } from '../../src/lib/fileType'

/**
 * Generates the 1:1 exact vector SVG markup for the 3D pastel category folder icons
 * matching CustomFileIcon.tsx without any glass container or background box.
 */
export function getFileKindSvgContent(kind: FileKind, uid = 'drag'): string {
  const folderShadowId = `fsh-${uid}`
  const sheetShadowId = `ssh-${uid}`
  const glyphShadowId = `gsh-${uid}`

  switch (kind) {
    case 'folder':
      return `
        <defs>
          <filter id="${folderShadowId}" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#D97706" floodOpacity="0.12" />
          </filter>
        </defs>
        <g filter="url(#${folderShadowId})">
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#FDE68A" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#FFFDF5" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#FBBF24" />
        </g>
      `

    case 'executable':
      return `
        <defs>
          <filter id="${glyphShadowId}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#3730A3" floodOpacity="0.22" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.05" />
          </filter>
          <filter id="${folderShadowId}" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#4338CA" floodOpacity="0.12" />
          </filter>
        </defs>
        <g filter="url(#${folderShadowId})">
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#C7D2FE" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#F5F7FF" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#93A4FC" />
          <g filter="url(#${glyphShadowId})">
            <g stroke="#FFFFFF" stroke-width="8" stroke-linecap="round">
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
      `

    case 'audio':
      return `
        <defs>
          <filter id="${glyphShadowId}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#6B21A8" floodOpacity="0.22" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.05" />
          </filter>
          <filter id="${folderShadowId}" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#7E22CE" floodOpacity="0.12" />
          </filter>
        </defs>
        <g filter="url(#${folderShadowId})">
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#E2D0FE" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#FAF5FF" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#C495FD" />
          <g transform="translate(167.8, 190.6) scale(12)" filter="url(#${glyphShadowId})" fill="#FFFFFF">
            <path d="M 10.888 2.518 L 6.132 3.477 C 5.98 3.508 5.86 3.565 5.76 3.65 C 5.66 3.735 5.6 3.86 5.6 4.02 C 5.596 4.047 5.59 4.1 5.59 4.18 L 5.59 10.132 C 5.59 10.272 5.578 10.407 5.484 10.522 C 5.389 10.637 5.274 10.672 5.137 10.699 L 4.827 10.762 C 4.434 10.842 4.177 10.895 3.946 10.985 C 3.738 11.066 3.555 11.186 3.427 11.318 C 3.25 11.5 3.12 11.75 3.095 12.313 C 3.126 12.61 3.261 12.895 3.49 13.105 C 3.646 13.247 3.84 13.355 4.068 13.401 C 4.304 13.448 4.558 13.432 4.926 13.358 C 5.122 13.318 5.306 13.256 5.481 13.153 C 5.656 13.05 5.81 12.89 5.919 12.748 C 6.028 12.606 6.12 12.36 6.152 12.198 C 6.194 11.996 6.204 11.812 6.204 11.61 L 6.204 6.347 C 6.204 6.071 6.284 5.997 6.506 5.943 C 6.53 5.938 10.46 5.146 10.644 5.11 C 10.901 5.061 11.022 5.135 11.022 5.404 L 11.022 8.928 C 11.022 9.068 11.021 9.208 10.926 9.324 C 10.832 9.439 10.715 9.474 10.578 9.502 L 10.268 9.564 C 9.875 9.644 9.619 9.697 9.388 9.787 C 9.18 9.868 8.997 9.988 8.868 10.121 C 8.69 10.3 8.56 10.55 8.528 11.115 C 8.558 11.412 8.702 11.697 8.932 11.907 C 9.088 12.049 9.282 12.157 9.51 12.203 C 9.745 12.25 10 12.234 10.367 12.16 C 10.564 12.12 10.747 12.058 10.923 11.955 C 11.098 11.852 11.251 11.692 11.361 11.55 C 11.467 11.393 11.546 11.206 11.594 11 C 11.636 10.798 11.646 10.614 11.646 10.412 L 11.646 2.812 C 11.646 2.666 11.593 2.562 11.486 2.502 C 11.38 2.44 11.19 2.456 10.888 2.518 Z" />
          </g>
        </g>
      `

    case 'code':
      return `
        <defs>
          <filter id="${glyphShadowId}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#0369A1" floodOpacity="0.18" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.05" />
          </filter>
          <filter id="${folderShadowId}" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#0284C7" floodOpacity="0.12" />
          </filter>
        </defs>
        <g filter="url(#${folderShadowId})">
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#86DDFB" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#F0FBFF" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#53CAF7" />
          <g filter="url(#${glyphShadowId})" fill="none" stroke="#FFFFFF" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
            <path d="M 200 240 L 156 289 L 200 338" />
            <line x1="282" y1="222" x2="230" y2="356" />
            <path d="M 312 240 L 356 289 L 312 338" />
          </g>
        </g>
      `

    case 'word':
      return `
        <defs>
          <filter id="${sheetShadowId}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.06" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.04" />
          </filter>
          <filter id="${folderShadowId}" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#000000" floodOpacity="0.08" />
          </filter>
        </defs>
        <g filter="url(#${folderShadowId})">
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#9DC5FA" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#F2F7FE" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#7BAFF8" />
          <g filter="url(#${sheetShadowId})">
            <path d="M 204 200 C 195 200 188 207 188 216 L 188 364 C 188 373 195 380 204 380 L 308 380 C 317 380 324 373 324 364 L 324 244 C 324 240 322 236 319 233 L 291 205 C 288 202 284 200 280 200 Z" fill="#F2F7FE" />
            <path d="M 281 201 L 281 232 C 281 238 286 243 292 243 L 323 243" fill="none" stroke="#7BAFF8" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
            <text x="210" y="278" fill="#7BAFF8" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="52" font-weight="800" letter-spacing="-0.5" text-anchor="start">W</text>
            <line x1="210" y1="306" x2="302" y2="306" stroke="#7BAFF8" stroke-width="7" stroke-linecap="round" />
            <line x1="210" y1="328" x2="302" y2="328" stroke="#7BAFF8" stroke-width="7" stroke-linecap="round" />
            <line x1="210" y1="350" x2="258" y2="350" stroke="#7BAFF8" stroke-width="7" stroke-linecap="round" />
          </g>
        </g>
      `

    case 'image':
      return `
        <defs>
          <filter id="${glyphShadowId}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#6B4F3B" floodOpacity="0.22" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.05" />
          </filter>
          <filter id="${folderShadowId}" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#8C6A4F" floodOpacity="0.14" />
          </filter>
        </defs>
        <g filter="url(#${folderShadowId})">
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#DFCEBC" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#FFFDF9" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#BA9B7B" />
          <g filter="url(#${glyphShadowId})">
            <circle cx="272" cy="260" r="14" fill="#FFFFFF" />
            <path d="M 178 346 L 178 326 L 230 274 L 266 308 L 298 282 L 334 324 L 334 346 Z" fill="#FFFFFF" />
            <rect x="176" y="228" width="160" height="122" rx="18" fill="none" stroke="#FFFFFF" stroke-width="12" />
          </g>
        </g>
      `

    case 'pdf':
      return `
        <defs>
          <filter id="${sheetShadowId}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.06" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.04" />
          </filter>
          <filter id="${folderShadowId}" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#000000" floodOpacity="0.08" />
          </filter>
        </defs>
        <g filter="url(#${folderShadowId})">
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#FF92A0" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#FFF0F2" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#FF7C8E" />
          <g filter="url(#${sheetShadowId})">
            <path d="M 204 200 C 195 200 188 207 188 216 L 188 364 C 188 373 195 380 204 380 L 308 380 C 317 380 324 373 324 364 L 324 244 C 324 240 322 236 319 233 L 291 205 C 288 202 284 200 280 200 Z" fill="#FFF0F2" />
            <path d="M 281 201 L 281 232 C 281 238 286 243 292 243 L 323 243" fill="none" stroke="#FF7C8E" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
            <text x="256" y="302" fill="#FF7C8E" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="38" font-weight="800" letter-spacing="0.5" text-anchor="middle">PDF</text>
            <line x1="208" y1="330" x2="304" y2="330" stroke="#FF7C8E" stroke-width="7" stroke-linecap="round" />
            <line x1="208" y1="352" x2="304" y2="352" stroke="#FF7C8E" stroke-width="7" stroke-linecap="round" />
          </g>
        </g>
      `

    case 'powerpoint':
      return `
        <defs>
          <filter id="${sheetShadowId}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.06" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.04" />
          </filter>
          <filter id="${folderShadowId}" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#000000" floodOpacity="0.08" />
          </filter>
        </defs>
        <g filter="url(#${folderShadowId})">
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#FFC492" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#FFF8F2" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#FFA25B" />
          <g filter="url(#${sheetShadowId})">
            <line x1="256" y1="306" x2="256" y2="368" stroke="#FFF8F2" stroke-width="8" stroke-linecap="round" />
            <line x1="256" y1="312" x2="222" y2="368" stroke="#FFF8F2" stroke-width="8" stroke-linecap="round" />
            <line x1="256" y1="312" x2="290" y2="368" stroke="#FFF8F2" stroke-width="8" stroke-linecap="round" />
            <rect x="182" y="196" width="148" height="14" rx="7" fill="#FFF8F2" />
            <rect x="188" y="210" width="136" height="96" rx="8" fill="#FFF8F2" />
            <path d="M 252 230 A 28 28 0 1 0 273 277 L 252 258 Z" fill="#FFA25B" />
            <path d="M 260 228 A 28 28 0 0 1 288 255 L 260 255 Z" fill="#FFA25B" />
            <path d="M 288 261 A 28 28 0 0 1 279 280 L 260 261 Z" fill="#FFA25B" />
          </g>
        </g>
      `

    case 'excel':
      return `
        <defs>
          <filter id="${sheetShadowId}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.06" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.04" />
          </filter>
          <filter id="${folderShadowId}" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#000000" floodOpacity="0.08" />
          </filter>
        </defs>
        <g filter="url(#${folderShadowId})">
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#7EE6BC" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#F0FDF8" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#52D7A4" />
          <g filter="url(#${sheetShadowId})">
            <path d="M 204 200 C 195 200 188 207 188 216 L 188 364 C 188 373 195 380 204 380 L 308 380 C 317 380 324 373 324 364 L 324 244 C 324 240 322 236 319 233 L 291 205 C 288 202 284 200 280 200 Z" fill="#F0FDF8" />
            <path d="M 281 201 L 281 232 C 281 238 286 243 292 243 L 323 243" fill="none" stroke="#52D7A4" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
            <rect x="210" y="262" width="92" height="86" rx="8" fill="none" stroke="#52D7A4" stroke-width="5" />
            <line x1="210" y1="290" x2="302" y2="290" stroke="#52D7A4" stroke-width="5" />
            <line x1="210" y1="319" x2="302" y2="319" stroke="#52D7A4" stroke-width="5" />
            <line x1="241" y1="262" x2="241" y2="348" stroke="#52D7A4" stroke-width="5" />
            <line x1="271" y1="262" x2="271" y2="348" stroke="#52D7A4" stroke-width="5" />
          </g>
        </g>
      `

    case 'text':
      return `
        <defs>
          <filter id="${sheetShadowId}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.06" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.04" />
          </filter>
          <filter id="${folderShadowId}" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#4A5F3B" floodOpacity="0.14" />
          </filter>
        </defs>
        <g filter="url(#${folderShadowId})">
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#CEDDC3" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#F8FAF6" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#8CA77B" />
          <g filter="url(#${sheetShadowId})">
            <path d="M 204 200 C 195 200 188 207 188 216 L 188 364 C 188 373 195 380 204 380 L 308 380 C 317 380 324 373 324 364 L 324 244 C 324 240 322 236 319 233 L 291 205 C 288 202 284 200 280 200 Z" fill="#F8FAF6" />
            <path d="M 281 201 L 281 232 C 281 238 286 243 292 243 L 323 243" fill="none" stroke="#8CA77B" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
            <line x1="210" y1="268" x2="256" y2="268" stroke="#8CA77B" stroke-width="7" stroke-linecap="round" />
            <line x1="210" y1="294" x2="300" y2="294" stroke="#8CA77B" stroke-width="7" stroke-linecap="round" />
            <line x1="210" y1="320" x2="300" y2="320" stroke="#8CA77B" stroke-width="7" stroke-linecap="round" />
            <line x1="210" y1="346" x2="276" y2="346" stroke="#8CA77B" stroke-width="7" stroke-linecap="round" />
          </g>
        </g>
      `

    case 'video':
      return `
        <defs>
          <filter id="${sheetShadowId}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.06" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.04" />
          </filter>
          <filter id="${folderShadowId}" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#1E293B" floodOpacity="0.14" />
          </filter>
        </defs>
        <g filter="url(#${folderShadowId})">
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#94A3B8" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#F8FAFC" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#64748B" />
          <g filter="url(#${sheetShadowId})">
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
      `

    case 'archive':
      return `
        <defs>
          <filter id="${glyphShadowId}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#B45309" floodOpacity="0.22" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.05" />
          </filter>
          <filter id="${folderShadowId}" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#D97706" floodOpacity="0.12" />
          </filter>
        </defs>
        <g filter="url(#${folderShadowId})">
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#FDE68A" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#FFFDF5" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#FBBF24" />
          <g filter="url(#${glyphShadowId})">
            <line x1="256" y1="178" x2="256" y2="284" stroke="#FFFDF5" stroke-width="6" stroke-linecap="round" />
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
      `

    case 'file':
    default:
      return `
        <defs>
          <filter id="${sheetShadowId}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.06" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.04" />
          </filter>
          <filter id="${folderShadowId}" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#475569" floodOpacity="0.12" />
          </filter>
        </defs>
        <g filter="url(#${folderShadowId})">
          <path d="M 56 378 L 56 128 C 56 112 68 100 84 100 L 162 100 C 178 100 190 108 200 120 C 208 130 218 136 232 136 L 428 136 C 444 136 456 148 456 164 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#D4DFE9" />
          <path d="M 74 162 L 74 152 C 74 147 78 143 83 143 L 429 143 C 434 143 438 147 438 152 L 438 162 Z" fill="#F8FAFC" />
          <path d="M 56 168 C 56 156 65 148 76 148 L 436 148 C 447 148 456 156 456 168 L 456 378 C 456 396 442 410 424 410 L 88 410 C 70 410 56 396 56 378 Z" fill="#B0C0D0" />
          <g filter="url(#${sheetShadowId})">
            <path d="M 204 200 C 195 200 188 207 188 216 L 188 364 C 188 373 195 380 204 380 L 308 380 C 317 380 324 373 324 364 L 324 244 C 324 240 322 236 319 233 L 291 205 C 288 202 284 200 280 200 Z" fill="#F8FAFC" />
            <path d="M 281 201 L 281 232 C 281 238 286 243 292 243 L 323 243" fill="none" stroke="#B0C0D0" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
          </g>
        </g>
      `
  }
}

/**
 * Builds the standalone SVG string for drag previews.
 * Zero glass effect, zero black bounding container — just the clean SVG icon artwork.
 */
export function buildFileDragSvg(kinds: FileKind[], count: number): string {
  if (count <= 1 || kinds.length === 1) {
    const kind = kinds[0] || 'file'
    return `<svg xmlns="http://www.w3.org/2000/svg" width="122" height="122" viewBox="0 0 512 512" fill="none">
      ${getFileKindSvgContent(kind, 'single')}
    </svg>`
  }

  // Multi-file stack (2 or 3 items offset naturally without any bounding card container)
  const displayKinds = kinds.slice(0, 3)
  const stackSvg = displayKinds
    .map((k, i) => ({ kind: k, index: i }))
    .reverse()
    .map(({ kind, index }) => {
      const spread = 28
      const rot = index * 5 - ((displayKinds.length - 1) * 2.5)
      const tx = index * spread - ((displayKinds.length - 1) * spread) / 2
      const ty = index * 10
      const scale = 1 - index * 0.04
      return `
        <g transform="translate(${tx}, ${ty}) rotate(${rot} 256 256) scale(${scale})">
          ${getFileKindSvgContent(kind, `stack-${index}`)}
        </g>
      `
    })
    .join('')

  const badgeSvg = count > 1 ? `
    <g transform="translate(380, 110)">
      <circle cx="0" cy="0" r="42" fill="#18181B" stroke="#FFFFFF" stroke-width="6" />
      <text x="0" y="14" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="38" font-weight="700" fill="#FFFFFF" text-anchor="middle">+${count}</text>
    </g>
  ` : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="142" height="142" viewBox="0 0 512 512" fill="none">
    ${stackSvg}
    ${badgeSvg}
  </svg>`
}
