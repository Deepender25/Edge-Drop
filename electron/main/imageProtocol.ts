import { readdirSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'

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
