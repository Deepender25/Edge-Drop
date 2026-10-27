import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { FileKind } from '../../src/lib/fileKind'
import { dragGhostSvg as dragSvgLayout } from '../../shared/dragGhost'

/**
 * Drag-ghost artwork from the file-kind SVG set (resources/file-icons, one
 * static file per kind).
 *
 * Each SVG is read once per session into a bounded data-URI cache, then
 * embedded as a nested image in the stack/badge SVG layout which Resvg
 * rasterizes. UI file icons come from the same files over edgelocal://icon/,
 * so there is a single copy of the art. The files are square and already
 * cropped to the folder (their viewBox), so each one fills the 512 slot.
 */

let iconDirOverride: string | null = null

/** Test hook: point the builder at a fixture directory instead of resources. */
export function setFileIconAssetDir(dir: string): void {
  iconDirOverride = dir
  artCache.clear()
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

const artCache = new Map<string, string>()
const ART_CACHE_MAX = 16

function readArt(kind: string): string | null {
  try {
    const dir = fileIconDir()
    if (!dir) return null
    const buf = readFileSync(join(dir, `${kind}.svg`))
    return buf.length > 0 ? `data:image/svg+xml;base64,${buf.toString('base64')}` : null
  } catch {
    return null
  }
}

/**
 * Data-URI for a kind's SVG; a kind whose file is unreadable borrows the
 * generic `file` art. Only successful reads are cached, so a file that was
 * missing for a moment (an update or rebuild swapping the folder) is picked
 * up on the next drag instead of leaving that kind blank for the session.
 */
function kindArtDataUri(kind: FileKind): string | null {
  const cached = artCache.get(kind)
  if (cached !== undefined) return cached
  const uri = readArt(kind) ?? (kind === 'file' ? null : readArt('file'))
  if (!uri) return null
  if (artCache.size >= ART_CACHE_MAX) {
    const first = artCache.keys().next().value
    if (first) artCache.delete(first)
  }
  artCache.set(kind, uri)
  return uri
}

/** One folder icon filling the 512 viewBox. */
/** True when a built drag SVG carries at least one piece of art. */
export function dragSvgHasArt(svg: string): boolean {
  return svg.includes('<image ')
}

/**
 * Builds the standalone SVG string for drag previews.
 * File-kind artwork with the multi-file stack offsets and count badge.
 * Kinds without readable art render as empty slots (the caller falls back
 * to the generic icon when rasterization yields nothing usable).
 */
export function buildFileDragSvg(kinds: FileKind[], count: number): string {
  const shown = count <= 1 || kinds.length === 1 ? [kinds[0] || 'file'] : kinds.slice(0, 3)
  return dragSvgLayout(shown.map((kind) => kindArtDataUri(kind)), count)
}

/**
 * The same ghost, from art already rasterized (one PNG data-URI per shown
 * file, at most 3). Placing finished bitmaps is far cheaper than running each
 * piece of art's blur and grain filters again for every stack.
 */
export function buildDragSvgFromArt(art: Array<string | null>, count: number): string {
  return dragSvgLayout(count <= 1 ? art.slice(0, 1) : art.slice(0, 3), count)
}
