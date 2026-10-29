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
import { copyFileSync, mkdirSync, writeFileSync, existsSync, statSync, readFileSync, writeFile, readdir, unlink } from 'node:fs'
import { join, extname } from 'node:path'
import { createHash } from 'node:crypto'
import { PATHS, getUnpackagedTempDir, toUnpackagedFilePaths } from '../store/paths'
import type { DragRequest, ItemData } from '../../shared/types'
import { getStore } from './state'
import { fileKindOf, type FileKind } from '../../src/lib/fileKind'
import { recordStagedFiles } from './stagedTemp'
import { uiMotionLeftMs } from './thumbnailCache'

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

/** The words in the names of files the app writes; main supplies them in the user's language. */
export interface FileNameWords {
  /** "Screenshot {stamp}" */
  screenshotName: string
  /** "Image {stamp}" */
  imageName: string
  /** a picture with no better name */
  image: string
  /** start of a dragged-out text's file name ("Snippet_k3x9.txt") */
  snippet: string
}

const ENGLISH_NAMES: FileNameWords = { screenshotName: 'Screenshot {stamp}', imageName: 'Image {stamp}', image: 'Image', snippet: 'Snippet' }
let fileNameWords: () => FileNameWords = () => ENGLISH_NAMES

/** Where the words for file names come from (index.ts: the user's language; English until then). */
export function setFileNameWords(source: () => FileNameWords): void {
  fileNameWords = source
}

function cleanName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim()
}

function sanitizeFileName(name: string): string {
  return cleanName(name) || cleanName(fileNameWords().image) || 'Image'
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
  const words = fileNameWords()
  const pattern = opts?.source === 'image' ? words.imageName : words.screenshotName
  const stamp = stampForFilename(capturedAt)
  const base = cleanName(pattern.includes('{stamp}') ? pattern.replace('{stamp}', () => stamp) : `${pattern} ${stamp}`)
  return `${base || stamp}${suffix}.${cleanExt}`
}

/** @deprecated use formatClipboardImageFilename */
export function formatScreenshotFilename(capturedAt?: number, ext = 'png', indexSuffix?: number): string {
  return formatClipboardImageFilename(capturedAt, ext, { source: 'screenshot', indexSuffix })
}

/**
 * Resolve a DragRequest into concrete ItemData along with capture timestamp.
 *
 * If `paths` is provided (dragging one file out of an expanded bundle), synthesize
 * a singleton `files` item. If `imageId` is provided, resolve that ONE image of
 * an image-collection and report its sibling index (1-based) via `subIndex` so
 * staging can give it a collision-free filename — every image in a collection
 * shares the parent's capturedAt stamp, and identical stamps otherwise collapse
 * every sub-drag onto the first-staged file.
 */
export function resolveDragData(req: DragRequest): { data: ItemData; capturedAt?: number; subIndex?: number } | null {
  if (req.paths && req.paths.length > 0) {
    prefetchFileIcons(req.paths)
    const parentItem = getStore().get(req.id)
    let entries: Array<{ name: string; ext: string; size: number; isImage: boolean; isDirectory?: boolean; preview?: string }> | undefined
    if (parentItem && parentItem.data.kind === 'files') {
      const parentEntries = parentItem.data.entries
      entries = req.paths.map((p) => {
        const found = parentEntries?.find((e) => e.name === p || p.endsWith(e.name) || p === e.name)
        if (found) return found
        let isDir = false
        try {
          if (existsSync(p)) isDir = statSync(p).isDirectory()
        } catch {}
        return { name: p, ext: '', size: 0, isImage: false, isDirectory: isDir }
      })
    }
    return { data: { kind: 'files', paths: req.paths, entries } }
  }
  const item = getStore().get(req.id)
  if (!item) return null

  if (item.data.kind === 'files') {
    prefetchFileIcons(item.data.paths)
  }

  if (req.imageId) {
    if (item.data.kind === 'image-collection') {
      const idx = item.data.images.findIndex((i) => i.imageId === req.imageId)
      if (idx >= 0) {
        return { data: { kind: 'image', ...item.data.images[idx] }, capturedAt: item.capturedAt, subIndex: idx + 1 }
      }
      // Requested image no longer exists in this collection. Refuse the drag
      // rather than silently dragging the whole collection (which surfaced as
      // "dragging any row always delivered the top image").
      console.warn('[Drag] sub-image not found in collection; aborting drag. id=', req.id, 'imageId=', req.imageId)
      return null
    }
    console.warn('[Drag] imageId requested for non-collection item; aborting drag. id=', req.id)
    return null
  }
  return { data: item.data, capturedAt: item.capturedAt }
}

export function startDragOut(sender: WebContents, data: ItemData, capturedAt?: number, subIndex?: number): boolean {
  const staged = stageDragFile(data, capturedAt, typeof subIndex === 'number' ? { indexSuffix: subIndex } : undefined)
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
  // the staged files' names are in the user's language: another language stages them again
  const words = fileNameWords()
  switch (data.kind) {
    case 'files':
      return `files:${data.paths.join('|')}`
    case 'image':
      return `img:${data.imageId}:${data.ext || 'png'}:${capturedAt || 0}:${words.screenshotName}:${words.imageName}`
    case 'image-collection':
      return `imgs:${data.images.map((i) => i.imageId).join('|')}:${capturedAt || 0}:${words.screenshotName}:${words.imageName}`
    case 'text':
      return `text:${data.text.slice(0, 100)}:${words.snippet}`
  }
}

/**
 * How long the pointer must rest on a card before its drag is prepared.
 * Hover sends a request for every card the pointer crosses, also while the
 * list scrolls under a still pointer; preparing each one (file copies, ghost
 * art) on the main thread stalled the scroll, since every frame of this
 * window passes through the main thread. Only the card the pointer settles on
 * is prepared, and never while the panel is still opening or closing; a drag
 * that starts sooner prepares itself in startDragOut.
 */
const PRESTAGE_REST_MS = 150
let prestageTimer: ReturnType<typeof setTimeout> | null = null
let prestageReq: DragRequest | null = null

/** Pre-stage a drag request in the background so drag initiation is 0ms. */
export function prestageDrag(req: DragRequest): void {
  prestageReq = req
  schedulePrestage(PRESTAGE_REST_MS)
}

function schedulePrestage(ms: number): void {
  if (prestageTimer !== null) clearTimeout(prestageTimer)
  prestageTimer = setTimeout(() => {
    prestageTimer = null
    const motion = uiMotionLeftMs()
    if (motion > 0) {
      schedulePrestage(motion)
      return
    }
    const next = prestageReq
    prestageReq = null
    if (next) prestageNow(next)
  }, ms)
}

function prestageNow(req: DragRequest): void {
  try {
    const resolved = resolveDragData(req)
    if (!resolved) return
    const { data, capturedAt, subIndex } = resolved
    stageDragFile(data, capturedAt, typeof subIndex === 'number' ? { indexSuffix: subIndex } : undefined)
    dragIcon(data)
  } catch {}
}

/**
 * Resolve a unique destination path inside `temp` for a staged image.
 *
 * WHY NOT A BLIND existsSync SKIP: images inside one collection share the
 * parent's capturedAt stamp, so distinct photos computed identical names —
 * the first staged file won and every sibling silently reused it. We now
 * treat an existing candidate as reusable ONLY when its size matches the
 * expected payload; otherwise we append Windows-style " (2)", " (3)"…
 * until the name is genuinely free.
 */
function resolveUniqueImageDest(temp: string, fileName: string, ext: string, expectedBytes: number): string {
  const cleanExt = ext.replace(/^\./, '') || 'png'
  const base = fileName.replace(/\.[^.]+$/, '')
  let candidate = join(temp, `${base}.${cleanExt}`)
  if (!existsSync(candidate)) return candidate

  // Existing file: reusable only if it plausibly holds this exact payload.
  try {
    if (expectedBytes > 0 && statSync(candidate).size === expectedBytes) return candidate
  } catch { /* fall through to suffixing */ }

  let n = 2
  do {
    candidate = join(temp, `${base} (${n}).${cleanExt}`)
    n++
  } while (existsSync(candidate) && n < 1000)
  return candidate
}

/** Resolve the item to a concrete file path to hand to the OS. */
export function stageDragFile(
  data: ItemData,
  capturedAt?: number,
  opts?: { indexSuffix?: number }
): Staged | null {
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
        fileName: data.fileName,
        indexSuffix: opts?.indexSuffix
      })
      // Sub-images of one collection share the parent's stamp; guarantee a
      // distinct file per photo instead of blind-reusing an existing name.
      const dest = resolveUniqueImageDest(temp, fileName, ext, data.bytes || 0)
      try {
        copyFileSync(src, dest)
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
          const dest = resolveUniqueImageDest(temp, fileName, ext, img.bytes || 0)
          try {
            copyFileSync(src, dest)
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
      const dest = join(temp, `${cleanName(fileNameWords().snippet) || 'Snippet'}_${id}.txt`)
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
      return createFileStackDragIcon(Array(count).fill('image.png'), Array(count).fill({ isDirectory: false }))
    }

    if (data.kind === 'files') {
      const count = data.paths.length
      if (count === 0) return getFileDragIcon()
      return createFileStackDragIcon(data.paths, data.entries)
    }

    if (data.kind === 'text') {
      return createTextDragIcon(data.text)
    }
  } catch {}
  return getFileDragIcon()
}

import { buildFileDragSvg, buildDragSvgFromArt, dragSvgHasArt } from './fileSvg'

/*
 * Ghost rasterizing cost, measured: Resvg loads every installed font unless
 * told otherwise (~150ms per call), and each piece of file art runs blur and
 * grain filters (~50ms). A stack paid both, plus the art three times: 200-550ms
 * on the main thread, a frozen shelf. Now no system fonts are loaded (the count
 * badge gets Segoe UI Bold alone), each kind's art is rasterized once and kept
 * on disk, and ghosts are composed from those bitmaps (single ~5ms, stack ~18ms).
 */
const GHOST_ZOOM = 2
/** Art bitmap width: one stack slot (512 units of the 142px stack ghost) at GHOST_ZOOM. */
const ART_PX = 142 * GHOST_ZOOM
const NO_FONTS = { loadSystemFonts: false }

type GhostFonts = { loadSystemFonts: boolean; fontFiles?: string[]; defaultFontFamily?: string; sansSerifFamily?: string }
const ghostFonts = new Map<string, GhostFonts>()
/**
 * Fonts for ghost text: just the named Segoe UI files from the Windows font
 * folder (each one parsed per render, so only what the text uses); the full
 * system scan only if one is missing.
 */
function ghostTextFonts(names: string[]): GhostFonts {
  const key = names.join('|')
  const hit = ghostFonts.get(key)
  if (hit) return hit
  const dir = join(process.env.WINDIR || 'C:\\Windows', 'Fonts')
  const files = names.map((f) => join(dir, f))
  const fonts = files.every((f) => existsSync(f))
    ? { loadSystemFonts: false, fontFiles: files, defaultFontFamily: 'Segoe UI', sansSerifFamily: 'Segoe UI' }
    : { loadSystemFonts: true }
  ghostFonts.set(key, fonts)
  return fonts
}
/** The stack count badge: bold only. */
const BADGE_FONTS = ['segoeuib.ttf']
/** The text ghost: regular and semibold lines. */
const TEXT_FONTS = ['segoeui.ttf', 'seguisb.ttf']

/** Rasterized art per kind used this session (~60 KB of PNG each, at most 13). */
const artPngCache = new Map<string, Buffer>()

/**
 * One kind's art as a PNG of ART_PX: from memory, else from the disk cache,
 * else rendered once (and saved, so later sessions skip it). Null when no art
 * can be read at all. `remember: false` only makes sure it is on disk.
 */
function kindArtPng(kind: FileKind, remember = true): Buffer | null {
  const svg = buildFileDragSvg([kind], 1)
  if (!dragSvgHasArt(svg)) return null
  const name = `${kind}-${createHash('sha1').update(svg).digest('hex').slice(0, 12)}-${ART_PX}.png`
  const hit = artPngCache.get(name)
  if (hit) return hit
  const dir = PATHS.dragArtDir()
  let png: Buffer
  if (existsSync(join(dir, name))) {
    if (!remember) return null
    try {
      png = readFileSync(join(dir, name))
    } catch {
      return null
    }
  } else {
    try {
      png = new Resvg(svg, { fitTo: { mode: 'width', value: ART_PX }, font: NO_FONTS }).render().asPng()
    } catch {
      return null
    }
    saveArt(dir, name, kind, png)
  }
  if (remember) artPngCache.set(name, png)
  return png
}

/** Write a kind's art to the disk cache (off the main thread) and drop its older versions. */
function saveArt(dir: string, name: string, kind: string, png: Buffer): void {
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    return
  }
  writeFile(join(dir, name), png, () => {})
  readdir(dir, (err, names) => {
    if (err) return
    for (const n of names) {
      if (n.startsWith(`${kind}-`) && n !== name) unlink(join(dir, n), () => {})
    }
  })
}

const pngUri = (png: Buffer | null): string | null => (png ? `data:image/png;base64,${png.toString('base64')}` : null)

/** Generate a custom standalone SVG PNG icon representing file kinds with count badge. */
function createFileStackDragIcon(paths: string[], entries?: Array<{ isDirectory?: boolean }>): Electron.NativeImage {
  const count = paths.length
  if (count === 0) return getFileDragIcon()

  const kinds = paths.slice(0, 3).map((p, idx) => {
    let isDir = entries?.[idx]?.isDirectory
    if (isDir === undefined) {
      try {
        if (existsSync(p)) {
          isDir = statSync(p).isDirectory()
        }
      } catch {}
    }
    return fileKindOf(p, isDir)
  })
  const cacheKey = `stack|svg|${kinds.join('-')}|${count}`
  const cached = iconCache.get(cacheKey)
  if (cached && !cached.isEmpty()) {
    return cached
  }

  const svg = buildDragSvgFromArt(kinds.map((kind) => pngUri(kindArtPng(kind))), count)
  // No art could be read: an invisible ghost must not be rasterized, and
  // above all must not be cached for the rest of the session.
  if (!dragSvgHasArt(svg)) return getFileDragIcon()

  try {
    const resvg = new Resvg(svg, { fitTo: { mode: 'zoom', value: GHOST_ZOOM }, font: count > 1 ? ghostTextFonts(BADGE_FONTS) : NO_FONTS })
    const pngData = resvg.render().asPng()
    const img = nativeImage.createFromBuffer(pngData, { scaleFactor: GHOST_ZOOM })
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
    const resvg = new Resvg(svg, { fitTo: { mode: 'zoom', value: GHOST_ZOOM }, font: ghostTextFonts(TEXT_FONTS) })
    const pngData = resvg.render().asPng()
    const img = nativeImage.createFromBuffer(pngData, { scaleFactor: GHOST_ZOOM })
    if (!img.isEmpty()) return img
  } catch {}
  return getFileDragIcon()
}

const ART_KINDS: FileKind[] = [
  'pdf', 'word', 'excel', 'powerpoint', 'archive', 'text', 'code',
  'audio', 'video', 'image', 'executable', 'folder', 'file'
]

/**
 * Put every kind's art in the disk cache so no hover or drag ever renders it.
 * Usually nothing to do (it is already there); otherwise one kind per idle
 * moment, only while the shelf is closed, nothing kept in memory.
 */
export function prewarmDragIcons(isBusy: () => boolean): void {
  const pending = [...ART_KINDS]
  const next = (): void => {
    if (pending.length === 0) return
    if (isBusy() || uiMotionLeftMs() > 0) {
      setTimeout(next, 2000)
      return
    }
    try {
      kindArtPng(pending.shift()!, false)
    } catch { /* the next drag of this kind renders it */ }
    setTimeout(next, 300)
  }
  setTimeout(next, 8000)
}
