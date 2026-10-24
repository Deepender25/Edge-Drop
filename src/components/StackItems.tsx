/**
 * The open view of a stack (several files or images in one card).
 *
 * Laid out by content instead of repeating a whole mini card per entry:
 * - only pictures   -> a photo grid (2 columns in a side dock, one strip of
 *                      larger thumbnails in the top dock);
 * - files or mixed  -> a list: small icon or thumbnail, the full name (up to
 *                      2 lines in a side dock), then "kind · size". In the top
 *                      dock rows flow down two lines, then across.
 * Each entry pastes on click, drags out on its own and shows copy / ungroup on
 * hover, like the mini cards it replaces. Rows are plain DOM (no texture,
 * flap or opening icon layers), so a big stack stays cheap to draw.
 */
import { memo, useState } from 'react'
import type { ClipboardItemDto, DragRequest } from '../../shared/types'
import { useStore } from '../store/appStore'
import { basename, formatBytes, formatImageDisplayName } from '../lib/format'
import { extOf, getFileKind } from '../lib/fileType'
import { playButtonClickSound, playDeleteSound, playToggleSound, playCardExpandSound } from '../lib/soundEffects'
import { tryPaste } from '../lib/tryPaste'
import { useTranslation } from '../i18n'
import { CopyIcon, FileKindIcon, MinusIcon, PinIcon, PinFillIcon, TrashIcon, ChevronUpIcon, ChevronLeftIcon, ExpandIcon, ContractIcon } from './icons'
import '../styles/stack.css'

/** Same accent the shelf uses for image badges. */
const IMAGE_COLOR = '#06B6D4'

export interface StackEntry {
  key: string
  req: DragRequest
  name: string
  kindLabel: string
  kindColor?: string
  /** "1920×1080 · 470.7 KB", "2.0 MB", or '' */
  detail: string
  thumb?: { src: string; fallbackSrc?: string }
  icon?: { path: string; isDirectory?: boolean }
  copyTitle: string
}

function fileUrl(filePath: string): string {
  return `edgelocal://file/${encodeURIComponent(filePath.replace(/\\/g, '/'))}`
}

const join = (...parts: Array<string | false | undefined>): string => parts.filter(Boolean).join(' · ')

/** Entries of a files stack (files, folders and image files, in order). */
export function fileStackEntries(item: ClipboardItemDto, t: (k: string) => string): StackEntry[] {
  if (item.data.kind !== 'files') return []
  const { paths, entries } = item.data
  const imageWord = t('filters.images').toLowerCase().slice(0, -1) || 'image'
  return paths.map((p, i) => {
    const e = entries?.[i]
    const info = getFileKind(p, e?.isDirectory)
    const isImage = !e?.isDirectory && (e?.isImage || info.kind === 'image')
    // the real extension ("csv", "pptx") reads better than the family ("excel", "slides")
    const ext = e?.isDirectory ? '' : (e?.ext || extOf(basename(p))).toLowerCase()
    return {
      key: `${p}-${i}`,
      req: { id: item.id, paths: [p] },
      name: formatImageDisplayName(e?.name ?? p, item.capturedAt) || basename(p),
      kindLabel: ext || (isImage ? imageWord : info.label.toLowerCase()),
      kindColor: isImage ? IMAGE_COLOR : info.color,
      detail: !e?.isDirectory && e?.size ? formatBytes(e.size) : '',
      thumb: isImage ? { src: e?.preview || fileUrl(p), fallbackSrc: fileUrl(p) } : undefined,
      icon: isImage ? undefined : { path: p, isDirectory: e?.isDirectory },
      copyTitle: t('item.copyFilePath')
    }
  })
}

/** Entries of a clipboard image collection. */
export function imageCollectionEntries(item: ClipboardItemDto, t: (k: string) => string): StackEntry[] {
  if (item.data.kind !== 'image-collection') return []
  const imageWord = t('filters.images').toLowerCase().slice(0, -1) || 'image'
  return item.data.images.map((img, i) => {
    const dims = img.width && img.height ? `${img.width}×${img.height}` : ''
    return {
      key: img.imageId || `${item.id}-${i}`,
      req: { id: item.id, imageId: img.imageId || `${item.id}-${i}` },
      name: img.fileName || dims || `${imageWord} ${i + 1}`,
      kindLabel: imageWord,
      kindColor: IMAGE_COLOR,
      detail: join(img.fileName ? dims : '', img.bytes ? formatBytes(img.bytes) : ''),
      thumb: { src: img.preview },
      copyTitle: t('item.copy')
    }
  })
}

/** Total size of a stack for its header ('' when unknown). */
export function stackTotalSize(item: ClipboardItemDto): string {
  let total = 0
  if (item.data.kind === 'files') for (const e of item.data.entries ?? []) total += e?.isDirectory ? 0 : e?.size || 0
  else if (item.data.kind === 'image-collection') for (const img of item.data.images) total += img.bytes || 0
  return total > 0 ? formatBytes(total) : ''
}

/**
 * Width of an open stack card in the top dock, matching stack.css: photos sit
 * in one strip of 128px tiles (inset 4px each side); files fill 232px
 * columns two rows tall. Gaps are 6px, plus 22px of card and viewport padding.
 */
export function stackOpenWidth(count: number, gallery: boolean): number {
  const cols = gallery ? count : Math.ceil(count / 2)
  const track = cols * (gallery ? 128 : 232) + Math.max(0, cols - 1) * 6 + (gallery ? 8 : 0)
  return Math.max(240, track + 22) // room for the header: title, size and actions
}

const stop = (e: React.SyntheticEvent): void => e.stopPropagation()

export function StackItems({
  entries,
  isHorizontal,
  onDragStart
}: {
  entries: StackEntry[]
  isHorizontal: boolean
  onDragStart?: (e: React.DragEvent, req: DragRequest) => void
}) {
  const gallery = entries.length > 0 && entries.every((e) => e.thumb)
  return (
    <div className={`stack-items ${gallery ? 'is-gallery' : 'is-list'}`} data-count={entries.length} onClick={stop}>
      {entries.map((entry) => (
        <StackEntryView key={entry.key} entry={entry} tile={gallery} iconSize={isHorizontal ? 30 : 36} onDragStart={onDragStart} />
      ))}
    </div>
  )
}

const StackEntryView = memo(function StackEntryView({
  entry,
  tile,
  iconSize,
  onDragStart
}: {
  entry: StackEntry
  tile: boolean
  iconSize: number
  onDragStart?: (e: React.DragEvent, req: DragRequest) => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const { req } = entry

  const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.currentTarget.blur()
    playButtonClickSound()
    useStore.getState().copySubitem(req)
    setCopied(true)
    setTimeout(() => setCopied(false), 900)
  }
  const handleUngroup = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.currentTarget.blur()
    playDeleteSound()
    window.edge.splitItem({ ...req, splitPlacement: 'after' })
  }
  const handlePaste = (e: React.MouseEvent) => {
    e.stopPropagation()
    tryPaste(() => window.edge.pasteSubitem(req))
  }

  const thumb = entry.thumb && (
    <img
      className={tile ? 'stack-tile-img' : 'stack-row-thumb'}
      src={entry.thumb.src}
      onError={(e) => {
        const fb = entry.thumb?.fallbackSrc
        if (fb && e.currentTarget.src !== fb) e.currentTarget.src = fb
      }}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  )
  const meta = copied ? (
    <span className="meta-copied">{t('item.copied')}</span>
  ) : (
    <>
      <span className="stack-row-kind" style={{ color: entry.kindColor }}>{entry.kindLabel}</span>
      {entry.detail && <span className="stack-row-detail">{` · ${entry.detail}`}</span>}
    </>
  )

  return (
    <div
      className={tile ? 'stack-tile' : 'stack-row'}
      data-stack-row=""
      draggable
      title={entry.name}
      onMouseEnter={() => window.edge.prestageDrag(req)}
      onPointerDown={() => window.edge.prestageDrag(req)}
      onDragStartCapture={(e) => {
        e.stopPropagation()
        onDragStart?.(e, req)
      }}
      onClick={handlePaste}
    >
      {tile ? (
        <>
          {thumb}
          <div className="stack-tile-caption">
            <span className="stack-row-name" data-row-name="">{entry.name}</span>
            <span className="stack-row-meta">{copied ? meta : entry.detail}</span>
          </div>
        </>
      ) : (
        <>
          <div className="stack-row-art">
            {thumb ?? (entry.icon && <FileKindIcon path={entry.icon.path} isDirectory={entry.icon.isDirectory} width={iconSize} height={iconSize} />)}
          </div>
          <div className="stack-row-text">
            <span className="stack-row-name" data-row-name="">{entry.name}</span>
            <span className="stack-row-meta">{meta}</span>
          </div>
        </>
      )}
      <div className="stack-row-actions" onPointerDown={stop} onClick={stop}>
        <button className="act" title={entry.copyTitle} onPointerDown={stop} onClick={handleCopy}>
          <CopyIcon width={11} height={11} />
        </button>
        <button className="act danger" title={t('item.ungroup')} onPointerDown={stop} onClick={handleUngroup}>
          <MinusIcon width={11} height={11} />
        </button>
      </div>
    </div>
  )
})

/** Header of an open stack: collapse, "N files · total size", and the card's actions. */
export function StackHeader({
  item,
  title,
  isHorizontal,
  onCollapse,
  onCopy,
  onRemove
}: {
  item: ClipboardItemDto
  title: string
  isHorizontal: boolean
  onCollapse?: (e?: React.MouseEvent) => void
  onCopy?: (e: React.MouseEvent) => void
  onRemove?: () => void
}) {
  const { t } = useTranslation()
  const isPreviewing = useStore((s) => s.previewItemId === item.id)
  const total = stackTotalSize(item)
  return (
    <div
      className="image-folder-expanded-top-bar"
      title={t('item.collapsePinned')}
      onPointerDown={stop}
      onClick={(e) => {
        e.stopPropagation()
        onCollapse?.(e)
      }}
    >
      <div className="stack-head-lead">
        <button
          type="button"
          className="image-folder-collapse-btn"
          title={t('item.collapsePinned')}
          onPointerDown={stop}
          onClick={(e) => {
            e.stopPropagation()
            e.currentTarget.blur()
            onCollapse?.(e)
          }}
        >
          {isHorizontal ? <ChevronLeftIcon width={13} height={13} /> : <ChevronUpIcon width={13} height={13} />}
        </button>
        <span className="stack-head-text">
          <span className="image-folder-expanded-title">{title}</span>
          {total && <span className="image-folder-expanded-sub">{total}</span>}
        </span>
      </div>
      <div className="actions-pill" onPointerDown={stop} onClick={stop}>
        <button
          className={`act${item.pinned ? ' active' : ''}`}
          title={item.pinned ? t('item.unpin') : t('item.pin')}
          onPointerDown={stop}
          onClick={(e) => {
            e.stopPropagation()
            e.currentTarget.blur()
            playToggleSound(!item.pinned)
            useStore.getState().togglePin(item.id, !item.pinned)
          }}
        >
          {item.pinned ? <PinFillIcon width={12} height={12} /> : <PinIcon width={12} height={12} />}
        </button>
        <button
          className={`act${isPreviewing ? ' preview-contract active' : ' preview-expand'}`}
          title={isPreviewing ? t('header.close') : t('item.expand')}
          onPointerDown={stop}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            e.currentTarget.blur()
            playCardExpandSound(!isPreviewing)
            const rect = e.currentTarget.closest('.item-main, .item')?.getBoundingClientRect()
            const rectData = rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : undefined
            useStore.getState().setPreviewItemId(isPreviewing ? null : item.id, rectData)
          }}
        >
          {isPreviewing ? <ContractIcon width={12} height={12} /> : <ExpandIcon width={12} height={12} />}
        </button>
        <button
          className="act"
          title={t('item.copy')}
          onPointerDown={stop}
          onClick={(e) => {
            e.stopPropagation()
            e.currentTarget.blur()
            onCopy?.(e)
          }}
        >
          <CopyIcon width={12} height={12} />
        </button>
        <button
          className="act danger"
          title={t('item.delete')}
          onPointerDown={stop}
          onClick={(e) => {
            e.stopPropagation()
            e.currentTarget.blur()
            playDeleteSound()
            onRemove?.()
          }}
        >
          <TrashIcon width={12} height={12} />
        </button>
      </div>
    </div>
  )
}
