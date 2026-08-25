/**
 * Native drag-out of items into other applications.
 *
 * Electron's supported drag-out path is `webContents.startDrag({ file, icon })`,
 * which must be called from the `ipcMain.on` handler (not an async invoke
 * handler) so `event.sender` is the exact webContents that initiated the drag.
 * This ensures the OLE drag gesture flows correctly on Windows.
 *
 * Before dragging we stage the item's content as a temp file:
 *   - image  -> <id>.png (its persisted bytes, copied to temp)
 *   - text   -> <id>.txt
 *   - files  -> the *original* file paths (drag the real thing, not a copy)
 *
 * The temp files are cleaned up on the next app start (see cleanTemp).
 */
import { app, nativeImage, type WebContents } from 'electron'
import { Resvg } from '@resvg/resvg-js'
import { copyFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { getUnpackagedTempDir, toUnpackagedFilePaths } from '../store/paths'
import type { DragRequest, ItemData } from '../../shared/types'
import { getStore } from './state'
import { getFileKind } from '../../src/lib/fileType'
import { recordStagedFiles } from './stagedTemp'

function stampForFilename(capturedAt?: number): string {
  const d = capturedAt ? new Date(capturedAt) : new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}.${minutes}.${seconds}`
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim() || 'Image'
}

/**
 * Filename for a staged clipboard bitmap.
 * Screenshots keep the Windows-style Screenshot stamp; other bitmaps use Image
 * (or the original name when the clipboard provided one).
 */
export function formatClipboardImageFilename(
  capturedAt?: number,
  ext = 'png',
  opts?: { source?: 'screenshot' | 'image'; fileName?: string; indexSuffix?: number }
): string {
  const cleanExt = ext.replace(/^\./, '') || 'png'
  const suffix = typeof opts?.indexSuffix === 'number' && opts.indexSuffix > 1 ? ` (${opts.indexSuffix})` : ''
  if (opts?.fileName) {
    const safe = sanitizeFileName(opts.fileName)
    const base = safe.replace(/\.[^.]+$/, '')
    const givenExt = (safe.match(/\.([a-z0-9]+)$/i)?.[1] || cleanExt).toLowerCase()
    return `${base}${suffix}.${givenExt}`
  }
  const prefix = opts?.source === 'image' ? 'Image' : 'Screenshot'
  return `${prefix} ${stampForFilename(capturedAt)}${suffix}.${cleanExt}`
}

/** @deprecated use formatClipboardImageFilename */
export function formatScreenshotFilename(capturedAt?: number, ext = 'png', indexSuffix?: number): string {
  return formatClipboardImageFilename(capturedAt, ext, { source: 'screenshot', indexSuffix })
}

/**
 * Resolve a DragRequest into concrete ItemData along with capture timestamp.
 *
 * If `paths` is provided (dragging one file out of an expanded bundle), synthesize
 * a singleton `files` item. Otherwise look up the full item by id.
 */
export function resolveDragData(req: DragRequest): { data: ItemData; capturedAt?: number } | null {
  if (req.paths && req.paths.length > 0) {
    prefetchFileIcons(req.paths)
    return { data: { kind: 'files', paths: req.paths } }
  }
  const item = getStore().get(req.id)
  if (!item) return null

  if (item.data.kind === 'files') {
    prefetchFileIcons(item.data.paths)
  }

  if (req.imageId && item.data.kind === 'image-collection') {
    const img = item.data.images.find((i) => i.imageId === req.imageId)
    if (img) return { data: { kind: 'image', ...img }, capturedAt: item.capturedAt }
  }
  return { data: item.data, capturedAt: item.capturedAt }
}

export function startDragOut(sender: WebContents, data: ItemData, capturedAt?: number): boolean {
  const staged = stageDragFile(data, capturedAt)
  if (!staged) return false

  const icon = dragIcon(data)
  const item: Electron.Item = { file: staged.file, icon }
  if (staged.files) {
    item.files = staged.files
  }
  sender.startDrag(item)
  return true
}

/* ------------------------------------------------------------------ */
/* Staging                                                             */
/* ------------------------------------------------------------------ */

interface Staged {
  file: string
  files?: string[]
}

const stagedCache = new Map<string, Staged>()
const STAGED_CACHE_MAX = 64

function getStagedCacheKey(data: ItemData, capturedAt?: number): string {
  switch (data.kind) {
    case 'files':
      return `files:${data.paths.join('|')}`
    case 'image':
      return `img:${data.imageId}:${data.ext || 'png'}:${capturedAt || 0}`
    case 'image-collection':
      return `imgs:${data.images.map((i) => i.imageId).join('|')}:${capturedAt || 0}`
    case 'text':
      return `text:${data.text.slice(0, 100)}`
  }
}

/** Pre-stage a drag request in the background so drag initiation is 0ms. */
export function prestageDrag(req: DragRequest): void {
  try {
    const resolved = resolveDragData(req)
    if (!resolved) return
    const { data, capturedAt } = resolved
    stageDragFile(data, capturedAt)
    dragIcon(data)
  } catch {}
}

/** Resolve the item to a concrete file path to hand to the OS. */
export function stageDragFile(data: ItemData, capturedAt?: number): Staged | null {
  const cacheKey = getStagedCacheKey(data, capturedAt)
  const cached = stagedCache.get(cacheKey)
  if (cached && existsSync(cached.file)) {
    return cached
  }

  const temp = getUnpackagedTempDir()
  mkdirSync(temp, { recursive: true })
  let result: Staged | null = null

  switch (data.kind) {
    case 'files': {
      const real = data.paths.filter((p) => existsSync(p))
      if (!real.length) return null
      const exposed = toUnpackagedFilePaths(real)
      result = { file: exposed[0], files: exposed }
      break
    }
    case 'image': {
      const src = getStore().getImagePath(data.imageId, data.ext)
      if (!existsSync(src)) return null
      const ext = extname(src) || '.png'
      const fileName = formatClipboardImageFilename(capturedAt, ext, {
        source: data.source,
        fileName: data.fileName
      })
      const dest = join(temp, fileName)
      try {
        if (!existsSync(dest)) {
          copyFileSync(src, dest)
        }
      } catch {
        return null
      }
      result = { file: dest, files: [dest] }
      break
    }
    case 'image-collection': {
      const paths: string[] = []
      let idx = 1
      for (const img of data.images) {
        const src = getStore().getImagePath(img.imageId, img.ext)
        if (existsSync(src)) {
          const ext = extname(src) || '.png'
          const fileName = formatClipboardImageFilename(capturedAt, ext, {
            source: img.source,
            fileName: img.fileName,
            indexSuffix: idx
          })
          const dest = join(temp, fileName)
          try {
            if (!existsSync(dest)) {
              copyFileSync(src, dest)
            }
            paths.push(dest)
            idx++
          } catch {
            // skip failed copies
          }
        }
      }
      if (!paths.length) return null
      result = { file: paths[0], files: paths }
      break
    }
    case 'text': {
      const id = `${Date.now().toString(36)}`
      const dest = join(temp, `Snippet_${id}.txt`)
      try {
        writeFileSync(dest, data.text, 'utf8')
      } catch {
        return null
      }
      result = { file: dest, files: [dest] }
      break
    }
  }

  if (result) {
    stagedCache.set(cacheKey, result)
    if (stagedCache.size > STAGED_CACHE_MAX) {
      const first = stagedCache.keys().next().value
      if (first) stagedCache.delete(first)
    }
    // Lifecycle tracking: register generated artifacts with the staged-temp
    // manager so they are reaped when their owning history item dies.
    // Only paths inside our managed temp roots are recorded — original user
    // files exposed by `files` bundles are never tracked.
    try {
      recordStagedFiles(data, result.files ?? [result.file])
    } catch {
      /* ignore — staging itself already succeeded */
    }
  }

  return result
}

/* ------------------------------------------------------------------ */
/* Drag icon (with small in-memory cache)                              */
/* ------------------------------------------------------------------ */

/** Cache recently built drag icons to avoid re-reading images. */
const iconCache = new Map<string, Electron.NativeImage>()
const ICON_CACHE_MAX = 64

/** Pre-fetch OS file icons into cache so dragIcon is synchronous. */
export function prefetchFileIcons(paths: string[]): void {
  for (const p of paths) {
    if (!p) continue
    const ext = extname(p).toLowerCase() || p
    if (!iconCache.has(ext)) {
      app.getFileIcon(p, { size: 'normal' }).then((icon) => {
        if (icon && !icon.isEmpty()) {
          // Store under the extension only — the previous per-full-path second
          // entry grew the map without bound across a long session.
          iconCache.set(ext, icon)
          trimIconCache()
        }
      }).catch(() => {})
    }
  }
}

/** Hard cap for both caches sharing this map, oldest entries evicted first. */
function trimIconCache(): void {
  while (iconCache.size > ICON_CACHE_MAX) {
    const first = iconCache.keys().next().value
    if (first === undefined) break
    iconCache.delete(first)
  }
}

/** A clean 1x1 transparent fallback so Windows uses default OS file icon without green box. */
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)
let emptyIcon: Electron.NativeImage | null = null

function getFileDragIcon(): Electron.NativeImage {
  if (emptyIcon && !emptyIcon.isEmpty()) return emptyIcon
  emptyIcon = nativeImage.createFromBuffer(TRANSPARENT_PNG)
  return emptyIcon
}

/**
 * Build the ghost image shown under the cursor during the drag.
 * We use real image thumbnails or custom SVG card stacks rendered via Resvg.
 */
function dragIcon(data: ItemData): Electron.NativeImage {
  try {
    if (data.kind === 'image' || data.kind === 'image-collection') {
      const isCollection = data.kind === 'image-collection'
      const count = isCollection ? data.images.length : 1
      if (count === 0) return getFileDragIcon()
      return createFileStackDragIcon(Array(count).fill('image.png'))
    }

    if (data.kind === 'files') {
      const count = data.paths.length
      if (count === 0) return getFileDragIcon()
      return createFileStackDragIcon(data.paths)
    }

    if (data.kind === 'text') {
      return createTextDragIcon(data.text)
    }
  } catch {}
  return getFileDragIcon()
}

import { buildFileDragSvg } from './fileSvg'

/** Generate a custom standalone SVG PNG icon representing file kinds with count badge. */
function createFileStackDragIcon(paths: string[]): Electron.NativeImage {
  const count = paths.length
  if (count === 0) return getFileDragIcon()

  const kinds = paths.slice(0, 3).map((p) => getFileKind(p).kind)
  const cacheKey = `stack|pastel-svg|${kinds.join('-')}|${count}`
  const cached = iconCache.get(cacheKey)
  if (cached && !cached.isEmpty()) {
    return cached
  }

  const svg = buildFileDragSvg(kinds, count)

  try {
    const resvg = new Resvg(svg, { fitTo: { mode: 'zoom', value: 2 } })
    const pngData = resvg.render().asPng()
    const img = nativeImage.createFromBuffer(pngData, { scaleFactor: 2 })
    if (!img.isEmpty()) {
      iconCache.set(cacheKey, img)
      if (iconCache.size > ICON_CACHE_MAX) {
        const first = iconCache.keys().next().value
        if (first) iconCache.delete(first)
      }
      return img
    }
  } catch {}
  return getFileDragIcon()
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case "'": return '&apos;'
      case '"': return '&quot;'
    }
    return c
  })
}

/** Generate a custom quote card PNG icon for text dragging. */
function createTextDragIcon(text: string): Electron.NativeImage {
  const cleaned = text.replace(/[\r\n]+/g, ' ').trim()
  let line1 = cleaned.substring(0, 28)
  let line2 = cleaned.substring(28, 56)
  
  if (cleaned.length > 28 && !cleaned.charAt(28).match(/\s/)) {
    const lastSpace = line1.lastIndexOf(' ')
    if (lastSpace > 15) {
      line1 = cleaned.substring(0, lastSpace)
      line2 = cleaned.substring(lastSpace + 1, lastSpace + 29)
    }
  }
  if (cleaned.length > line1.length + line2.length) {
    line2 = line2.replace(/.{3}$/, '...')
  }

  const width = 330
  const height = 92

  const defsSvg = `
    <defs>
      <clipPath id="textClip">
        <rect x="58" y="0" width="255" height="${height}" />
      </clipPath>
    </defs>
  `
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${defsSvg}
    <rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="14" fill="#000000" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" />
    
    <!-- Accent Icon -->
    <svg x="18" y="32" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#A0A0A5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>

    <!-- Text Content -->
    <g clip-path="url(#textClip)">
      <text x="58" y="42" font-family="sans-serif" font-size="15" font-weight="600" fill="#FFFFFF">${escapeXml(line1)}</text>
      ${line2 ? `<text x="58" y="66" font-family="sans-serif" font-size="14" font-weight="400" fill="#A0A0A5">${escapeXml(line2)}</text>` : ''}
    </g>
  </svg>`

  try {
    const resvg = new Resvg(svg, { fitTo: { mode: 'zoom', value: 2 } })
    const pngData = resvg.render().asPng()
    const img = nativeImage.createFromBuffer(pngData, { scaleFactor: 2 })
    if (!img.isEmpty()) return img
  } catch {}
  return getFileDragIcon()
}

/** Pre-warm common drag icons asynchronously in background so first drag is instant. */
export function prewarmDragIcons(): void {
  setTimeout(() => {
    try {
      const commonKinds = [
        'pdf', 'word', 'excel', 'powerpoint', 'archive',
        'text', 'code', 'audio', 'video', 'image',
        'executable', 'folder', 'file'
      ]
      for (const k of commonKinds) {
        createFileStackDragIcon([`dummy.${k}`])
      }
      createFileStackDragIcon(['dummy.image', 'dummy.image'])
      createFileStackDragIcon(['dummy.image', 'dummy.image', 'dummy.image'])
    } catch {}
  }, 400)
}
