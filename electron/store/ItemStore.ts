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
import { thumbnailUrlForFile, thumbnailUrlForStoredImage } from '../main/imageProtocol'
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
import { contentSignature } from './signature'

/** Maps a signature -> item id so dedup is O(1). */
interface Index {
  items: ClipboardItem[]
}

/**
 * Invoked with every batch of items permanently removed from history, no
 * matter which door removed them (manual delete, batch delete, clear,
 * auto-delete prune, or silent capacity eviction). The staged-temp lifecycle
 * manager uses it to reap orphaned artifacts.
 */
export type ItemsRemovedListener = (removed: readonly ClipboardItem[]) => void

export class ItemStore {
  private items: ClipboardItem[] = []
  private sigToId = new Map<string, string>()
  /** Small, bounded thumbnails for renderer DTOs. Original image bytes stay on disk. */
  private previewCache = new Map<string, string>()

  constructor(private readonly onRemoved?: ItemsRemovedListener) {}

  private notifyRemoved(removed: ClipboardItem[]): void {
    if (removed.length === 0) return
    try {
      this.onRemoved?.(removed)
    } catch (err) {
      console.error('[ItemStore] onRemoved listener failed:', err)
    }
  }

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

        // Auto-migrate large text items to disk payload files
        let migratedAnyPayloads = false
        for (const it of this.items) {
          if (it.data.kind === 'text') {
            if (!it.data.hasFullPayload && it.data.text.length > 300) {
              this.writeTextPayload(it.id, it.data.text)
              it.data.hasFullPayload = true
              it.data.previewText = it.data.text.slice(0, 300)
              it.data.text = it.data.previewText
              migratedAnyPayloads = true
            }
          }
        }

        this.rebuildIndex()

        // Auto-migrate legacy plain JSON: create backup & upgrade to DPAPI encryption
        if (needsMigration || migratedAnyPayloads) {
          console.log('[ItemStore] Migrating items.json to DPAPI safeStorage encryption and disk payloads...')
          try {
            const backupFile = `${file}.v1.bak`
            if (!existsSync(backupFile)) {
              writeFileSync(backupFile, rawBuffer)
            }
            this.persist()
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
    for (const it of this.items) this.sigToId.set(contentSignature(it.data), it.id)
  }

  private persistTimer: ReturnType<typeof setTimeout> | null = null

  /** Persist the current index to disk. Debounced to prevent main thread blocking during UI transitions. */
  private persist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.persistSync()
    }, 150)
  }

  /** Synchronous disk write (called by debounced timer or on app shutdown). */
  public persistSync(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
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
    const evicted: ClipboardItem[] = []
    let stillNeed = need
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]
      if (stillNeed > 0 && !it.pinned) {
        this.sigToId.delete(contentSignature(it.data))
        if (it.data.kind === 'image') this.removeImageFile(it.data.imageId)
        if (it.data.kind === 'image-collection') {
          it.data.images.forEach((img) => this.removeImageFile(img.imageId))
        }
        if (it.data.kind === 'text') this.removeTextPayload(it.id)
        evicted.push(it)
        stillNeed--
      } else {
        survivors.unshift(it)
      }
    }
    this.items = survivors
    this.notifyRemoved(evicted)
  }

  /**
   * Add or refresh a piece of content.
   * Returns true if the list actually changed (so callers can decide to push).
   */
  add(data: ItemData, limit: number): boolean {
    if (data.kind === 'text' && data.text.length > 500000) {
      data = { ...data, text: data.text.slice(0, 500000) }
    }
    const sig = contentSignature(data)
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
    let finalData = data
    if (data.kind === 'text' && data.text.length > 300) {
      this.writeTextPayload(id, data.text)
      finalData = {
        ...data,
        hasFullPayload: true,
        previewText: data.text.slice(0, 300),
        text: data.text.slice(0, 300)
      }
    }

    const item: ClipboardItem = { id, data: finalData, capturedAt: now, hitCount: 1, pinned: false }
    this.items.unshift(item)
    this.sigToId.set(sig, id)
    if (data.kind === 'image') this.writeImageFile(data.imageId)
    this.trim(limit)
    this.persist()
    return true
  }

  /**
   * Touch an item (e.g. on paste) to update its timestamp and hitCount,
   * moving unpinned items to the front of the Recent list.
   */
  touch(id: string): boolean {
    const idx = this.items.findIndex((it) => it.id === id)
    if (idx < 0) return false
    const it = this.items[idx]
    const now = Date.now()
    const updated: ClipboardItem = { ...it, hitCount: it.hitCount + 1, capturedAt: now }

    if (!it.pinned) {
      this.items.splice(idx, 1)
      this.items.unshift(updated)
    } else {
      this.items[idx] = updated
    }

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
    this.sigToId.delete(contentSignature(removed.data))
    if (removed.data.kind === 'image') this.removeImageFile(removed.data.imageId)
    if (removed.data.kind === 'image-collection') {
      removed.data.images.forEach((img) => this.removeImageFile(img.imageId))
    }
    if (removed.data.kind === 'text') this.removeTextPayload(removed.id)
    this.persistSync()
    this.notifyRemoved([removed])
  }

  deleteBatch(ids: string[]): void {
    if (!ids || ids.length === 0) return
    const set = new Set(ids)
    const toRemove: ClipboardItem[] = []
    this.items = this.items.filter((it) => {
      if (set.has(it.id)) {
        toRemove.push(it)
        return false
      }
      return true
    })

    for (const removed of toRemove) {
      this.sigToId.delete(contentSignature(removed.data))
      if (removed.data.kind === 'image') this.removeImageFile(removed.data.imageId)
      if (removed.data.kind === 'image-collection') {
        removed.data.images.forEach((img) => this.removeImageFile(img.imageId))
      }
      if (removed.data.kind === 'text') this.removeTextPayload(removed.id)
    }
    this.persistSync()
    this.notifyRemoved(toRemove)
  }

  merge(sourceId: string, targetId: string): MergeResult {
    if (sourceId === targetId) return { ok: false }
    const srcIdx = this.items.findIndex(x => x.id === sourceId)
    const tgtIdx = this.items.findIndex(x => x.id === targetId)
    if (srcIdx < 0 || tgtIdx < 0) return { ok: false, reason: 'notfound' }

    const src = this.items[srcIdx]
    const tgt = this.items[tgtIdx]

    // Text and links cannot be merged into stacks
    if (src.data.kind === 'text' || tgt.data.kind === 'text') {
      return { ok: false, reason: 'incompatible', message: 'Text and links cannot be grouped together' }
    }

    let newData: ItemData | null = null

    const getItemPaths = (item: ClipboardItem): string[] => {
      if (item.data.kind === 'files') return item.data.paths
      if (item.data.kind === 'image') return [this.imagePath(item.data.imageId, item.data.ext)]
      if (item.data.kind === 'image-collection') return item.data.images.map((img) => this.imagePath(img.imageId, img.ext))
      return []
    }

    const isPureImage = (item: ClipboardItem): boolean => {
      return item.data.kind === 'image' || item.data.kind === 'image-collection'
    }

    if (isPureImage(src) && isPureImage(tgt)) {
      // Pure Image(s) + Pure Image(s) -> Image Collection
      const srcData = src.data
      const tgtData = tgt.data
      const srcImages = srcData.kind === 'image-collection'
        ? srcData.images
        : srcData.kind === 'image'
          ? [{ imageId: srcData.imageId, width: srcData.width, height: srcData.height, bytes: srcData.bytes, ext: srcData.ext, source: srcData.source, fileName: srcData.fileName }]
          : []
      const tgtImages = tgtData.kind === 'image-collection'
        ? tgtData.images
        : tgtData.kind === 'image'
          ? [{ imageId: tgtData.imageId, width: tgtData.width, height: tgtData.height, bytes: tgtData.bytes, ext: tgtData.ext, source: tgtData.source, fileName: tgtData.fileName }]
          : []
      const seen = new Set(tgtImages.map((i) => i.imageId))
      const combined = [...tgtImages, ...srcImages.filter((i) => !seen.has(i.imageId))]

      if (combined.length > MAX_STACK) return { ok: false, reason: 'full', message: 'An image collection can hold a maximum of 10 items' }
      newData = { kind: 'image-collection', images: combined }
    } else if (
      (src.data.kind === 'files' || src.data.kind === 'image' || src.data.kind === 'image-collection') &&
      (tgt.data.kind === 'files' || tgt.data.kind === 'image' || tgt.data.kind === 'image-collection')
    ) {
      // Mixed combinations: Files + Files, Image(s) + Files, Files + Image(s)
      const srcPaths = getItemPaths(src)
      const tgtPaths = getItemPaths(tgt)
      const seen = new Set(tgtPaths)
      const combined = [...tgtPaths, ...srcPaths.filter((p) => !seen.has(p))]

      if (combined.length > MAX_STACK) return { ok: false, reason: 'full', message: 'A folder bundle can hold a maximum of 10 files' }
      newData = { kind: 'files', paths: combined }
    }

    if (!newData) {
      return { ok: false, reason: 'incompatible', message: 'Cannot combine these items' }
    }

    // Update target item
    this.sigToId.delete(contentSignature(tgt.data))
    tgt.data = newData
    this.sigToId.set(contentSignature(newData), tgt.id)
    tgt.capturedAt = Date.now() // bump time

    // Remove source item completely but DO NOT delete its underlying files/images
    // because they are now owned by the target!
    const [removed] = this.items.splice(srcIdx, 1)
    this.sigToId.delete(contentSignature(removed.data))

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
        data: { kind: 'image', ...targetImg }
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

      let newData: ItemData = { kind: 'files', paths: targetPaths }
      if (targetPaths.length === 1) {
        const p = targetPaths[0]
        const pLower = p.toLowerCase()
        const isFromManagedDir = pLower.includes('images') || pLower.includes('temp') || pLower.includes('edge-drop')
        if (isImageExt(p) && isFromManagedDir) {
          const imgName = pathBasename(p)
          let imageId = imgName.split('.')[0]
          const ext = (extname(p).slice(1) || 'png').toLowerCase()
          if (!/^[a-z0-9]{6,12}-[a-z0-9]{6,12}$/i.test(imageId)) {
            imageId = createId()
            try {
              if (existsSync(p)) {
                const rawBytes = readFileSync(p)
                this.stageImageBytes(imageId, rawBytes, ext)
              }
            } catch {}
          }
          let bytes = 0
          let width = 0
          let height = 0
          try {
            bytes = statSync(p).size
            const img = nativeImage.createFromPath(p)
            if (!img.isEmpty()) {
              const sz = img.getSize()
              width = sz.width
              height = sz.height
            }
          } catch {}
          newData = { kind: 'image', imageId, width, height, bytes, ext }
        }
      }

      const newItem: ClipboardItem = {
        id: createId(),
        capturedAt: Date.now(),
        hitCount: 1,
        pinned: false,
        data: newData
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
    const removed: ClipboardItem[] = []
    for (const it of this.items) {
      if (it.pinned) kept.push(it)
      else {
        this.sigToId.delete(contentSignature(it.data))
        if (it.data.kind === 'image') this.removeImageFile(it.data.imageId)
        if (it.data.kind === 'image-collection') {
          it.data.images.forEach((img) => this.removeImageFile(img.imageId))
        }
        if (it.data.kind === 'text') this.removeTextPayload(it.id)
        removed.push(it)
      }
    }
    this.items = kept
    this.persistSync()
    this.notifyRemoved(removed)
  }

  pruneExpired(hours: number): boolean {
    if (!hours || hours <= 0) return false
    const cutoff = Date.now() - hours * 3600 * 1000
    const kept: ClipboardItem[] = []
    const expired: ClipboardItem[] = []
    for (const it of this.items) {
      if (it.pinned || it.capturedAt >= cutoff) {
        kept.push(it)
      } else {
        expired.push(it)
        this.sigToId.delete(contentSignature(it.data))
        if (it.data.kind === 'image') this.removeImageFile(it.data.imageId)
        if (it.data.kind === 'image-collection') {
          it.data.images.forEach((img) => this.removeImageFile(img.imageId))
        }
      }
    }
    if (expired.length > 0) {
      this.items = kept
      this.persistSync()
      this.notifyRemoved(expired)
    }
    return expired.length > 0
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
    const THUMB_SIZE = 240
    const PREVIEW_CACHE_MAX = 20
    const cacheKey = `${imageId}.${ext || ''}`
    const cached = this.previewCache.get(cacheKey)
    if (cached) {
      this.previewCache.delete(cacheKey)
      this.previewCache.set(cacheKey, cached)
      return cached
    }
    try {
      let img: any = nativeImage.createFromPath(this.imagePath(imageId, ext))
      if (img.isEmpty()) return null
      const size = img.getSize()
      let thumb: any = size.width > THUMB_SIZE || size.height > THUMB_SIZE
        ? img.resize({ width: THUMB_SIZE, quality: 'good' })
        : img
      const url = thumb.toDataURL({ scaleFactor: 1 })
      img = null
      thumb = null
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

  /**
   * Resolve the on-disk path for a stored image, recovering via a directory
   * scan when the exact extension path is missing (e.g. the capture was
   * re-staged with a different ext). Returns null only when the image is
   * genuinely unrecoverable — callers must surface that to the user instead
   * of silently degrading to low-res previews.
   */
  public resolveStoredImagePath(imageId: string, ext?: string): string | null {
    if (!imageId) return null
    if (ext) {
      const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext
      const primary = join(PATHS.imagesDir(), `${imageId}.${cleanExt}`)
      if (existsSync(primary)) return primary
    }
    // Recovery: scan the images dir for any extension matching this id.
    try {
      const scanned = this.imagePath(imageId, undefined)
      if (existsSync(scanned)) return scanned
    } catch { /* ignore */ }
    return null
  }

  /**
   * True when at least one image of a collection is still recoverable on
   * disk. Used as a fast pre-check so paste can abort with an explicit error
   * before mutating any UI state.
   */
  public hasRecoverableCollectionImage(images: Array<{ imageId: string; ext?: string }>): boolean {
    return images.some((img) => this.resolveStoredImagePath(img.imageId, img.ext) !== null)
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

  private textPayloadPath(id: string): string {
    return join(PATHS.payloadsDir(), `${id}.txt`)
  }

  private writeTextPayload(id: string, text: string): void {
    try {
      writeFileSync(this.textPayloadPath(id), text, 'utf8')
    } catch { /* ignore */ }
  }

  private removeTextPayload(id: string): void {
    try {
      const p = this.textPayloadPath(id)
      if (existsSync(p)) rmSync(p, { force: true })
    } catch { /* ignore */ }
  }

  public getFullText(id: string): string {
    const item = this.items.find((x) => x.id === id)
    if (!item || item.data.kind !== 'text') return ''
    if (item.data.hasFullPayload) {
      try {
        const p = this.textPayloadPath(id)
        if (existsSync(p)) {
          return readFileSync(p, 'utf8')
        }
      } catch { /* ignore */ }
    }
    return item.data.text
  }

  /* ------------------------------- DTO ----------------------------------- */

  /** Snapshot the whole list as renderer-safe DTOs (images inlined). */
  toDto(): ClipboardItemDto[] {
    return this.items.map((it) => {
      if (it.data.kind === 'image') {
        const { kind, imageId, width, height, bytes, ext, source, fileName } = it.data
        return {
          ...it,
          data: { kind, imageId, width, height, bytes, ext, source, fileName, preview: thumbnailUrlForStoredImage(imageId) }
        }
      }
      if (it.data.kind === 'image-collection') {
        const imagesWithPreviews = it.data.images.map((img) => ({
          ...img,
          preview: thumbnailUrlForStoredImage(img.imageId)
        }))
        return {
          ...it,
          data: { kind: 'image-collection', images: imagesWithPreviews }
        }
      }
      if (it.data.kind === 'files') {
        // Build per-file metadata entries. Generate image preview protocol URLs for image files.
        let imagePreviewCount = 0
        const entries = it.data.paths.map((p) => {
          const entry = buildFileEntry(p)
          if (entry.isImage && imagePreviewCount < 20) {
            imagePreviewCount++
            return {
              ...entry,
              preview: thumbnailUrlForFile(p)
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

function buildFileEntry(p: string): FileEntry {
  if (fileEntryCache.has(p)) return fileEntryCache.get(p)!
  let size = 0
  let isDirectory = false
  try {
    const st = statSync(p)
    size = st.size
    isDirectory = st.isDirectory()
  } catch {
    /* file missing / unreadable — size stays 0 */
  }
  const ext = isDirectory ? '' : (extname(p).slice(1) || '').toLowerCase()
  const name = pathBasename(p)
  const entry: FileEntry = {
    name,
    ext,
    size,
    isImage: !isDirectory && isImageExt(p),
    isDirectory
  }
  if (fileEntryCache.size > 500) fileEntryCache.clear()
  fileEntryCache.set(p, entry)
  return entry
}
