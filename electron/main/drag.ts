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
import { copyFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { PATHS } from '../store/paths'
import type { DragRequest, ItemData } from '../../shared/types'
import { getStore } from './state'
import { getFileKind } from '../../src/lib/fileType'

/**
 * Formats a clean, Windows OS-compliant human-readable screenshot filename
 * based on the capture timestamp (e.g. "Screenshot 2026-08-15 22.30.45.png").
 */
export function formatScreenshotFilename(capturedAt?: number, ext = 'png', indexSuffix?: number): string {
  const d = capturedAt ? new Date(capturedAt) : new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')

  const cleanExt = ext.replace(/^\./, '') || 'png'
  const suffix = typeof indexSuffix === 'number' && indexSuffix > 1 ? ` (${indexSuffix})` : ''
  return `Screenshot ${year}-${month}-${day} ${hours}.${minutes}.${seconds}${suffix}.${cleanExt}`
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

export function startDragOut(sender: WebContents, data: ItemData, capturedAt?: number): void {
  const staged = stageDragFile(data, capturedAt)
  if (!staged) return

  const icon = dragIcon(data)
  const item: Electron.Item = { file: staged.file, icon }
  if (staged.files) {
    item.files = staged.files
  }
  sender.startDrag(item)
}

/* ------------------------------------------------------------------ */
/* Staging                                                             */
/* ------------------------------------------------------------------ */

interface Staged {
  file: string
  files?: string[]
}

/** Resolve the item to a concrete file path to hand to the OS. */
export function stageDragFile(data: ItemData, capturedAt?: number): Staged | null {
  const temp = PATHS.tempDir()
  switch (data.kind) {
    case 'files': {
      const real = data.paths.filter((p) => existsSync(p))
      if (!real.length) return null
      return { file: real[0], files: real }
    }
    case 'image': {
      const src = getStore().getImagePath(data.imageId, data.ext)
      if (!existsSync(src)) return null
      const ext = extname(src) || '.png'
      const fileName = formatScreenshotFilename(capturedAt, ext)
      const dest = join(temp, fileName)
      try {
        if (!existsSync(dest)) {
          copyFileSync(src, dest)
        }
      } catch {
        return null
      }
      return { file: dest, files: [dest] }
    }
    case 'image-collection': {
      const paths: string[] = []
      let idx = 1
      for (const img of data.images) {
        const src = getStore().getImagePath(img.imageId, img.ext)
        if (existsSync(src)) {
          const ext = extname(src) || '.png'
          const fileName = formatScreenshotFilename(capturedAt, ext, idx)
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
      return { file: paths[0], files: paths }
    }
    case 'text': {
      const id = `${Date.now().toString(36)}`
      const dest = join(temp, `Snippet_${id}.txt`)
      try {
        writeFileSync(dest, data.text, 'utf8')
      } catch {
        return null
      }
      return { file: dest, files: [dest] }
    }
  }
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
          iconCache.set(ext, icon)
          iconCache.set(p, icon)
        }
      }).catch(() => {})
    }
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

function getGlyphSvg(kind: string, color: string): string {
  switch (kind) {
    case 'pdf':
      return `<g>		<g fill="${color}" fill-rule="evenodd" clip-rule="evenodd">			<path d="M15.143 22H8.286A4.286 4.286 0 0 1 4 17.714V6.286A4.286 4.286 0 0 1 8.286 2h4.008a3.5 3.5 0 0 1 2.304.866l3.635 3.18a3.5 3.5 0 0 1 1.196 2.635v9.033A4.286 4.286 0 0 1 15.143 22m0-2H8.286A2.286 2.286 0 0 1 6 17.714V6.286A2.286 2.286 0 0 1 8.286 4h4.008a1.5 1.5 0 0 1 .987.371l3.635 3.18a1.5 1.5 0 0 1 .513 1.13v9.033A2.286 2.286 0 0 1 15.143 20" />			<path d="M7 12a1 1 0 0 1 1-1h5a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1m0 4a1 1 0 0 1 1-1h3.125a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1m6-13a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h2.5a1 1 0 1 1 0 2H15a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1" />		</g>	</g>`
    case 'archive':
      return `<g>		<g fill="${color}" fill-rule="evenodd" clip-rule="evenodd">			<path d="m14.071 2.887l4.786 2.762a4.14 4.14 0 0 1 2.071 3.588v5.526c0 1.48-.79 2.848-2.071 3.588l-4.786 2.762a4.14 4.14 0 0 1-4.142 0l-4.786-2.762a4.14 4.14 0 0 1-2.071-3.588V9.237c0-1.48.79-2.848 2.071-3.588L9.93 2.887a4.14 4.14 0 0 1 4.142 0Zm-1 1.732a2.14 2.14 0 0 0-2.142 0L6.143 7.38a2.14 2.14 0 0 0-1.071 1.856v5.526c0 .765.408 1.473 1.071 1.856l4.786 2.762a2.14 2.14 0 0 0 2.142 0l4.786-2.762a2.14 2.14 0 0 0 1.071-1.856V9.237c0-.765-.408-1.473-1.071-1.856L13.07 4.62Z" />			<path d="m10.595 11.844l-5.9-2.95l.895-1.788l5.899 2.949c.322.16.7.16 1.022 0l5.899-2.95l.895 1.79l-5.9 2.949a3.14 3.14 0 0 1-2.81 0" />			<path d="M13 11.428v9.143h-2v-9.143zM7.677 5.267a1 1 0 0 1 1.342-.447l6.857 3.428a1 1 0 1 1-.895 1.79l-6.857-3.43a1 1 0 0 1-.447-1.34Z" />		</g>	</g>`
    case 'code':
      return `<g>		<g fill="${color}" fill-rule="evenodd" clip-rule="evenodd">			<path d="M3 9.612c0-1.563 1.333-2.72 2.837-2.72H9v2H5.837c-.525 0-.837.383-.837.72v9.56c0 .337.312.72.837.72h6.326c.525 0 .837-.383.837-.72v-.288h2v.287c0 1.563-1.333 2.72-2.837 2.72H5.837C4.333 21.892 3 20.735 3 19.172z" />			<path d="M17.2 19h-5.4C9.643 19 8 17.214 8 15.143V5.857C8 3.787 9.643 2 11.8 2h3.022c.867 0 1.703.322 2.347.903l2.675 2.415A3.5 3.5 0 0 1 21 7.918v7.225C21 17.213 19.357 19 17.2 19m0-2h-5.4c-.994 0-1.8-.831-1.8-1.857V5.857C10 4.831 10.806 4 11.8 4h3.022c.372 0 .73.138 1.007.387l2.675 2.416A1.5 1.5 0 0 1 19 7.918v7.225C19 16.169 18.194 17 17.2 17" />			<path d="M11 11a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1m0 4a1 1 0 0 1 1-1h2.5a1 1 0 1 1 0 2H12a1 1 0 0 1-1-1m4-12a1 1 0 0 1 1 1v1.997C16 6.551 16.449 7 17.003 7H19a1 1 0 1 1 0 2h-1.997A3.003 3.003 0 0 1 14 5.997V4a1 1 0 0 1 1-1" />		</g>	</g>`
    case 'text':
      return `<path fill="${color}" d="m16.263 8.361l.001-.184c.009-.578.319-1.159.897-1.159h.85a.27.27 0 0 1 .27.27v8.654c0 .291.063.805.219.984c.156.171.439.257.8.257h1.18c.342 0 .59.221.644.56a3 3 0 0 1 .05.861c0 .234-.197.41-.431.416c-.12.003-.267-.002-.634-.002c-.468.03-1.235 0-1.72 0c-.837 0-1.19-.059-1.642-.44c-.593-.5-.5-1.23-.5-2zm4.069 1.66c.506 0 .991.333.991.84c0 .156-.007-.003-.023.139c-.05.403-.385.669-.791.673l-3.213.034h-2.68c-.481 0-.74-.324-.74-.805c0-.535.3-.9.835-.897l2.589.013zM3.433 7.005c-.307-.001-.58-.212-.609-.517a5 5 0 0 1-.024-.48q0-.224.024-.482c.03-.31.308-.526.62-.527l9.701-.017c.284 0 .543.177.584.458q.037.247.037.482q0 .582-.357.828q-.358.234-1.11.235l-.912.03q-.234 0-.702-.012A120 120 0 0 0 9.3 6.985h-2c-.164 0 .16.01-.143.018c-.304.008-1.043.011-1.215.011zM7.3 8.641v-.817q.012-.369.012-.84v-.062a.922.922 0 0 1 1.744-.417l.244.48v11.279a.723.723 0 0 1-.665.736c-.23.015-.146 0-.335 0c-.206 0-.11.015-.347 0a.71.71 0 0 1-.653-.724z" />`
    case 'word':
      return `<g>		<g fill="${color}" fill-rule="evenodd" clip-rule="evenodd">			<path d="M15.143 22H8.286A4.286 4.286 0 0 1 4 17.714V6.286A4.286 4.286 0 0 1 8.286 2h4.008a3.5 3.5 0 0 1 2.304.866l3.635 3.18a3.5 3.5 0 0 1 1.196 2.635v9.033A4.286 4.286 0 0 1 15.143 22m0-2H8.286A2.286 2.286 0 0 1 6 17.714V6.286A2.286 2.286 0 0 1 8.286 4h4.008a1.5 1.5 0 0 1 .987.371l3.635 3.18a1.5 1.5 0 0 1 .513 1.13v9.033A2.286 2.286 0 0 1 15.143 20" />			<path d="M7 12a1 1 0 0 1 1-1h5a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1m0 4a1 1 0 0 1 1-1h3.125a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1m6-13a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h2.5a1 1 0 1 1 0 2H15a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1" />		</g>	</g>`
    case 'excel':
      return `<g>		<g fill="${color}" fill-rule="evenodd" clip-rule="evenodd">			<path d="M6 2h12a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4m0 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />			<path d="M12 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1M7 9a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1m10 3a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1" />		</g>	</g>`
    case 'powerpoint':
      return `<g>		<g fill="${color}" fill-rule="evenodd" clip-rule="evenodd">			<path d="M4.511 5.032c.197-.037.462-.038 1.004-.031a7 7 0 0 1 1.953.294c1.026.312 2.084.94 3.029 1.5l.082.05c.208.123.331.197.415.253a19 19 0 0 1 .006.448v10.367c-.977-.474-2.195-.884-3.78-1.203a49 49 0 0 1-1.888-.493c-.47-.14-.635-.226-.684-.261a1.6 1.6 0 0 1-.336-.294a1.6 1.6 0 0 1-.204-.398c-.092-.233-.108-.5-.108-1.558v-6.81c0-.671.003-1.054.05-1.336c.037-.225.089-.299.158-.367a.5.5 0 0 1 .303-.16ZM5.401 3c-.884-.013-1.792-.026-2.599.771c-.436.43-.636.926-.725 1.464C2 5.698 2 6.249 2 6.83v7.024c0 .838-.002 1.513.248 2.145c.126.319.27.615.488.894c.217.278.47.49.748.69c.346.247.8.408 1.276.55c.494.148 1.147.31 1.972.517l.049.012l.023.005c2.184.437 3.471 1.033 4.35 1.641l.011.008c.045.031.15.104.254.157c.097.049.523.253 1 .003a1.08 1.08 0 0 0 .565-.821c.017-.116.016-.244.016-.297V7.513c0-.225 0-.456-.018-.654a1.85 1.85 0 0 0-.224-.765a1.9 1.9 0 0 0-.555-.59a8 8 0 0 0-.574-.362l-.029-.017l-.144-.086c-.897-.533-2.14-1.273-3.407-1.658a9 9 0 0 0-2.51-.38z" />			<path d="M19.489 5.032c-.197-.037-.462-.038-1.004-.031a7 7 0 0 0-1.953.294c-1.026.312-2.084.94-3.029 1.5l-.082.05c-.208.123-.331.197-.415.253l-.004.13C13 7.314 13 7.416 13 7.545v10.367c.977-.474 2.195-.884 3.78-1.203a49 49 0 0 0 1.888-.493c.47-.14.635-.226.684-.261a1.6 1.6 0 0 0 .336-.294c.053-.069.114-.17.204-.398c.092-.233.108-.5.108-1.558v-6.81c0-.671-.003-1.054-.05-1.336c-.037-.225-.089-.299-.158-.367a.5.5 0 0 0-.303-.16M18.599 3c.884-.013 1.791-.026 2.599.771c.436.43.636.926.725 1.464C22 5.698 22 6.249 22 6.83v7.024c0 .838.002 1.513-.248 2.145a3.5 3.5 0 0 1-.488.894c-.217.278-.47.49-.748.69c-.346.247-.8.408-1.276.55c-.494.148-1.147.31-1.972.517l-.049.012l-.023.005c-2.184.437-3.471 1.033-4.35 1.641l-.011.008c-.045.031-.15.104-.254.157a1.09 1.09 0 0 1-1 .003a1.09 1.09 0 0 1-.565-.821a2 2 0 0 1-.016-.297V7.513c0-.225 0-.456.018-.654c.02-.224.07-.495.224-.765a1.9 1.9 0 0 1 .555-.59c.165-.12.37-.241.574-.362l.029-.017l.144-.086c.897-.533 2.14-1.273 3.406-1.658a9 9 0 0 1 2.511-.38l.139-.002Z" />		</g>	</g>`
    case 'audio':
      return `<path fill="${color}" fill-rule="evenodd" d="M6.733 7.2H5.545c-.235 0-.514 0-.761.02c-.39.025-.773.125-1.125.296A3 3 0 0 0 2.316 8.86c-.215.43-.273.84-.296 1.125a10 10 0 0 0-.02.806v2.465c0 .235 0 .514.02.761c.023.286.08.695.296 1.125a3 3 0 0 0 1.343 1.343c.43.215.84.273 1.125.296c.247.02.526.02.76.02h1.189l1.056 1.129l.05.054c.38.405.75.8 1.073 1.09c.28.253.888.778 1.748.876a3 3 0 0 0 2.625-1.037c.56-.66.645-1.457.678-1.834c.037-.433.037-.973.037-1.529V8.451c0-.556 0-1.096-.037-1.529c-.033-.376-.117-1.175-.678-1.834A3 3 0 0 0 10.66 4.05c-.86.098-1.467.623-1.748.876c-.323.29-.692.685-1.072 1.09l-.05.054zm.979 7.761c.1.067.187.159.36.342l1.177 1.259c.848.906 1.272 1.358 1.638 1.4a1 1 0 0 0 .875-.346c.238-.28.238-.9.238-2.14V8.524c0-1.24 0-1.861-.238-2.141a1 1 0 0 0-.875-.346c-.366.042-.79.494-1.638 1.4L8.07 8.697c-.172.183-.258.275-.36.341a1 1 0 0 1-.306.133c-.117.029-.243.029-.494.029H5.59c-.55 0-.826 0-1.037.105a1 1 0 0 0-.448.448C4 9.964 4 10.239 4 10.79v2.42c0 .55 0 .826.105 1.037a1 1 0 0 0 .448.447c.21.106.486.106 1.037.106h1.32c.252 0 .378 0 .495.029q.165.04.307.132m7.569-7.156a1 1 0 0 1 1.414-.024A5.87 5.87 0 0 1 18.5 12c0 1.59-.654 3.106-1.805 4.219a1.001 1.001 0 0 1-1.698-.735a1 1 0 0 1 .308-.703A3.87 3.87 0 0 0 16.5 12a3.87 3.87 0 0 0-1.195-2.781a1 1 0 0 1-.024-1.414" clip-rule="evenodd" />	<path fill="${color}" fill-rule="evenodd" d="M17.36 4.367a.9.9 0 0 1 1.273-.006A10.75 10.75 0 0 1 21.828 12c0 2.867-1.15 5.615-3.195 7.64a.901.901 0 0 1-1.463-.99a.9.9 0 0 1 .197-.29a8.95 8.95 0 0 0 2.66-6.36a8.95 8.95 0 0 0-2.66-6.36a.9.9 0 0 1-.007-1.273" clip-rule="evenodd" />`
    case 'video':
      return `<g>		<g fill="${color}" fill-rule="evenodd" clip-rule="evenodd">			<path d="M6 5h7a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4m0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />			<path d="M20 14.887a.5.5 0 0 1-.832.373l-2-1.777a.5.5 0 0 1-.168-.374V10.83a.5.5 0 0 1 .172-.377l2-1.736a.5.5 0 0 1 .828.378v5.79Zm-4.139-5.944l2-1.735C19.482 5.803 22 6.953 22 9.096v5.79c0 2.158-2.549 3.302-4.16 1.87l-2-1.779A2.5 2.5 0 0 1 15 13.11v-2.28a2.5 2.5 0 0 1 .861-1.888Z" />		</g>	</g>`
    case 'image':
      return `<g>		<g fill="${color}">			<path fill-rule="evenodd" d="M6.188 2h11.625A4.187 4.187 0 0 1 22 6.188v11.625A4.187 4.187 0 0 1 17.812 22H6.188A4.187 4.187 0 0 1 2 17.812V6.188A4.19 4.19 0 0 1 6.188 2m0 2C4.979 4 4 4.98 4 6.188v11.625C4 19.02 4.98 20 6.188 20h11.625C19.02 20 20 19.02 20 17.812V6.188C20 4.98 19.02 4 17.812 4z" clip-rule="evenodd" />			<path fill-rule="evenodd" d="M17.24 10.924a1.19 1.19 0 0 0-1.51-.013l-5.244 4.247a2.094 2.094 0 0 1-2.59.035l-1.385-1.06a.094.094 0 0 0-.122.007l-2.698 2.582a1 1 0 1 1-1.382-1.444l2.697-2.583a2.094 2.094 0 0 1 2.721-.15l1.385 1.06a.094.094 0 0 0 .116-.001l5.242-4.247a3.19 3.19 0 0 1 4.053.033l3.12 2.613a1 1 0 0 1-1.285 1.533z" clip-rule="evenodd" />			<path d="M10.281 8.64a1.64 1.64 0 1 1-3.28 0a1.64 1.64 0 0 1 3.28 0" />		</g>	</g>`
    default:
      return `<g>		<g fill="${color}" fill-rule="evenodd" clip-rule="evenodd">			<path d="M15.143 22H8.286A4.286 4.286 0 0 1 4 17.714V6.286A4.286 4.286 0 0 1 8.286 2h4.008a3.5 3.5 0 0 1 2.304.866l3.635 3.18a3.5 3.5 0 0 1 1.196 2.635v9.033A4.286 4.286 0 0 1 15.143 22m0-2H8.286A2.286 2.286 0 0 1 6 17.714V6.286A2.286 2.286 0 0 1 8.286 4h4.008a1.5 1.5 0 0 1 .987.371l3.635 3.18a1.5 1.5 0 0 1 .513 1.13v9.033A2.286 2.286 0 0 1 15.143 20" />			<path d="M13 3a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h2.5a1 1 0 1 1 0 2H15a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1" />		</g>	</g>`
  }
}

/** Generate a custom stacked card PNG icon representing file kinds with count badge. */
function createFileStackDragIcon(paths: string[]): Electron.NativeImage {
  const count = paths.length
  if (count === 0) return getFileDragIcon()

  const kinds = paths.slice(0, 3).map((p) => getFileKind(p))
  const cacheKey = `stack|solid-black|${kinds.map((k) => k.kind).join('-')}|${count}`
  const cached = iconCache.get(cacheKey)
  if (cached && !cached.isEmpty()) {
    return cached
  }

  const defsSvg = ''

  let cardsSvg = ''
  for (let i = kinds.length - 1; i >= 0; i--) {
    const info = kinds[i]
    const x = 16 - i * 4
    const y = 8 + i * 4
    cardsSvg += `
      <rect x="${x}" y="${y}" width="64" height="72" rx="10" fill="#000000" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" />
    `
    if (i === 0) {
      cardsSvg += `
        <svg x="${x + 12}" y="${y + 16}" width="40" height="40" viewBox="0 0 24 24">
          ${getGlyphSvg(info.kind, info.color)}
        </svg>
      `
    }
  }

  const badgeSvg = count > 1 ? `
    <circle cx="18" cy="18" r="14" fill="#FF3B30" stroke="#FFFFFF" stroke-width="2" />
    <text x="18" y="23" font-family="sans-serif" font-size="13" font-weight="bold" fill="#FFFFFF" text-anchor="middle">+${count}</text>
  ` : ''

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    ${defsSvg}
    ${cardsSvg}
    ${badgeSvg}
  </svg>`

  try {
    const resvg = new Resvg(svg, { fitTo: { mode: 'zoom', value: 3 } })
    const pngData = resvg.render().asPng()
    const img = nativeImage.createFromBuffer(pngData, { scaleFactor: 3 })
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

  const defsSvg = `
    <defs>
      <clipPath id="textClip">
        <rect x="48" y="0" width="200" height="72" />
      </clipPath>
    </defs>
  `
  
  const width = 260
  const height = 72
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${defsSvg}
    <rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="12" fill="#000000" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" />
    
    <!-- Accent Icon -->
    <svg x="14" y="24" width="24" height="24" viewBox="0 0 24 24">
      ${getGlyphSvg('text', '#8E8E93')}
    </svg>

    <!-- Text Content -->
    <g clip-path="url(#textClip)">
      <text x="48" y="32" font-family="sans-serif" font-size="14" font-weight="600" fill="#FFFFFF">${escapeXml(line1)}</text>
      ${line2 ? `<text x="48" y="52" font-family="sans-serif" font-size="13" font-weight="400" fill="#A0A0A5">${escapeXml(line2)}</text>` : ''}
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
      createFileStackDragIcon(['image.png'])
      createFileStackDragIcon(['file.txt'])
      createFileStackDragIcon(['archive.zip'])
    } catch {}
  }, 1000)
}
