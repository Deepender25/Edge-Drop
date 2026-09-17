/**
 * ClipboardItem — a single history/shelf entry.
 *
 * Interactions:
 *   - Click body            -> paste item (write to clipboard + simulate Ctrl+V)
 *   - Drag the tile         -> native OS drag-out (via useDragOut)
 *   - File bundle: click body -> expand/collapse
 *   - Drag collapsed bundle -> drag all files as one entity
 *   - Drag expanded sub-row -> drag just that one file
 *   - Pin / Delete          -> quick actions on hover
 *   - Copy button (⧉)      -> single-click copy (just clipboard, no Ctrl+V)
 *
 * Visual: a raised dark tile. Image items show a thumbnail; text items show a
 * clamped preview; file items list names or bundle badge. Motion is handled by
 * the parent list (layout/AnimatePresence), so this component stays presentational.
 */
import { memo, useState, useCallback, useEffect, useRef, forwardRef, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { ClipboardItemDto } from '../../shared/types'
import { MAX_STACK } from '../../shared/types'
import type { DragRequest } from '../../shared/types'
import { useStore } from '../store/appStore'
import { useDragOut } from '../hooks/useDragOut'
import { itemRenderKey } from '../lib/itemSignature'
import { basename, formatBytes, previewText, relativeTime, formatImageDisplayName } from '../lib/format'
import { getFileKind } from '../lib/fileType'
import { playButtonClickSound, playToggleSound, playDeleteSound, playCardExpandSound } from '../lib/soundEffects'
import { CopyIcon, FileKindIcon, FileStackPhoto, PinIcon, PinFillIcon, TrashIcon, MinusIcon, ChevronUpIcon, ChevronLeftIcon, ExpandIcon, ContractIcon, ExternalLinkIcon } from './icons'
import { LinkPreviewCard } from './LinkPreviewCard'
import '../styles/item.css'
import { tryPaste } from '../lib/tryPaste'
import { parseColor } from '../lib/colorUtils'
import { useTranslation, t } from '../i18n'

interface Props {
  item: ClipboardItemDto
  /** Shared relative-time clock from ItemList; included in memo so labels age. */
  timeTick?: number
}

/**
 * Full-resolution streaming URL for a local file. Used as the load-failure
 * fallback for bounded thumbnails: Electron's nativeImage decodes only
 * PNG/JPEG, so formats like GIF answer 415 from edgelocal://thumb and the
 * tile swaps to this URL — Chromium then renders (and animates) natively.
 */
export function fileStreamUrl(filePath: string): string {
  return `edgelocal://file/${encodeURIComponent(filePath.replace(/\\/g, '/'))}`
}

/* ------------------------------------------------------------------ */
/* Main item card                                                      */
/* ------------------------------------------------------------------ */

const ClipboardItemBase = forwardRef<HTMLDivElement, Props>(({ item, timeTick = 0 }, ref) => {
  const { t } = useTranslation()
  const copy = useStore.getState().copy
  const paste = useStore.getState().paste
  const togglePin = useStore.getState().togglePin
  const remove = useStore.getState().remove
  const setInternalDragReq = useStore.getState().setInternalDragReq
  const startDrag = useDragOut()
  const [copied, setCopied] = useState(false)

  const settings = useStore((s) => s.settings)
  const isHorizontal = settings.stickPosition === 'top' || settings.stickPosition === 'bottom'
  const colorInfo = item.data.kind === 'text' ? parseColor(item.data.text) : null

  // Accordion expansion: ONE stack open at a time, coordinated store-wide
  // (expanding another stack collapses this one; Escape / outside click /
  // filter or settings switches collapse via the same store field).
  const expandedStackId = useStore((s) => s.expandedStackId)
  const expanded = expandedStackId === item.id
  const setExpandedFlag = useCallback((v: boolean) => {
    useStore.getState().setExpandedStackId(v ? item.id : null)
  }, [item.id])

  const isPreviewing = useStore((s) => s.previewItemId) === item.id
  const isBundle = (item.data.kind === 'files' && item.data.paths.length > 1) || item.data.kind === 'image-collection'

  const bundleCount = item.data.kind === 'image-collection'
    ? item.data.images.length
    : item.data.kind === 'files'
      ? item.data.paths.length
      : 0

  const screenW = typeof window !== 'undefined' ? window.innerWidth : 1140
  const expandedWidth = expanded && isHorizontal
    ? Math.min(screenW - 80, Math.max(300, 36 + bundleCount * 112))
    : undefined

  useEffect(() => {
    if (!isBundle && expanded) setExpandedFlag(false)
  }, [isBundle, expanded, setExpandedFlag])

  // ── Intuitive collapse affordances ──────────────────────────────────────
  // While THIS stack is the open one, a pointerdown anywhere OUTSIDE this
  // card (other cards, empty shelf space) collapses it — standard disclosure
  // behavior. Everything INSIDE this card is exempt, including its empty
  // padding/margins: a partial-boundary exemption caused the infamous
  // collapse→re-expand bounce, because the follow-up click event dispatched
  // against freshly-collapsed state and the body contract re-opened it.
  // The preview flyout is exempt too, so interacting there never surprises.
  useEffect(() => {
    if (!expanded) return

    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Element | null
      if (!target || typeof target.closest !== 'function') return
      if (target.closest('[data-expanded-stack]')) return
      if (target.closest('[data-preview-flyout], .preview-flyout')) return
      setExpandedFlag(false)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [expanded, setExpandedFlag])

  const onCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    playButtonClickSound()
    copy(item.id)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 900)
  }, [copy, item.id])

  const onPaste = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    // Safety guard: NEVER paste if this card is currently previewing (blurred)
    if (useStore.getState().previewItemId === item.id) {
      return
    }
    tryPaste(() => paste(item.id))
  }, [paste, item.id])

  const onExpand = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (isBundle) {
      playCardExpandSound(true)
      setExpandedFlag(true)
      if (useStore.getState().tutorialStep === 4 && item.id === 'onboarding-files') {
        useStore.getState().setTutorialStep(5)
      }
    }
  }, [isBundle, item.id, setExpandedFlag])

  const onCollapse = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    playCardExpandSound(false)
    setExpandedFlag(false)
  }, [setExpandedFlag])

  const handleDragStart = useCallback((e: React.DragEvent, req: DragRequest) => {
    if (item.data.kind === 'text') {
      // We no longer support dragging text/links.
      // Prevent the default browser drag behavior (e.g. text selection dragging) entirely.
      e.preventDefault()
      return
    } else {
      // Images and files need OS-level file handles via Electron's startDrag.
      // Cancel the HTML5 drag (preventDefault) so the browser doesn't run its
      // own ghost in parallel; Electron's startDrag starts an independent OLE
      // drag managed by the OS. Fire the IPC synchronously so main calls
      // event.sender.startDrag(...) on the same tick.
      e.preventDefault()
      setInternalDragReq(req)
      startDrag(req)
    }
  }, [item.data, startDrag, setInternalDragReq])

  const handlePrestage = useCallback(() => {
    if (item.data.kind !== 'text' && !isPreviewing) {
      window.edge.prestageDrag({ id: item.id })
    }
  }, [item.data.kind, isPreviewing, item.id])

  const pointerStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const wasPreviewingRef = useRef(false)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Track if THIS card was the actively previewed (blurred) card when pointer clicked
    wasPreviewingRef.current = (useStore.getState().previewItemId === item.id) || isPreviewing
    if (e.button === 0) {
      pointerStartRef.current = { x: e.clientX, y: e.clientY, moved: false }
    }
    handlePrestage()
  }, [isPreviewing, item.id, handlePrestage])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerStartRef.current) return
    const dist = Math.hypot(e.clientX - pointerStartRef.current.x, e.clientY - pointerStartRef.current.y)
    if (dist > 5) {
      pointerStartRef.current.moved = true
    }
  }, [])

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    if (pointerStartRef.current?.moved) {
      // User dragged or attempted to drag — do not execute click/paste!
      pointerStartRef.current = null
      e.stopPropagation()
      return
    }
    pointerStartRef.current = null

    // In that particular scenario only:
    // When this card is open in preview flyout (blurred), clicking it only
    // minimizes the preview flyout and does NOT paste
    const currentPreviewId = useStore.getState().previewItemId
    if (currentPreviewId === item.id || isPreviewing || wasPreviewingRef.current) {
      wasPreviewingRef.current = false
      e.stopPropagation()
      e.preventDefault()
      playCardExpandSound(false)
      useStore.getState().setPreviewItemId(null)
      return
    }
    wasPreviewingRef.current = false

    // If another card was previewing and user clicked this card to paste:
    // Dismiss the other card's preview and proceed with pasting this card
    if (currentPreviewId && currentPreviewId !== item.id) {
      useStore.getState().setPreviewItemId(null)
    }

    if (isBundle && !expanded) {
      onExpand(e)
    } else if (!isBundle) {
      onPaste(e)
    }
  }, [isPreviewing, isBundle, expanded, onExpand, onPaste, item.id])

  return (
    <motion.div
      ref={ref}
      layout="position"
      layoutId={`ed-card-${item.id}`}
      initial={false}
      animate={{ opacity: 1 }}
      transition={{ layout: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } }}
      className={`item${item.pinned ? ' pinned' : ''}${isBundle ? ' bundle' : ''}${expanded ? ' is-expanded' : ''}${colorInfo ? ` is-color-card ${colorInfo.isLight ? 'is-light-color' : 'is-dark-color'}` : ''}`}
      data-expanded-stack={expanded ? 'true' : undefined}
      style={{
        ...(expandedWidth ? { width: expandedWidth, minWidth: expandedWidth, maxWidth: expandedWidth } : {}),
        ...(colorInfo ? {
          '--card-color': colorInfo.cssColor,
          backgroundColor: colorInfo.cssColor
        } as React.CSSProperties : {})
      }}
    >
      {copied && (
        <motion.div
          key="copy-ripple"
          initial={{ opacity: 0.75, scale: 0.2 }}
          animate={{ opacity: 0, scale: 1.6 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 16,
            background: colorInfo?.isLight
              ? 'radial-gradient(circle at center, rgba(0, 0, 0, 0.25) 0%, rgba(0, 0, 0, 0.06) 45%, transparent 75%)'
              : 'radial-gradient(circle at center, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.08) 45%, transparent 75%)',
            pointerEvents: 'none',
            zIndex: 15
          }}
        />
      )}
      <div
        className={`item-main${isPreviewing ? ' force-actions previewing' : ''}`}
        data-id={item.id}
        draggable={!isPreviewing && item.data.kind !== 'text' && (!isBundle || !expanded)}
        onMouseEnter={handlePrestage}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onDragStart={(e) => {
          if (pointerStartRef.current) pointerStartRef.current.moved = true
          handleDragStart(e, { id: item.id })
        }}
        onDragEnd={() => {
          setInternalDragReq(null)
        }}
        onDragOver={(e) => {
          const activeDrag = useStore.getState().internalDragReq
          if (activeDrag && activeDrag.id !== item.id) {
            e.preventDefault()
          } else if (activeDrag && activeDrag.id === item.id) {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        onDrop={(e) => {
          const activeDrag = useStore.getState().internalDragReq
          if (activeDrag && activeDrag.id !== item.id) {
            e.preventDefault()
            e.stopPropagation()
            window.edge.mergeItems(activeDrag.id, item.id)
            setInternalDragReq(null)
          } else if (activeDrag && activeDrag.id === item.id) {
            e.preventDefault()
            e.stopPropagation()
            setInternalDragReq(null)
          }
        }}
        onClick={handleCardClick}
      >
        <div className="body">
          <div className="item-content">
            {isBundle ? (
                <BundleFluidPreview 
                  item={item} 
                  expanded={expanded} 
                  isHorizontal={isHorizontal}
                  onDragStart={handleDragStart} 
                  onCopy={onCopy} 
                  onRemove={() => remove(item.id)} 
                  onCollapse={onCollapse}
                />
            ) : (
              <Preview item={item} />
            )}
          </div>
          {(!isBundle || !expanded) && (
            <div className="item-footer">
              <div className="meta">
                <KindBadge item={item} />
                <ItemDetails item={item} />
                {item.hitCount > 1 && (
                  <>
                    <span>·</span>
                    <span className="meta-hit-count" title={`Copied ${item.hitCount} times`}>
                      ×{item.hitCount}
                    </span>
                  </>
                )}
                {copied && <span className="meta-copied">· {t('item.copied')}</span>}
              </div>
              <span className="meta-time" key={timeTick}>
                {relativeTime(item.capturedAt)}
              </span>
            </div>
          )}
        </div>

        <div 
          className="actions" 
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); }} 
          style={{ display: isBundle && expanded ? 'none' : undefined }}
        >
          <button
            className={`act${item.pinned ? ' active' : ''}`}
            title={item.pinned ? t('item.unpin') : t('item.pin')}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              e.currentTarget.blur()
              playToggleSound(!item.pinned)
              togglePin(item.id, !item.pinned)
            }}
          >
            {item.pinned ? <PinFillIcon /> : <PinIcon />}
          </button>
          <button
            className={`act${isPreviewing ? ' preview-contract active' : ' preview-expand'}`}
            title={isPreviewing ? t('header.close') : t('item.expand')}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              e.currentTarget.blur()
              playCardExpandSound(!isPreviewing)
              const rect = e.currentTarget.closest('.item-main')?.getBoundingClientRect()
              const rectData = rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : undefined
              useStore.getState().setPreviewItemId(isPreviewing ? null : item.id, rectData)
            }}
          >
            {isPreviewing ? <ContractIcon /> : <ExpandIcon />}
          </button>
          <button 
            className="act" 
            title={t('item.copy')} 
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              e.currentTarget.blur()
              onCopy(e)
            }}
          >
            <CopyIcon />
          </button>
          {item.data.kind === 'text' && item.data.isUrl && (
            <button
              className="act"
              title={t('flyout.openLink')}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                e.currentTarget.blur()
                playButtonClickSound()
                window.open((item.data as any).text, '_blank')
              }}
            >
              <ExternalLinkIcon />
            </button>
          )}
          <div className="act-divider" />
          <button
            className="act danger"
            title={t('item.delete')}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              e.currentTarget.blur()
              playDeleteSound()
              remove(item.id)
            }}
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </motion.div>
  )
})

const expandEase = [0.16, 1, 0.3, 1] as const
const collapseEase = [0.4, 0, 0.2, 1] as const

const stackSlotVariants = {
  open: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.28, ease: expandEase }
  },
  closed: {
    opacity: 0,
    y: -10,
    scale: 0.92,
    transition: { duration: 0.18, ease: collapseEase }
  }
}

const listSlotVariants = {
  open: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.24,
      ease: expandEase,
      staggerChildren: 0.032,
      delayChildren: 0.05
    }
  },
  closed: {
    opacity: 0,
    y: 8,
    transition: { duration: 0.15, ease: collapseEase }
  }
}

const rowVariants = {
  open: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: expandEase }
  },
  closed: {
    opacity: 0,
    y: 8,
    transition: { duration: 0.12, ease: collapseEase }
  }
}

function BundleExpandShell({
  expanded,
  stack,
  list
}: {
  expanded: boolean
  stack: ReactNode
  list: ReactNode
}) {
  return (
    <div className={`fluid-bundle${expanded ? ' is-expanded' : ''}`}>
      <div className="bundle-slot bundle-slot-stack" aria-hidden={expanded}>
        <motion.div
          className="bundle-slot-inner"
          initial={false}
          animate={expanded ? 'closed' : 'open'}
          variants={stackSlotVariants}
          style={{ originY: 0.5 }}
        >
          {stack}
        </motion.div>
      </div>
      <div className="bundle-slot bundle-slot-list" aria-hidden={!expanded}>
        <motion.div
          className="bundle-slot-inner fluid-list"
          initial={false}
          animate={expanded ? 'open' : 'closed'}
          variants={listSlotVariants}
        >
          {list}
        </motion.div>
      </div>
    </div>
  )
}

function BundleToolbar({
  count,
  showCapacity,
  showPin,
  pinned,
  onCollapse,
  onCopy,
  onRemove,
  onTogglePin
}: {
  count?: number
  showCapacity?: boolean
  showPin?: boolean
  pinned?: boolean
  onCollapse: (e?: React.MouseEvent) => void
  onCopy: (e: React.MouseEvent) => void
  onRemove: () => void
  onTogglePin?: () => void
}) {
  return (
    // The ENTIRE toolbar bar is a collapse target — a huge, always-visible
    // hit area where the user's eyes already are. The pills stopPropagation,
    // so Copy/Pin/Delete still do their own jobs without collapsing.
    <div
      className="bundle-actions"
      title={t('item.collapsePinned')}
      onClick={(e) => {
        e.stopPropagation()
        onCollapse(e)
      }}
    >
      <button
        type="button"
        className="bundle-collapse-hit"
        title={t('item.collapsePinned')}
        onClick={(e) => {
          e.stopPropagation()
          e.currentTarget.blur()
          onCollapse(e)
        }}
      >
        <ChevronUpIcon />
      </button>
      {showCapacity && count != null && (
        <div className="bundle-capacity">
          {count} / {MAX_STACK}
        </div>
      )}
      <div className="actions-pill">
        {showPin && onTogglePin && (
          <button
            className={`act${pinned ? ' active' : ''}`}
            title={pinned ? t('item.unpin') : t('item.pin')}
            onClick={(e) => {
              e.stopPropagation()
              e.currentTarget.blur()
              onTogglePin()
            }}
          >
            {pinned ? <PinFillIcon /> : <PinIcon />}
          </button>
        )}
        {/* blur() on every pill: without it the button keeps focus and the
            card's :focus-within rule latches the action bar open after the
            cursor leaves. */}
        <button
          className="act"
          title={t('item.copy')}
          onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); onCopy(e) }}
        >
          <CopyIcon />
        </button>
        <button
          className="act danger"
          title={t('item.delete')}
          onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); onRemove() }}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  )
}

function HorizontalBundleExpanded({
  item,
  onCollapse,
  onCopy,
  onRemove,
  onDragStart
}: {
  item: ClipboardItemDto
  onCollapse: (e?: React.MouseEvent) => void
  onCopy: (e: React.MouseEvent) => void
  onRemove: () => void
  onDragStart: (e: React.DragEvent, req: DragRequest) => void
}) {
  const { t } = useTranslation()
  const isImageCollection = item.data.kind === 'image-collection'
  const isFiles = item.data.kind === 'files'
  const images = item.data.kind === 'image-collection' ? item.data.images : []
  const paths = item.data.kind === 'files' ? item.data.paths : []
  const entries = item.data.kind === 'files' ? item.data.entries : undefined

  return (
    <div className="horizontal-bundle-expanded">
      {/* Top Header Toolbar */}
      <div
        className="horizontal-bundle-header"
        title={t('item.collapsePinned')}
        onClick={(e) => {
          e.stopPropagation()
          onCollapse(e)
        }}
      >
        <button
          type="button"
          className="bundle-collapse-hit"
          title={t('item.collapsePinned')}
          onClick={(e) => {
            e.stopPropagation()
            e.currentTarget.blur()
            onCollapse(e)
          }}
        >
          <ChevronLeftIcon />
        </button>
        <div className="actions-pill" onClick={(e) => e.stopPropagation()}>
          <button
            className="act"
            title={t('item.copy')}
            onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); onCopy(e) }}
          >
            <CopyIcon />
          </button>
          <button
            className="act danger"
            title={t('item.delete')}
            onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); onRemove() }}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Horizontal Sub-Item Track */}
      <div className="horizontal-subitem-track" onClick={(e) => e.stopPropagation()}>
        {isImageCollection && images.map((img) => (
          <motion.div
            key={img.imageId}
            className="horizontal-subitem-tile"
            variants={rowVariants}
            draggable
            onMouseEnter={() => window.edge.prestageDrag({ id: item.id, imageId: img.imageId })}
            onPointerDown={() => window.edge.prestageDrag({ id: item.id, imageId: img.imageId })}
            onDragStartCapture={(e: any) => { e.stopPropagation(); onDragStart(e, { id: item.id, imageId: img.imageId }) }}
            onClick={(e) => { e.stopPropagation(); tryPaste(() => window.edge.pasteSubitem({ id: item.id, imageId: img.imageId })) }}
          >
            <div className="horizontal-subitem-actions">
              <button
                className="act subitem-copy-btn"
                title={t('item.copy')}
                onClick={(e) => {
                  e.stopPropagation()
                  e.currentTarget.blur()
                  useStore.getState().copySubitem({ id: item.id, imageId: img.imageId })
                }}
              >
                <CopyIcon width={11} height={11} />
              </button>
              <button
                className="act subitem-delete-btn"
                title={t('item.ungroup')}
                onClick={(e) => {
                  e.stopPropagation()
                  e.currentTarget.blur()
                  window.edge.splitItem({ id: item.id, imageId: img.imageId, splitPlacement: 'after' })
                }}
              >
                <MinusIcon width={11} height={11} />
              </button>
            </div>
            <div className="horizontal-subitem-icon-wrap">
              <img
                src={img.preview}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="horizontal-subitem-img"
              />
            </div>
            <div className="horizontal-subitem-meta">
              <span className="horizontal-subitem-name">{img.width}×{img.height}</span>
              <span className="horizontal-subitem-sub">{formatBytes(img.bytes)}</span>
            </div>
          </motion.div>
        ))}

        {isFiles && paths.map((filePath, index) => {
          const entry = entries?.[index]
          const name = formatImageDisplayName(entry?.name ?? filePath, item.capturedAt)
          const size = entry?.size ?? 0
          const isImg = entry?.isImage && entry.preview

          return (
            <motion.div
              key={`${item.id}-${filePath}-${index}`}
              className="horizontal-subitem-tile"
              variants={rowVariants}
              draggable
              onMouseEnter={() => window.edge.prestageDrag({ id: item.id, paths: [filePath] })}
              onPointerDown={() => window.edge.prestageDrag({ id: item.id, paths: [filePath] })}
              onDragStartCapture={(e: any) => { e.stopPropagation(); onDragStart(e, { id: item.id, paths: [filePath] }) }}
              onClick={(e) => { e.stopPropagation(); tryPaste(() => window.edge.pasteSubitem({ id: item.id, paths: [filePath] })) }}
            >
              <div className="horizontal-subitem-actions">
                <button
                  className="act subitem-copy-btn"
                  title={t('item.copyFilePath')}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.currentTarget.blur()
                    useStore.getState().copySubitem({ id: item.id, paths: [filePath] })
                  }}
                >
                  <CopyIcon width={11} height={11} />
                </button>
                <button
                  className="act subitem-delete-btn"
                  title={t('item.ungroup')}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.currentTarget.blur()
                    window.edge.splitItem({ id: item.id, paths: [filePath], splitPlacement: 'after' })
                  }}
                >
                  <MinusIcon width={11} height={11} />
                </button>
              </div>
              <div className="horizontal-subitem-icon-wrap">
                {isImg ? (
                  <img
                    src={entry.preview!}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="horizontal-subitem-img"
                  />
                ) : (
                  <FileKindIcon path={filePath} width={40} height={40} isDirectory={entry?.isDirectory} />
                )}
              </div>
              <div className="horizontal-subitem-meta">
                <span className="horizontal-subitem-name" title={name}>{name}</span>
                <span className="horizontal-subitem-sub">{size > 0 ? formatBytes(size) : getFileKind(filePath, entry?.isDirectory).label}</span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function BundleFluidPreview({
  item,
  expanded,
  isHorizontal = false,
  onDragStart,
  onCopy,
  onRemove,
  onCollapse,
}: {
  item: ClipboardItemDto
  expanded: boolean
  isHorizontal?: boolean
  onDragStart: (e: React.DragEvent, req: DragRequest) => void
  onCopy: (e: React.MouseEvent) => void
  onRemove: () => void
  onCollapse: (e?: React.MouseEvent) => void
}) {
  if (isHorizontal && expanded) {
    return (
      <HorizontalBundleExpanded
        item={item}
        onCollapse={onCollapse}
        onCopy={onCopy}
        onRemove={onRemove}
        onDragStart={onDragStart}
      />
    )
  }

  if (item.data.kind === 'image-collection') {
    const more = item.data.images.length - 1
    const photoSize = isHorizontal ? 76 : 124
    return (
      <BundleExpandShell
        expanded={expanded}
        stack={
          <>
            <div className="bundle-stack-large" style={isHorizontal ? { height: 82 } : undefined}>
              {item.data.images.slice(0, 4).map((img, pathIndex) => ({ img, pathIndex })).reverse().map(({ img }, idx, arr) => {
                const realIndex = arr.length - 1 - idx
                const spread = arr.length > 1 ? (isHorizontal ? 12 : 16) : 0
                const rotSpread = arr.length > 1 ? (isHorizontal ? 5 : 7) : 0
                const centerOffset = ((arr.length - 1) * spread) / 2
                const centerRot = ((arr.length - 1) * rotSpread) / 2
                const stackMotion = {
                  x: realIndex * spread - centerOffset,
                  y: 0,
                  rotate: realIndex * rotSpread - centerRot,
                  scale: 1 - realIndex * 0.04
                }
                return (
                  <motion.div
                    key={img.imageId}
                    className="bundle-stack-icon-item"
                    animate={stackMotion}
                    style={{
                      zIndex: 10 - realIndex,
                      width: photoSize,
                      height: photoSize,
                      marginTop: -photoSize / 2,
                      marginLeft: -photoSize / 2
                    }}
                  >
                    <FileStackPhoto src={img.preview} width={photoSize} height={photoSize} />
                  </motion.div>
                )
              })}
            </div>
            {more > 0 && <div className="bundle-more-label">{t('item.moreImages', { count: more })}</div>}
          </>
        }
        list={
          <>
            <BundleToolbar
              showPin
              pinned={item.pinned}
              onCollapse={onCollapse}
              onCopy={onCopy}
              onRemove={onRemove}
              onTogglePin={() => useStore.getState().togglePin(item.id, !item.pinned)}
            />
            {item.data.images.map((img) => (
              <motion.div
                key={img.imageId}
                className="fluid-card-row"
                variants={rowVariants}
                draggable
                onMouseEnter={() => window.edge.prestageDrag({ id: item.id, imageId: img.imageId })}
                onPointerDown={() => window.edge.prestageDrag({ id: item.id, imageId: img.imageId })}
                onDragStartCapture={(e: any) => { e.stopPropagation(); onDragStart(e, { id: item.id, imageId: img.imageId }) }}
                onClick={(e) => { e.stopPropagation(); tryPaste(() => window.edge.pasteSubitem({ id: item.id, imageId: img.imageId })) }}
              >
                <div className="fluid-row-icon">
                  <img
                    src={img.preview}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="fluid-row-img"
                  />
                </div>
                <div className="fluid-row-content">
                  <div className="fluid-row-name">{t('item.imageItem')} · {img.width} × {img.height}</div>
                  <div className="fluid-row-sub">{formatBytes(img.bytes)}</div>
                </div>
                <div className="fluid-row-actions">
                  <button
                    className="act subitem-delete-btn"
                    title={t('item.ungroup')}
                    onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); window.edge.splitItem({ id: item.id, imageId: img.imageId, splitPlacement: 'after' }); }}
                  >
                    <MinusIcon width={12} height={12} />
                  </button>
                </div>
              </motion.div>
            ))}
          </>
        }
      />
    )
  }

  if (item.data.kind === 'files') {
    const entries = item.data.entries
    const paths = item.data.paths
    const count = paths.length
    const photoSize = isHorizontal ? 76 : 124
    return (
      <BundleExpandShell
        expanded={expanded}
        stack={
          <>
            <div className="bundle-stack-large" style={isHorizontal ? { height: 82 } : undefined}>
              {paths.slice(0, 4).map((filePath, i) => ({ filePath, pathIndex: i })).reverse().map(({ filePath, pathIndex }, idx, arr) => {
                const realIndex = arr.length - 1 - idx
                const entry = entries?.[pathIndex]
                const isImg = !!(entry?.isImage && entry.preview)
                const spread = arr.length > 1 ? (isHorizontal ? 12 : 16) : 0
                const rotSpread = arr.length > 1 ? (isHorizontal ? 5 : 7) : 0
                const centerOffset = ((arr.length - 1) * spread) / 2
                const centerRot = ((arr.length - 1) * rotSpread) / 2
                const stackMotion = {
                  x: realIndex * spread - centerOffset,
                  y: 0,
                  rotate: realIndex * rotSpread - centerRot,
                  scale: 1 - realIndex * 0.04
                }

                return (
                  <motion.div
                    key={`${item.id}-${pathIndex}`}
                    className="bundle-stack-icon-item"
                    animate={stackMotion}
                    style={{
                      zIndex: 10 - realIndex,
                      width: photoSize,
                      height: photoSize,
                      marginTop: -photoSize / 2,
                      marginLeft: -photoSize / 2
                    }}
                  >
                    {isImg ? (
                      <FileStackPhoto
                        src={entry.preview!}
                        width={photoSize}
                        height={photoSize}
                        fallbackSrc={fileStreamUrl(filePath)}
                      />
                    ) : (
                      <FileKindIcon path={filePath} width={photoSize} height={photoSize} isDirectory={entry?.isDirectory} />
                    )}
                  </motion.div>
                )
              })}
            </div>
            {count > 1 ? (
              <div className="bundle-more-label">{t('item.moreFiles', { count: count - 1 })}</div>
            ) : (
              <div className="bundle-more-label">{t('item.singleFile')}</div>
            )}
          </>
        }
        list={
          <>
            <BundleToolbar
              count={count}
              showCapacity
              onCollapse={onCollapse}
              onCopy={onCopy}
              onRemove={onRemove}
            />
            {paths.map((filePath, index) => {
              const entry = entries?.[index]
              const name = formatImageDisplayName(entry?.name ?? filePath, item.capturedAt)
              const size = entry?.size ?? 0
              return (
                <motion.div
                  key={`${item.id}-${filePath}-${index}`}
                  className="fluid-card-row"
                  variants={rowVariants}
                  draggable
                  onMouseEnter={() => window.edge.prestageDrag({ id: item.id, paths: [filePath] })}
                  onPointerDown={() => window.edge.prestageDrag({ id: item.id, paths: [filePath] })}
                  onDragStartCapture={(e: any) => { e.stopPropagation(); onDragStart(e, { id: item.id, paths: [filePath] }) }}
                  onClick={(e) => { e.stopPropagation(); tryPaste(() => window.edge.pasteSubitem({ id: item.id, paths: [filePath] })) }}
                >
                  <div className="fluid-row-icon">
                    {entry?.isImage && entry.preview ? (
                      <FileStackPhoto src={entry.preview} width={48} height={48} fallbackSrc={fileStreamUrl(filePath)} />
                    ) : (
                      <FileKindIcon path={filePath} width={44} height={44} isDirectory={entry?.isDirectory} />
                    )}
                  </div>
                  <div className="fluid-row-content">
                    <div className="fluid-row-name" title={name}>{name}</div>
                    <div className="fluid-row-sub">
                      {size > 0 ? formatBytes(size) : getFileKind(filePath, entry?.isDirectory).label}
                    </div>
                  </div>
                  <div className="fluid-row-actions">
                    <button
                      className="act subitem-copy-btn"
                      title={t('item.copyFilePath')}
                      onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); useStore.getState().copySubitem({ id: item.id, paths: [filePath] }); }}
                    >
                      <CopyIcon width={12} height={12} />
                    </button>
                    <button
                      className="act subitem-delete-btn"
                      title={t('item.ungroup')}
                      onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); window.edge.splitItem({ id: item.id, paths: [filePath], splitPlacement: 'after' }); }}
                    >
                      <MinusIcon width={12} height={12} />
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </>
        }
      />
    )
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Preview                                                             */
/* ------------------------------------------------------------------ */

function Preview({ item }: { item: ClipboardItemDto }) {
  switch (item.data.kind) {
    case 'text': {
      if (item.data.isUrl) {
        return <LinkPreviewCard url={item.data.text} />
      }
      const colorInfo = parseColor(item.data.text)
      if (colorInfo) {
        return (
          <div className="color-swatch-content">
            <div className="color-swatch-code">{colorInfo.displayText}</div>
          </div>
        )
      }
      return <div className="preview">{previewText(item.data.text)}</div>
    }

    case 'image':
      return (
        <div className="thumb-wrap">
          {item.data.preview ? (
            <img
              className="thumb"
              src={item.data.preview}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          ) : (
            <div className="preview">[{t('item.imageItem')}]</div>
          )}
        </div>
      )

    case 'files': {
      const first = item.data.paths[0]
      const entry = item.data.entries?.[0]
      const rawName = entry?.name ?? basename(first)
      const displayName = formatImageDisplayName(first, item.capturedAt)
      const isInternalHash = /^[a-z0-9]{6,12}-[a-z0-9]{6,12}\.[a-z0-9]+$/i.test(rawName) || first.includes('edge-drop/images') || first.includes('edge-drop\\images') || first.includes('edge-drop/temp') || first.includes('edge-drop\\temp')
      const isImage = !entry?.isDirectory && (entry?.isImage || getFileKind(first).kind === 'image')

      // Single image file — show its thumbnail.
      if (item.data.paths.length === 1 && isImage) {
        return (
          <>
            <div className="thumb-wrap">
              {entry?.preview ? (
                <img
                  className="thumb"
                  src={entry.preview}
                  onError={(e) => {
                    const fallback = `edgelocal://file/${encodeURIComponent(first.replace(/\\/g, '/'))}`
                    if (e.currentTarget.src !== fallback) {
                      e.currentTarget.src = fallback
                    }
                  }}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              ) : (
                <div className="preview">[{t('item.imagePlaceholder')}: {displayName}]</div>
              )}
            </div>
            {!isInternalHash && (
              <div className="preview single" style={{ marginTop: 4 }}>
                {displayName}
              </div>
            )}
          </>
        )
      }
      // Non-image single file — show hero icon on top, and name on the bottom!
      const info = getFileKind(first, entry?.isDirectory)
      return (
        <div className="single-file-preview">
          <div className="single-file-hero" style={{ color: info.color }}>
            <FileKindIcon path={first} isDirectory={entry?.isDirectory} />
          </div>
          <div className="single-file-meta">
            <div className="preview single single-file-name" title={displayName}>
              {displayName}
            </div>
          </div>
        </div>
      )
    }
  }
}

/* ------------------------------------------------------------------ */
/* Kind badge                                                          */
/* ------------------------------------------------------------------ */

function KindBadge({ item }: { item: ClipboardItemDto }) {
  switch (item.data.kind) {
    case 'text':
      if (item.data.isUrl)
        return <span className="kind-badge url">{t('filters.links').toLowerCase()}</span>
      if (item.data.isColor || parseColor(item.data.text))
        return <span className="kind-badge color">color</span>
      return <span className="kind-badge">{t('filters.text').toLowerCase()}</span>
    case 'image':
      return (
        <span className="kind-badge">
          {t('filters.images').toLowerCase().slice(0, -1) || t('filters.images').toLowerCase()}
        </span>
      )
    case 'image-collection':
      return (
        <span className="kind-badge">
          {item.data.images.length} {t('filters.images').toLowerCase()}
        </span>
      )
    case 'files': {
      const firstPath = item.data.paths[0]
      const entry = item.data.entries?.[0]
      const info = getFileKind(firstPath, entry?.isDirectory)
      const count = item.data.paths.length
      const isImage = count === 1 && !entry?.isDirectory && (entry?.isImage || info.kind === 'image')
      if (isImage) {
        return (
          <span className="kind-badge">
            {t('filters.images').toLowerCase().slice(0, -1) || t('filters.images').toLowerCase()}
          </span>
        )
      }
      const label = count > 1 ? `${count} ${t('filters.files').toLowerCase()}` : info.label.toLowerCase()
      return (
        <span className="kind-badge" style={{ color: count > 1 ? undefined : info.color }}>
          {label}
        </span>
      )
    }
  }
}

function ItemDetails({ item }: { item: ClipboardItemDto }) {
  switch (item.data.kind) {
    case 'text': {
      if (item.data.isUrl) {
        let domain = ''
        try {
          const urlStr = item.data.text.startsWith('http://') || item.data.text.startsWith('https://')
            ? item.data.text
            : `https://${item.data.text}`
          domain = new URL(urlStr).hostname.replace(/^www\./, '')
        } catch {}
        if (domain) {
          return <span className="meta-detail">· {domain}</span>
        }
        return null
      }

      const colorInfo = parseColor(item.data.text)
      if (item.data.isColor || colorInfo) {
        return null
      }

      return null
    }

    case 'image': {
      const dims = item.data.width && item.data.height ? `${item.data.width}×${item.data.height}` : ''
      const size = item.data.bytes ? formatBytes(item.data.bytes) : ''
      return (
        <>
          {dims && <span className="meta-detail">· {dims}</span>}
          {size && <span className="meta-detail">· {size}</span>}
        </>
      )
    }

    case 'image-collection': {
      const totalBytes = item.data.images?.reduce((acc, img) => acc + (img.bytes || 0), 0) || 0
      return totalBytes > 0 ? <span className="meta-detail">· {formatBytes(totalBytes)}</span> : null
    }

    case 'files': {
      const entries = item.data.entries
      const totalBytes = entries?.reduce((acc, e) => acc + (e.size || 0), 0) || 0
      return totalBytes > 0 ? <span className="meta-detail">· {formatBytes(totalBytes)}</span> : null
    }

    default:
      return null
  }
}

/**
 * Memo comparator backed by a value-based render key: every `state:items`
 * push recreates all DTO objects, so shallow identity compare would re-render
 * the entire list on each push. This skips the re-render unless any field the
 * card actually displays changed. Store-subscription-driven updates (open,
 * previewing) and local state (copied/expanded) are unaffected — memo only
 * gates prop-driven renders.
 */
export const ClipboardItemCard = memo(
  ClipboardItemBase,
  (prevProps, nextProps) => {
    const prev = prevProps.item
    const next = nextProps.item
    return (
      prev.id === next.id &&
      prev.pinned === next.pinned &&
      prev.hitCount === next.hitCount &&
      prev.capturedAt === next.capturedAt &&
      prevProps.timeTick === nextProps.timeTick &&
      itemRenderKey(prev) === itemRenderKey(next)
    )
  }
)
