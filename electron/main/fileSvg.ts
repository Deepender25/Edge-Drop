import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { FileKind } from '../../src/lib/fileType'

/**
 * Drag-ghost artwork from the vintage textured PNG set
 * (resources/file-icons, one static file per kind).
 *
 * PNGs are read once per session into a bounded data-URI cache, then
 * embedded into the existing stack/badge SVG layout which Resvg rasterizes
 * exactly as before. UI file icons come from the same files over
 * edgelocal://icon/, so there is a single copy of the art.
 */

const PNG_WIDTH = 512
const PNG_HEIGHT = 341

let iconDirOverride: string | null = null

/** Test hook: point the builder at a fixture directory instead of resources. */
export function setFileIconAssetDir(dir: string): void {
  iconDirOverride = dir
  pngCache.clear()
}

function fileIconDir(): string | null {
  if (iconDirOverride) return iconDirOverride
  try {
    const getAppPath = (app as unknown as { getAppPath?: () => string })?.getAppPath
    if (typeof getAppPath !== 'function') return null
    return join(getAppPath.call(app), 'resources', 'file-icons')
  } catch {
    return null
  }
}

const pngCache = new Map<string, string | null>()
const PNG_CACHE_MAX = 16

/** Data-URI for a kind's PNG, or null when the file is unavailable. */
function kindPngDataUri(kind: FileKind): string | null {
  const cached = pngCache.get(kind)
  if (cached !== undefined) return cached
  let uri: string | null = null
  try {
    const dir = fileIconDir()
    if (dir) {
      const buf = readFileSync(join(dir, `${kind}.png`))
      if (buf.length > 0) uri = `data:image/png;base64,${buf.toString('base64')}`
    }
  } catch {
    uri = null
  }
  if (pngCache.size >= PNG_CACHE_MAX) {
    const first = pngCache.keys().next().value
    if (first) pngCache.delete(first)
  }
  pngCache.set(kind, uri)
  return uri
}

/** One folder PNG centered in the 512 viewBox (512x341 art). */
function kindImage(kind: FileKind): string {
  const uri = kindPngDataUri(kind)
  if (!uri) return ''
  const y = Math.round((512 - PNG_HEIGHT) / 2)
  return `<image href="${uri}" x="0" y="${y}" width="${PNG_WIDTH}" height="${PNG_HEIGHT}"/>`
}

/**
 * Builds the standalone SVG string for drag previews.
 * Vintage PNG artwork with the multi-file stack offsets and count badge.
 * Kinds without a readable PNG render as empty slots (the caller falls back
 * to the generic icon when rasterization yields nothing usable).
 */
export function buildFileDragSvg(kinds: FileKind[], count: number): string {
  if (count <= 1 || kinds.length === 1) {
    const kind = kinds[0] || 'file'
    return `<svg xmlns="http://www.w3.org/2000/svg" width="122" height="122" viewBox="0 0 512 512" fill="none">
      ${kindImage(kind)}
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
          ${kindImage(kind)}
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
