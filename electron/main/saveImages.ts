/**
 * "Save to Downloads" for image items: copies the stored original file(s)
 * into a folder under a readable name, never overwriting an existing file.
 *
 * Kept free of Electron imports (paths and lookups are passed in) so it can
 * be unit-tested against a temp folder.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { ClipboardImageFields, ClipboardItem } from '../../shared/types'

export interface SaveImagesDeps {
  /** Target folder (the user's Downloads folder in the app). */
  destDir: string
  /** On-disk original for a stored image, or null when it is gone. */
  resolveSource: (imageId: string, ext?: string) => string | null
  /** Default name when the item has no note (same names drag-out uses). */
  defaultName: (capturedAt: number, ext: string, img: ClipboardImageFields, index: number) => string
  /** Name when a note leaves nothing usable (the word for "Image" in the user's language). */
  fallbackName?: string
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** A note as a Windows-safe file name base (no extension). */
export function fileBaseFromNote(note: string, fallback = 'Image'): string {
  let base = note
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .replace(/^\.+/, '')
  if (Array.from(base).length > 120) base = Array.from(base).slice(0, 120).join('').trim()
  if (RESERVED.test(base)) base = `${base}_`
  return base || fallback
}

/** `dir/base.ext`, or `dir/base (2).ext`, `(3)`... when that name is taken. */
export function uniqueDest(dir: string, base: string, ext: string): string {
  const cleanExt = ext.replace(/^\./, '') || 'png'
  let candidate = join(dir, `${base}.${cleanExt}`)
  for (let n = 2; existsSync(candidate) && n < 10000; n++) {
    candidate = join(dir, `${base} (${n}).${cleanExt}`)
  }
  return candidate
}

/** Copy the item's images into destDir. Returns the written paths. */
export function saveItemImages(item: ClipboardItem, deps: SaveImagesDeps): string[] {
  const images: ClipboardImageFields[] =
    item.data.kind === 'image'
      ? [item.data]
      : item.data.kind === 'image-collection'
        ? item.data.images
        : []
  if (images.length === 0) return []
  mkdirSync(deps.destDir, { recursive: true })

  const noteBase = item.note ? fileBaseFromNote(item.note, deps.fallbackName) : null
  const saved: string[] = []
  images.forEach((img, i) => {
    const src = deps.resolveSource(img.imageId, img.ext)
    if (!src) return
    const ext = extname(src).replace(/^\./, '') || img.ext || 'png'
    const base = noteBase
      ? images.length > 1 ? `${noteBase} (${i + 1})` : noteBase
      : deps.defaultName(item.capturedAt, ext, img, i + 1).replace(/\.[^.]+$/, '')
    const dest = uniqueDest(deps.destDir, base, ext)
    try {
      copyFileSync(src, dest)
      saved.push(dest)
    } catch (err) {
      console.error('[saveImages] copy failed:', err)
    }
  })
  return saved
}
