import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { APP_CONFIG } from './config'

const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  pjpeg: 'image/jpeg',
  pjp: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff'
}

export interface StoredImage {
  filePath: string
  contentType: string
}

/** URL for a bounded thumbnail of a staged clipboard image. */
export function thumbnailUrlForStoredImage(imageId: string): string {
  return `${APP_CONFIG.imageProtocol}://thumb/${imageId}`
}

/** URL for a bounded thumbnail of an external image file. */
export function thumbnailUrlForFile(filePath: string): string {
  return `${APP_CONFIG.imageProtocol}://thumb/file/${encodeURIComponent(filePath.replace(/\\/g, '/'))}`
}

const EMOJI_FILE_RE = /^[0-9a-f][0-9a-f0-9-]*\.png$/

/** Directory of Twemoji 64px PNGs (dev: node_modules, packaged: extraResources). */
export function emojiAssetDir(opts: { packaged: boolean; resourcesPath: string; appPath: string; cwd: string }): string {
  if (opts.packaged) return join(opts.resourcesPath, 'emoji', '64')
  const candidates = [
    join(opts.cwd, 'node_modules', 'emoji-datasource-twitter', 'img', 'twitter', '64'),
    join(opts.appPath, 'node_modules', 'emoji-datasource-twitter', 'img', 'twitter', '64')
  ]
  return candidates.find((dir) => existsSync(dir)) ?? candidates[0]
}

/**
 * Cache of validated emoji asset paths. The 64px PNG set is static at
 * runtime, so a resolved filename never changes its answer. Caching skips a
 * `resolve` + `existsSync` disk stat per glyph — the first emoji grid mounts
 * ~100 `<img>` tags at once, and without this every one of them stats the
 * disk inside the click. Only positive hits are cached, so the map is bounded
 * by the real file count and invalid names never accumulate.
 */
const emojiAssetCache = new Map<string, string>()

/**
 * Resolve a picker glyph filename to an on-disk PNG. Rejects anything that
 * is not a lowercase hex-and-hyphen name so the protocol cannot escape the
 * emoji asset directory.
 */
export function resolveEmojiAsset(assetDir: string, fileName: string): string | null {
  const name = fileName.toLowerCase()
  if (!EMOJI_FILE_RE.test(name)) return null
  const baseDir = resolve(assetDir)
  const cacheKey = `${baseDir}${name}`
  const cached = emojiAssetCache.get(cacheKey)
  if (cached !== undefined) return cached
  const filePath = resolve(join(baseDir, name))
  if (dirname(filePath) !== baseDir) return null
  if (!existsSync(filePath)) return null
  emojiAssetCache.set(cacheKey, filePath)
  return filePath
}

/** Most glyphs one readEmojiBatch call returns (a screen is ~80-370). */
export const EMOJI_BATCH_MAX = 400

/**
 * Read many picker glyphs at once: valid file name -> base64 PNG. Names go
 * through resolveEmojiAsset (same allowlist and directory check as the
 * protocol route); invalid or missing names are left out. Reads run in
 * parallel off the main thread.
 */
export async function readEmojiBatch(assetDir: string, names: readonly unknown[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!Array.isArray(names)) return out
  const unique = [...new Set(names.filter((n): n is string => typeof n === 'string').map((n) => n.toLowerCase()))]
  await Promise.all(
    unique.slice(0, EMOJI_BATCH_MAX).map(async (name) => {
      const filePath = resolveEmojiAsset(assetDir, name)
      if (!filePath) return
      try {
        out[name] = (await readFile(filePath)).toString('base64')
      } catch {
        /* unreadable: leave it out */
      }
    })
  )
  return out
}

/**
 * File-kind folder icons (SVG, resources/file-icons). Fixed 13-name
 * allowlist so the protocol cannot escape the icon directory — same
 * validation shape as the emoji assets above. Served only as <img> /
 * <image> sources, where SVG never runs script.
 */
const ICON_FILE_RE = /^(pdf|word|excel|powerpoint|archive|text|code|audio|video|image|executable|folder|file)\.svg$/

/** Resolve a file-kind icon name to its on-disk PNG. */
export function resolveIconAsset(assetDir: string, fileName: string): string | null {
  const name = fileName.toLowerCase()
  if (!ICON_FILE_RE.test(name)) return null
  const baseDir = resolve(assetDir)
  const filePath = resolve(join(baseDir, name))
  if (dirname(filePath) !== baseDir) return null
  if (!existsSync(filePath)) return null
  return filePath
}

/**
 * Resolve an edgelocal image id to the staged file without allowing the id to
 * select paths or arbitrary file types. Clipboard captures are PNG, while
 * dropped/copied image files retain their original extension.
 */
export function resolveStoredImage(imagesDir: string, imageId: string): StoredImage | null {
  if (!/^[a-z0-9-]+$/i.test(imageId)) return null

  const baseDir = resolve(imagesDir)
  let entries: string[]
  try {
    entries = readdirSync(baseDir)
  } catch {
    return null
  }

  const fileName = entries.find((entry) => {
    const extension = extname(entry).slice(1).toLowerCase()
    return basename(entry, extname(entry)) === imageId && extension in IMAGE_MIME_TYPES
  })
  if (!fileName) return null

  const filePath = resolve(join(baseDir, fileName))
  if (dirname(filePath) !== baseDir) return null

  const extension = extname(fileName).slice(1).toLowerCase()
  return { filePath, contentType: IMAGE_MIME_TYPES[extension] }
}
