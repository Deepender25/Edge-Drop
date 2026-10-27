const ART_SIZE = 512

function artImage(href: string | null): string {
  if (!href) return ''
  return `<image href="${href}" x="0" y="0" width="${ART_SIZE}" height="${ART_SIZE}"/>`
}

/**
 * The drag ghost's layout: the image Windows shows under the pointer while a
 * file or image card is dragged out of the shelf. One piece of file-kind art
 * (a single file or image), or up to three fanned out with a "+N" badge.
 *
 * Pure: main rasterizes it with Resvg for the real drag (electron/main/
 * fileSvg.ts); the onboarding tour draws the same SVG for its demo drags.
 * `art` is one image href per shown file (data URIs where the SVG is
 * rasterized or used as an <img>, which cannot load other URLs).
 */
export function dragGhostSvg(art: Array<string | null>, count: number): string {
  if (art.length <= 1) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="122" height="122" viewBox="0 0 512 512" fill="none">
      ${artImage(art[0] ?? null)}
    </svg>`
  }

  // Multi-file stack (2 or 3 items offset naturally without any bounding card container)
  const stackSvg = art
    .map((href, i) => ({ href, index: i }))
    .reverse()
    .map(({ href, index }) => {
      const spread = 28
      const rot = index * 5 - ((art.length - 1) * 2.5)
      const tx = index * spread - ((art.length - 1) * spread) / 2
      const ty = index * 10
      const scale = 1 - index * 0.04
      return `
        <g transform="translate(${tx}, ${ty}) rotate(${rot} 256 256) scale(${scale})">
          ${artImage(href)}
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
