/**
 * In-memory + on-disk store for clipboard history.
 *
 * Responsibilities:
 *   - Keep an ordered list (most recent first) of ClipboardItem.
 *   - Deduplicate by content signature so re-copies bump `hitCount` instead of
 *     adding a clone.
 *   - Enforce a size cap, evicting the oldest *unpinned* items.
 *   - Persist the index to JSON and image bytes to per-item PNG files.
 *   - Convert internal items to the serializable DTO form for the renderer.
 */
import { existsSync, readFileSync, writeFileSync, rmSync, statSync, readdirSync } from 'node:fs'
import { join, extname, basename as pathBasename } from 'node:path'
import { nativeImage, safeStorage } from 'electron'
import {
  type ClipboardItem,
  type ClipboardItemDto,
  type DragRequest,
  type ItemData,
  type MergeResult,
  type FileEntry,
  MAX_STACK
} from '../../shared/types'
import { PATHS } from './paths'
import { createId } from './ids'

/** Stable, content-based key used for deduplication. */
function signature(data: ItemData): string {
  switch (data.kind) {
    case 'text':
      return `text|${data.text}`
    case 'image':
      return `image|${data.imageId}`
    case 'image-collection':
      return `image-collection|${data.images.map((i) => i.imageId).join(',')}`
    case 'files':
      return `files|${data.paths.join('\n')}`
  }
}

/** Maps a signature -> item id so dedup is O(1). */
interface Index {
  items: ClipboardItem[]
}

export class ItemStore {
  private items: ClipboardItem[] = []
  private sigToId = new Map<string, string>()
  /** Small, bounded thumbnails for renderer DTOs. Original image bytes stay on disk. */
  private previewCache = new Map<string, string>()

  /** Load persisted state from disk. Called once at startup. */
  load(): void {
    try {
      const file = PATHS.indexFile()
      if (!existsSync(file)) {
        this.items = []
        this.rebuildIndex()
        return
      }

      const rawBuffer = readFileSync(file)
      const rawStr = rawBuffer.toString('utf8').trim()
      let parsedIndex: Index | null = null
      let needsMigration = false

      let parsedJson: any = null
      try {
        parsedJson = JSON.parse(rawStr)
      } catch {
        /* Raw non-JSON payload */
      }

      if (parsedJson && parsedJson.encrypted === true && typeof parsedJson.payload === 'string') {
        // Encrypted DPAPI Envelope
        if (safeStorage.isEncryptionAvailable()) {
          try {
            const decryptedStr = safeStorage.decryptString(Buffer.from(parsedJson.payload, 'base64'))
            parsedIndex = JSON.parse(decryptedStr) as Index
          } catch (err) {
            console.error('[ItemStore] DPAPI decryption failed:', err)
          }
        } else {
          console.warn('[ItemStore] safeStorage unavailable to decrypt items.json')
        }
      } else if (parsedJson && Array.isArray(parsedJson.items)) {
        // Plain JSON (Legacy v0.1.1 format from active users)
        parsedIndex = parsedJson as Index
        needsMigration = true
      }

      if (parsedIndex && Array.isArray(parsedIndex.items)) {
        this.items = parsedIndex.items.filter((it) => it && it.data && typeof it.id === 'string')
        this.rebuildIndex()

        // Auto-migrate legacy plain JSON: create backup & upgrade to DPAPI encryption
        if (needsMigration) {
          console.log('[ItemStore] Migrating legacy plain-text items.json to DPAPI safeStorage encryption...')
          try {
            const backupFile = `${file}.v1.bak`
            if (!existsSync(backupFile)) {
              writeFileSync(backupFile, rawBuffer)
            }
            this.persist()
            console.log('[ItemStore] Auto-migration to DPAPI encryption completed successfully!')
          } catch (err) {
            console.error('[ItemStore] Auto-migration backup/persist failed:', err)
          }
        }
      } else {
        console.warn('[ItemStore] Index file could not be parsed; preserving data without wiping')
        const backupFile = `${file}.corrupted.${Date.now()}`
        try { writeFileSync(backupFile, rawBuffer) } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('[ItemStore] Failed to load index file:', err)
      this.items = []
      this.sigToId.clear()
    }
  }

  private rebuildIndex(): void {
    this.sigToId.clear()
    for (const it of this.items) this.sigToId.set(signature(it.data), it.id)
  }

  /** Persist the current index to disk. Called after every mutation. */
  private persist(): void {
    try {
      const indexObj: Index = { items: this.items }
      const jsonStr = JSON.stringify(indexObj)
      const file = PATHS.indexFile()

      if (safeStorage.isEncryptionAvailable()) {
        const encryptedBuf = safeStorage.encryptString(jsonStr)
        const envelope = {
          v: 2,
          encrypted: true,
          payload: encryptedBuf.toString('base64')
        }
        writeFileSync(file, JSON.stringify(envelope, null, 2), 'utf8')
      } else {
        writeFileSync(file, JSON.stringify(indexObj, null, 2), 'utf8')
      }
    } catch (err) {
      console.error('[ItemStore] Persistence failed:', err)
    }
  }

  /**
   * Enforce the size cap by evicting oldest *unpinned* items. Walks from the
   * tail (oldest) forward, skipping anything pinned so favorites survive.
   */
  private trim(limit: number): void {
    if (this.items.length <= limit) return
    const need = this.items.length - limit
    const survivors: ClipboardItem[] = []
    let stillNeed = need
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]
      if (stillNeed > 0 && !it.pinned) {
        this.sigToId.delete(signature(it.data))
        if (it.data.kind === 'image') this.removeImageFile(it.data.imageId)
        if (it.data.kind === 'image-collection') {
          it.data.images.forEach((img) => this.removeImageFile(img.imageId))
        }
        stillNeed--
      } else {
        survivors.unshift(it)
      }
    }
    this.items = survivors
  }

  /**
   * Add or refresh a piece of content.
   * Returns true if the list actually changed (so callers can decide to push).
   */
  add(data: ItemData, limit: number): boolean {
    const sig = signature(data)
    const existingId = this.sigToId.get(sig)
    const now = Date.now()

    if (existingId) {
      const idx = this.items.findIndex((it) => it.id === existingId)
      if (idx >= 0) {
        const it = this.items[idx]
        // Bump count and move to front.
        const updated: ClipboardItem = { ...it, hitCount: it.hitCount + 1, capturedAt: now }
        this.items.splice(idx, 1)
        this.items.unshift(updated)
        this.persist()
        return true
      }
    }

    const id = createId()
    const item: ClipboardItem = { id, data, capturedAt: now, hitCount: 1, pinned: false }
    this.items.unshift(item)
    this.sigToId.set(sig, id)
    if (data.kind === 'image') this.writeImageFile(data.imageId)
    this.trim(limit)
    this.persist()
    return true
  }

  setPinned(id: string, pinned: boolean): void {
    const it = this.items.find((x) => x.id === id)
    if (!it) return
    it.pinned = pinned
    this.persist()
  }

  delete(id: string): void {
    const idx = this.items.findIndex((x) => x.id === id)
    if (idx < 0) return
    const [removed] = this.items.splice(idx, 1)
    this.sigToId.delete(signature(removed.data))
    if (removed.data.kind === 'image') this.removeImageFile(removed.data.imageId)
    if (removed.data.kind === 'image-collection') {
      removed.data.images.forEach((img) => this.removeImageFile(img.imageId))
    }
    this.persist()
  }

  merge(sourceId: string, targetId: string): MergeResult {
    if (sourceId === targetId) return { ok: false }
    const srcIdx = this.items.findIndex(x => x.id === sourceId)
    const tgtIdx = this.items.findIndex(x => x.id === targetId)
    if (srcIdx < 0 || tgtIdx < 0) return { ok: false, reason: 'notfound' }

    const src = this.items[srcIdx]
    const tgt = this.items[tgtIdx]

    // Determine how to merge based on kinds
    // 1. Files + Files -> Files          (any non-image files stack together)
    // 2. Image(s) + Image(s) -> Image Collection
    // 3. Cross image <-> files -> reject (keeps image previews intact)

    let newData: ItemData | null = null

    const srcIsImage = src.data.kind === 'image' || src.data.kind === 'image-collection'
    const tgtIsImage = tgt.data.kind === 'image' || tgt.data.kind === 'image-collection'

    if (srcIsImage && tgtIsImage) {
      const srcImages = src.data.kind === 'image-collection' ? src.data.images : src.data.kind === 'image' ? [{ imageId: src.data.imageId, width: src.data.width, height: src.data.height, bytes: src.data.bytes }] : []
      const tgtImages = tgt.data.kind === 'image-collection' ? tgt.data.images : tgt.data.kind === 'image' ? [{ imageId: tgt.data.imageId, width: tgt.data.width, height: tgt.data.height, bytes: tgt.data.bytes }] : []
      // Filter out exact duplicate imageIds just in case
      const seen = new Set(tgtImages.map((i: { imageId: string }) => i.imageId))
      const combined = [...tgtImages, ...srcImages.filter((i: { imageId: string }) => !seen.has(i.imageId))]

      // Enforce the per-stack cap BEFORE mutating anything.
      if (combined.length > MAX_STACK) return { ok: false, reason: 'full', message: 'An image collection can hold a maximum of 10 items' }
      newData = { kind: 'image-collection', images: combined }
    } else if (src.data.kind === 'files' && tgt.data.kind === 'files') {
      const seen = new Set(tgt.data.paths)
      const combined = [...tgt.data.paths, ...src.data.paths.filter(p => !seen.has(p))]

      if (combined.length > MAX_STACK) return { ok: false, reason: 'full', message: 'A folder bundle can hold a maximum of 10 files' }
      newData = { kind: 'files', paths: combined }
    }

    if (!newData) {
      if (srcIsImage || tgtIsImage) {
        return { ok: false, reason: 'incompatible', message: 'Images can only be grouped with other images' }
      } else if (src.data.kind === 'files' || tgt.data.kind === 'files') {
        return { ok: false, reason: 'incompatible', message: 'Files can only be grouped with other files' }
      }
      return { ok: false, reason: 'incompatible', message: 'Text and links cannot be grouped together' }
    }

    // Update target item
    this.sigToId.delete(signature(tgt.data))
    tgt.data = newData
    this.sigToId.set(signature(newData), tgt.id)
    tgt.capturedAt = Date.now() // bump time

    // Remove source item completely but DO NOT delete its underlying files/images
    // because they are now owned by the target!
    const [removed] = this.items.splice(srcIdx, 1)
    this.sigToId.delete(signature(removed.data))

    this.persist()
    return { ok: true }
  }

  public removeSubitem(req: DragRequest): boolean {
    const sourceItem = this.get(req.id)
    if (!sourceItem) return false
    const sourceIndex = this.items.findIndex(i => i.id === req.id)
    if (sourceIndex === -1) return false

    if (sourceItem.data.kind === 'image-collection' && req.imageId) {
      const imgIdx = sourceItem.data.images.findIndex(i => i.imageId === req.imageId)
      if (imgIdx === -1) return false
      
      sourceItem.data.images.splice(imgIdx, 1)
      
      if (sourceItem.data.images.length === 1) {
        sourceItem.data = { kind: 'image', ...sourceItem.data.images[0] }
      } else if (sourceItem.data.images.length === 0) {
        this.items.splice(sourceIndex, 1)
      }
      this.rebuildIndex()
      this.persist()
      return true
    }

    if (req.paths && req.paths.length > 0 && sourceItem.data.kind === 'files') {
      const targetPaths = req.paths
      sourceItem.data.paths = sourceItem.data.paths.filter(p => !targetPaths.includes(p))
      
      if (sourceItem.data.paths.length === 0) {
        this.items.splice(sourceIndex, 1)
      }
      this.rebuildIndex()
      this.persist()
      return true
    }

    return false
  }

  public split(req: DragRequest): boolean {
    const sourceItem = this.get(req.id)
    if (!sourceItem) return false
    const sourceIndex = this.items.findIndex(i => i.id === req.id)
    if (sourceIndex === -1) return false

    // Splitting from an image collection
    if (sourceItem.data.kind === 'image-collection' && req.imageId) {
      const imgIdx = sourceItem.data.images.findIndex(i => i.imageId === req.imageId)
      if (imgIdx === -1) return false
      
      const targetImg = sourceItem.data.images[imgIdx]
      sourceItem.data.images.splice(imgIdx, 1)
      
      if (sourceItem.data.images.length === 1) {
        sourceItem.data = { kind: 'image', ...sourceItem.data.images[0] }
      } else if (sourceItem.data.images.length === 0) {
        this.items.splice(sourceIndex, 1)
      }

      const newItem: ClipboardItem = {
        id: createId(),
        capturedAt: Date.now(),
        hitCount: 1,
        pinned: false,
        data: { kind: 'image', imageId: targetImg.imageId, width: targetImg.width, height: targetImg.height, bytes: targetImg.bytes }
      }
      this.items.splice(req.splitPlacement === 'after' ? sourceIndex + 1 : sourceIndex, 0, newItem)
      this.rebuildIndex()
      this.persist()
      return true
    }

    // Splitting from a file collection
    if (req.paths && req.paths.length > 0 && sourceItem.data.kind === 'files') {
      const sourcePaths = sourceItem.data.paths
      const targetPaths = req.paths
      
      sourceItem.data.paths = sourcePaths.filter(p => !targetPaths.includes(p))
      
      if (sourceItem.data.paths.length === 0) {
        this.items.splice(sourceIndex, 1)
      }

      const newItem: ClipboardItem = {
        id: createId(),
        capturedAt: Date.now(),
        hitCount: 1,
        pinned: false,
        data: { kind: 'files', paths: targetPaths }
      }
      this.items.splice(req.splitPlacement === 'after' ? sourceIndex + 1 : sourceIndex, 0, newItem)
      this.rebuildIndex()
      this.persist()
      return true
    }

    return false
  }

  clearUnpinned(): void {
    const kept: ClipboardItem[] = []
    for (const it of this.items) {
      if (it.pinned) kept.push(it)
      else {
        this.sigToId.delete(signature(it.data))
        if (it.data.kind === 'image') this.removeImageFile(it.data.imageId)
        if (it.data.kind === 'image-collection') {
          it.data.images.forEach((img) => this.removeImageFile(img.imageId))
        }
      }
    }
    this.items = kept
    this.persist()
  }

  pruneExpired(hours: number): boolean {
    if (!hours || hours <= 0) return false
    const cutoff = Date.now() - hours * 3600 * 1000
    const kept: ClipboardItem[] = []
    let removedAny = false
    for (const it of this.items) {
      if (it.pinned || it.capturedAt >= cutoff) {
        kept.push(it)
      } else {
        removedAny = true
        this.sigToId.delete(signature(it.data))
        if (it.data.kind === 'image') this.removeImageFile(it.data.imageId)
        if (it.data.kind === 'image-collection') {
          it.data.images.forEach((img) => this.removeImageFile(img.imageId))
        }
      }
    }
    if (removedAny) {
      this.items = kept
      this.persist()
    }
    return removedAny
  }

  get(id: string): ClipboardItem | undefined {
    return this.items.find((x) => x.id === id)
  }

  list(): readonly ClipboardItem[] {
    return this.items
  }

  /* ----------------------------- image files ----------------------------- */

  /**
   * Build a display-sized image preview. Sending originals as base64 data URLs
   * duplicates every image in the main process, IPC payload and renderer heap.
   */
  imageToDataUrl(imageId: string, ext?: string): string | null {
    const cacheKey = `${imageId}.${ext || ''}`
    const cached = this.previewCache.get(cacheKey)
    if (cached) {
      this.previewCache.delete(cacheKey)
      this.previewCache.set(cacheKey, cached)
      return cached
    }
    try {
      const img = nativeImage.createFromPath(this.imagePath(imageId, ext))
      if (img.isEmpty()) return null
      const size = img.getSize()
      const thumb = size.width > THUMB_SIZE || size.height > THUMB_SIZE
        ? img.resize({ width: THUMB_SIZE, quality: 'good' })
        : img
      const url = thumb.toDataURL({ scaleFactor: 1 })
      if (this.previewCache.size >= PREVIEW_CACHE_MAX) {
        this.previewCache.delete(this.previewCache.keys().next().value!)
      }
      this.previewCache.set(cacheKey, url)
      return url
    } catch {
      return null
    }
  }

  /**
   * Stage an image's bytes from a clipboard capture. The image was already
   * written to userData/images by the clipboard watcher (which has the raw
   * nativeImage); here we just no-op because the file already exists.
   * Kept for symmetry / future use.
   */
  private writeImageFile(_imageId: string): void {
    /* no-op: bytes already on disk from capture */
  }

  public getImagePath(imageId: string, ext?: string): string {
    return this.imagePath(imageId, ext)
  }

  private imagePath(imageId: string, ext?: string): string {
    if (ext) {
      const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext
      return join(PATHS.imagesDir(), `${imageId}.${cleanExt}`)
    }
    const dir = PATHS.imagesDir()
    if (existsSync(dir)) {
      try {
        const files = readdirSync(dir)
        for (const f of files) {
          if (f.startsWith(`${imageId}.`)) {
            return join(dir, f)
          }
        }
      } catch { /* ignore */ }
    }
    return join(PATHS.imagesDir(), `${imageId}.png`)
  }

  private removeImageFile(imageId: string): void {
    for (const key of this.previewCache.keys()) {
      if (key.startsWith(imageId)) this.previewCache.delete(key)
    }
    const dir = PATHS.imagesDir()
    if (!existsSync(dir)) return
    try {
      const files = readdirSync(dir)
      for (const f of files) {
        if (f.startsWith(`${imageId}.`)) {
          rmSync(join(dir, f), { force: true })
        }
      }
    } catch {
      /* ignore */
    }
  }

  /* ------------------------------- DTO ----------------------------------- */

  /** Snapshot the whole list as renderer-safe DTOs (images inlined). */
  toDto(): ClipboardItemDto[] {
    return this.items.map((it) => {
      if (it.data.kind === 'image') {
        const { kind, imageId, width, height, bytes, ext } = it.data
        return {
          ...it,
          data: { kind, imageId, width, height, bytes, ext, preview: this.imageToDataUrl(imageId, ext) ?? '' }
        }
      }
      if (it.data.kind === 'image-collection') {
        const imagesWithPreviews = it.data.images.map((img) => ({
          ...img,
          preview: this.imageToDataUrl(img.imageId, img.ext) ?? ''
        }))
        return {
          ...it,
          data: { kind: 'image-collection', images: imagesWithPreviews }
        }
      }
      if (it.data.kind === 'files') {
        // Build per-file metadata entries. Generate image preview thumbnails for image files.
        let imagePreviewCount = 0
        const entries = it.data.paths.map((p) => {
          const entry = buildFileEntry(p)
          if (entry.isImage && imagePreviewCount < 20) {
            imagePreviewCount++
            return {
              ...entry,
              preview: fileToDataUrl(p)
            }
          }
          return entry
        })
        return {
          ...it,
          data: { ...it.data, entries }
        }
      }
      return { ...it, data: it.data }
    })
  }

  /** Persist a brand-new image captured from the clipboard to its PNG file. */
  stageImageBytes(imageId: string, png: Buffer, ext = 'png'): void {
    try {
      writeFileSync(this.imagePath(imageId, ext), png)
    } catch {
      /* ignore */
    }
  }
}

/** Check if a file path points to an image by extension. */
function isImageExt(p: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?|jfif|pjpeg|pjp)$/i.test(p)
}

/**
 * Build display metadata for a single file path. `size` is best-effort (0 when
 * the file can't be stat'd — e.g. a path on a disconnected drive); the renderer
 * hides the size label when it's 0.
 */
const fileEntryCache = new Map<string, FileEntry>()
const fileDataUrlCache = new Map<string, string>()

function buildFileEntry(p: string): FileEntry {
  if (fileEntryCache.has(p)) return fileEntryCache.get(p)!
  let size = 0
  try {
    size = statSync(p).size
  } catch {
    /* file missing / unreadable — size stays 0 */
  }
  const ext = (extname(p).slice(1) || '').toLowerCase()
  const name = pathBasename(p)
  const entry = { name, ext, size, isImage: isImageExt(p) }
  if (fileEntryCache.size > 500) fileEntryCache.clear()
  fileEntryCache.set(p, entry)
  return entry
}

/** 
 * Read an image file from disk and return a small thumbnail as a JPEG data URL.
 * We use Electron's nativeImage.createFromPath().resize() to generate a small
 * thumbnail on-the-fly without loading the full image bytes into memory.
 * This keeps the IPC payload tiny (thumbnail vs 8-9MB original) and prevents
 * the main thread from blocking when the user copies large images.
 */
const THUMB_SIZE = 240 // px — enough for the card UI, tiny IPC payload

const PREVIEW_CACHE_MAX = 100

function fileToDataUrl(p: string): string {
  if (fileDataUrlCache.has(p)) return fileDataUrlCache.get(p)!
  try {
    // Use Electron nativeImage to create a thumbnail without loading the full file.
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) {
      const size = img.getSize()
      // Only resize if the image is larger than our thumbnail size.
      const needsResize = size.width > THUMB_SIZE || size.height > THUMB_SIZE
      const thumb = needsResize
        ? img.resize({ width: THUMB_SIZE, quality: 'good' })
        : img
      const url = thumb.toDataURL({ scaleFactor: 1.0 })
      if (fileDataUrlCache.size > 200) fileDataUrlCache.clear()
      fileDataUrlCache.set(p, url)
      return url
    }
    // Fallback for SVG and other formats nativeImage can't decode — read raw.
    const buf = readFileSync(p)
    const mime = detectImageMime(buf)
    const url = `data:${mime};base64,${buf.toString('base64')}`
    if (fileDataUrlCache.size > 200) fileDataUrlCache.clear()
    fileDataUrlCache.set(p, url)
    return url
  } catch {
    return ''
  }
}

/** Detect exact MIME type from image magic bytes. */
function detectImageMime(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg'
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png'
  if (buf.length >= 3 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp'
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4D) return 'image/bmp'
  if (buf.length >= 4 && buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return 'image/x-icon'
  if (buf.length >= 4 && ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2A && buf[3] === 0x00) || (buf[0] === 0x4D && buf[1] === 0x4D && buf[2] === 0x00 && buf[3] === 0x2A))) return 'image/tiff'
  if (buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'image/avif'
  const head = buf.subarray(0, 1024).toString('utf8').trim()
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.includes('<svg')) return 'image/svg+xml'
  return 'image/png'
}
