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
import { memo, useState, useCallback, useEffect, useLayoutEffect, useRef, forwardRef, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { ClipboardItemDto } from '../../shared/types'
import { MAX_STACK } from '../../shared/types'
import type { DragRequest } from '../../shared/types'
import { useStore } from '../store/appStore'
import { useDragOut } from '../hooks/useDragOut'
import { itemRenderKey } from '../lib/itemSignature'
import { basename, formatBytes, previewText, relativeTime, formatImageDisplayName } from '../lib/format'
import { getFileKind, kindBadge } from '../lib/fileType'
import { playButtonClickSound, playToggleSound, playDeleteSound, playCardExpandSound } from '../lib/soundEffects'
import { CopyIcon, FileKindIcon, FileStackPhoto, PinIcon, PinFillIcon, TrashIcon, MinusIcon, ChevronUpIcon, ChevronLeftIcon, ExpandIcon, ContractIcon, ExternalLinkIcon } from './icons'
import { DashedOutline } from './DashedOutline'
import { LinkPreviewCard } from './LinkPreviewCard'
import { parseUrlPreview } from '../lib/urlPreview'
import { localizeLinkInfo } from '../lib/linkLabels'
import { CodeBlock } from './CodeBlock'
import { StackHeader, StackItems, fileStackEntries, imageCollectionEntries, stackOpenWidth } from './StackItems'
import { detectCode } from '../lib/codeDetect'
import '../styles/item.css'
import { tryPaste } from '../lib/tryPaste'
import { parseColor } from '../lib/colorUtils'
import { externalHref } from '../lib/urlPreview'
import { useTranslation, t } from '../i18n'
import { useRelativeTimeTick } from '../hooks/useRelativeTimeTick'

export const RelativeTime = memo(function RelativeTime({ capturedAt }: { capturedAt: number }) {
  useRelativeTimeTick()
  return <span className="meta-time">{relativeTime(capturedAt)}</span>
})

interface Props {
  item: ClipboardItemDto
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

const ClipboardItemBase = forwardRef<HTMLDivElement, Props>(({ item }, ref) => {
  const { t } = useTranslation()
  const copy = useStore.getState().copy
  const paste = useStore.getState().paste
  const togglePin = useStore.getState().togglePin
  const remove = useStore.getState().remove
  const setInternalDragReq = useStore.getState().setInternalDragReq
  const startDrag = useDragOut()
  const [copied, setCopied] = useState(false)

  // Narrow subscriptions: a card re-renders only when what it shows changes
  // (not on every settings write, or when another card previews / expands).
  const isHorizontal = useStore((s) => s.settings.stickPosition === 'top')
  const colorInfo = item.data.kind === 'text' ? parseColor(item.data.text) : null

  // Accordion expansion: ONE stack open at a time, coordinated store-wide
  // (expanding another stack collapses this one; Escape / outside click /
  // filter or settings switches collapse via the same store field).
  const expanded = useStore((s) => s.expandedStackId === item.id)
  const setExpandedFlag = useCallback((v: boolean) => {
    useStore.getState().setExpandedStackId(v ? item.id : null)
  }, [item.id])

  const isPreviewing = useStore((s) => s.previewItemId === item.id)
  const isMenuTarget = useStore((s) => s.cardMenu?.itemId === item.id)
  // In-app drag: the card a drop would merge into, and the whole card being dragged.
  const isDropTarget = useStore((s) => s.dropTargetId === item.id)
  const isDragSource = useStore((s) => s.internalDragReq?.id === item.id && !s.internalDragReq.imageId && !s.internalDragReq.paths?.length)
  const isBundle = (item.data.kind === 'files' && item.data.paths.length > 1) || item.data.kind === 'image-collection'
  const isSingleImage = item.data.kind === 'image' || (
    item.data.kind === 'files' &&
    item.data.paths.length === 1 &&
    !(item.data as any).entries?.[0]?.isDirectory &&
    ((item.data as any).entries?.[0]?.isImage || getFileKind(item.data.paths[0]).kind === 'image')
  )
  const isImageStack = item.data.kind === 'image-collection' || (
    item.data.kind === 'files' &&
    item.data.paths.length > 1 &&
    item.data.paths.every((p, i) => !(item.data as any).entries?.[i]?.isDirectory && ((item.data as any).entries?.[i]?.isImage || getFileKind(p).kind === 'image'))
  )
  const isImageFolderCard = isSingleImage || isImageStack
  const isFileCard = item.data.kind === 'files' && !isImageFolderCard

  const bundleCount = item.data.kind === 'image-collection'
    ? item.data.images.length
    : item.data.kind === 'files'
      ? item.data.paths.length
      : 0

  const expandedWidth = expanded && isHorizontal
    ? (isImageFolderCard || isFileCard
        ? stackOpenWidth(bundleCount, isImageStack)
        : Math.max(300, 48 + bundleCount * 124))
    : undefined

  const cardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isBundle && expanded) setExpandedFlag(false)
  }, [isBundle, expanded, setExpandedFlag])

  // ── Intuitive collapse affordances ──────────────────────────────────────
  // While THIS stack is the open one, a pointerdown anywhere OUTSIDE all cards
  // (e.g. empty shelf space) collapses it. Clicks on any card (.item) or inside
  // this card/flyout are exempt so the clicked card can expand/paste immediately on 1 click!
  useEffect(() => {
    if (!expanded) return

    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Element | null
      if (!target || typeof target.closest !== 'function') return
      if (target.closest('[data-expanded-stack]')) return
      if (target.closest('[data-preview-flyout], .preview-flyout')) return
      if (target.closest('.card-menu')) return
      if (target.closest('.item')) return
      setExpandedFlag(false)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [expanded, setExpandedFlag])

  // Smooth scroll stabilization when a stack expands: ensure the start/header of the card stays visible without scrolling to the end
  useLayoutEffect(() => {
    if (!expanded) return
    const el = cardRef.current
    if (!el) return
    const container = el.closest('.list')
    if (!container) return

    const rafId = requestAnimationFrame(() => {
      const containerRect = container.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()

      if (isHorizontal) {
        const leftDiff = elRect.left - containerRect.left
        if (leftDiff < 0) {
          container.scrollBy({ left: leftDiff - 16, behavior: 'smooth' })
        }
      } else {
        const topDiff = elRect.top - containerRect.top
        if (topDiff < 0) {
          container.scrollBy({ top: topDiff - 16, behavior: 'smooth' })
        }
      }
    })

    return () => cancelAnimationFrame(rafId)
  }, [expanded, isHorizontal])

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
    // Shift+click: paste text without its formatting (same as the menu's
    // "Paste as plain text"; plain text has nothing to strip).
    const plain = !!e?.shiftKey && item.data.kind === 'text'
    tryPaste(() => paste(item.id, plain ? { plain: true } : undefined))
  }, [paste, item.id, item.data.kind])

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
    if (e.button !== 0) return // right-click opens the menu; nothing to stage
    pointerStartRef.current = { x: e.clientX, y: e.clientY, moved: false }
    handlePrestage()
  }, [isPreviewing, item.id, handlePrestage])

  // Right-click: the card menu (not during the tutorial or a drag).
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const s = useStore.getState()
    if (s.tutorialStep > 0 || s.internalDragReq) return
    s.openCardMenu(item.id, e.clientX, e.clientY)
  }, [item.id])

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
      if (useStore.getState().expandedStackId) {
        useStore.getState().setExpandedStackId(null)
      }
      onPaste(e)
    }
  }, [isPreviewing, isBundle, expanded, onExpand, onPaste, item.id])

  return (
    <motion.div
      ref={(node: HTMLDivElement | null) => {
        cardRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) (ref as any).current = node
      }}
      initial={false}
      animate={{ opacity: 1 }}
      className={`item${item.pinned ? ' pinned' : ''}${isMenuTarget ? ' menu-target' : ''}${isDropTarget ? ' is-drop-target' : ''}${isDragSource ? ' is-drag-source' : ''}${isBundle ? ' bundle' : ''}${expanded ? ' is-expanded' : ''}${colorInfo ? ` is-color-card ${colorInfo.isLight ? 'is-light-color' : 'is-dark-color'}` : ''}${isImageFolderCard || isFileCard ? ' is-image-folder-card' : ''}`}
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
      {isDropTarget && (
        <div className="drop-target-ring" aria-hidden="true">
          <DashedOutline radius={14} />
        </div>
      )}
      <div
        className={`item-main${isPreviewing ? ' force-actions previewing' : ''}`}
        data-id={item.id}
        draggable={!isPreviewing && item.data.kind !== 'text' && (!isBundle || !expanded)}
        onMouseEnter={handlePrestage}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onContextMenu={handleContextMenu}
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
        {isImageFolderCard ? (
          <ImageFolderCard
            item={item}
            copied={copied}
            expanded={expanded}
            isHorizontal={isHorizontal}
            onDragStart={handleDragStart}
            onCopy={onCopy}
            onRemove={() => remove(item.id)}
            onCollapse={onCollapse}
          />
        ) : isFileCard ? (
          <FileFolderCard
            item={item}
            copied={copied}
            expanded={expanded}
            isHorizontal={isHorizontal}
            onDragStart={handleDragStart}
            onCopy={onCopy}
            onRemove={() => remove(item.id)}
            onCollapse={onCollapse}
          />
        ) : (
          <div className="body">
            {item.note && (!isBundle || !expanded) && (
              <div className="item-note" title={item.note}>{item.note}</div>
            )}
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
                      <span className="meta-hit-count" title={t('count.copiedTimes', { count: item.hitCount })}>
                        ×{item.hitCount}
                      </span>
                    </>
                  )}
                  {copied && <span className="meta-copied">· {t('item.copied')}</span>}
                </div>
                <RelativeTime capturedAt={item.capturedAt} />
              </div>
            )}
          </div>
        )}

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
                window.open(externalHref((item.data as any).text), '_blank')
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
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onCollapse(e)
      }}
    >
      <button
        type="button"
        className="bundle-collapse-hit"
        title={t('item.collapsePinned')}
        onPointerDown={(e) => e.stopPropagation()}
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
      <div className="actions-pill" onPointerDown={(e) => e.stopPropagation()}>
        {showPin && onTogglePin && (
          <button
            className={`act${pinned ? ' active' : ''}`}
            title={pinned ? t('item.unpin') : t('item.pin')}
            onPointerDown={(e) => e.stopPropagation()}
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
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); onCopy(e) }}
        >
          <CopyIcon />
        </button>
        <button
          className="act danger"
          title={t('item.delete')}
          onPointerDown={(e) => e.stopPropagation()}
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
  const isPreviewing = useStore((s) => s.previewItemId === item.id)
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
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onCollapse(e)
        }}
      >
        <button
          type="button"
          className="bundle-collapse-hit"
          title={t('item.collapsePinned')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            e.currentTarget.blur()
            onCollapse(e)
          }}
        >
          <ChevronLeftIcon />
        </button>
        <div className="actions-pill" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <button
            className={`act${item.pinned ? ' active' : ''}`}
            title={item.pinned ? t('item.unpin') : t('item.pin')}
            onPointerDown={(e) => e.stopPropagation()}
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
            onPointerDown={(e) => e.stopPropagation()}
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
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); onCopy(e) }}
          >
            <CopyIcon width={12} height={12} />
          </button>
          <button
            className="act danger"
            title={t('item.delete')}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); onRemove() }}
          >
            <TrashIcon width={12} height={12} />
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
    const photoSize = isHorizontal ? 88 : 132
    return (
      <BundleExpandShell
        expanded={expanded}
        stack={
          <>
            <div className="bundle-stack-large" style={isHorizontal ? { height: 90 } : undefined}>
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
            {more > 0 && <div className="bundle-more-label">{t('count.moreImages', { count: more })}</div>}
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
    const photoSize = isHorizontal ? 80 : 100
    return (
      <BundleExpandShell
        expanded={expanded}
        stack={
          <div className="file-card-viewport bundle-viewport">
            <div className="bundle-stack-large" style={isHorizontal ? { height: 90 } : undefined}>
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
              <div className="bundle-more-label">{t('count.moreFiles', { count: count - 1 })}</div>
            ) : (
              <div className="bundle-more-label">{t('item.singleFile')}</div>
            )}
          </div>
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
/* Image Folder Card (Framed single image or fanned photo stack)      */
/* ------------------------------------------------------------------ */

interface ImageCardEntry {
  id: string
  src?: string
  fallbackSrc?: string
  name?: string
  width?: number
  height?: number
  bytes?: number
}

function getImageEntries(item: ClipboardItemDto): ImageCardEntry[] {
  if (item.data.kind === 'image') {
    return [{
      id: item.id,
      src: item.data.preview,
      name: item.data.fileName || item.data.source || 'clipboard',
      width: item.data.width,
      height: item.data.height,
      bytes: item.data.bytes
    }]
  }
  if (item.data.kind === 'image-collection') {
    return item.data.images.map((img, i) => ({
      id: img.imageId || `${item.id}-${i}`,
      src: img.preview,
      name: `image-${i + 1}`,
      width: img.width,
      height: img.height,
      bytes: img.bytes
    }))
  }
  if (item.data.kind === 'files') {
    return item.data.paths.map((filePath, i) => {
      const entry = (item.data as any).entries?.[i]
      const fallback = fileStreamUrl(filePath)
      return {
        id: `${item.id}-${filePath}-${i}`,
        src: entry?.preview || fallback,
        fallbackSrc: fallback,
        name: formatImageDisplayName(filePath, item.capturedAt) || entry?.name || basename(filePath),
        width: entry?.width,
        height: entry?.height,
        bytes: entry?.size
      }
    })
  }
  return []
}

function ImageFolderCard({
  item,
  copied = false,
  expanded = false,
  isHorizontal = false,
  onDragStart,
  onCopy,
  onRemove,
  onCollapse
}: {
  item: ClipboardItemDto
  copied?: boolean
  expanded?: boolean
  isHorizontal?: boolean
  onDragStart?: (e: React.DragEvent, req: DragRequest) => void
  onCopy?: (e: React.MouseEvent) => void
  onRemove?: () => void
  onCollapse?: (e?: React.MouseEvent) => void
}) {
  const { t } = useTranslation()
  const images = getImageEntries(item)
  const count = images.length

  if (count === 0) return null

  const isStack = count > 1
  const displayCount = Math.min(count, 4)
  const displayImages = isStack ? images.slice(0, 4) : images

  // Meta details for elevated tab header and footer name
  let badgeText = ''
  let metaDetail = ''

  if (!isStack) {
    badgeText = t('badge.image')
    const sourceName = images[0].name
    if (sourceName && sourceName !== 'clipboard' && sourceName !== 'image') {
      metaDetail = sourceName
    }
  } else {
    badgeText = t('count.images', { count })
    const firstNonGeneric = images.find((img) => img.name && img.name !== 'clipboard' && !img.name.startsWith('image-'))?.name
    if (firstNonGeneric) {
      metaDetail = firstNonGeneric
    }
  }

  return (
    <div className={`image-folder-card-inner${expanded && isStack ? ' is-expanded-folder' : ''}`}>
      <div className={`image-folder-viewport is-textured${expanded && isStack ? ' is-expanded-viewport' : ''}`}>
        {!isStack ? (
          displayImages[0].src ? (
            <img
              className="image-folder-thumb"
              src={displayImages[0].src}
              onError={(e) => {
                if (displayImages[0].fallbackSrc && e.currentTarget.src !== displayImages[0].fallbackSrc) {
                  e.currentTarget.src = displayImages[0].fallbackSrc
                }
              }}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          ) : (
            <div className="preview">[{t('item.imageItem')}]</div>
          )
        ) : (
          <StackExpandSwap
            expanded={expanded}
            deckKey="img-stack-deck"
            panelKey="img-stack-panel"
            deck={
          <div className="image-folder-stack-deck" data-count={displayCount}>
            {displayImages.map((img, idx) => (
              <div
                key={img.id}
                className={`image-folder-stack-item pos-${idx}`}
              >
                <img
                  src={img.src}
                  onError={(e) => {
                    if (img.fallbackSrc && e.currentTarget.src !== img.fallbackSrc) {
                      e.currentTarget.src = img.fallbackSrc
                    }
                  }}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              </div>
            ))}
          </div>
            }
            panel={
          <div className="image-folder-expanded-content">
            <StackHeader
              item={item}
              title={t('count.images', { count })}
              isHorizontal={isHorizontal}
              onCollapse={onCollapse}
              onCopy={onCopy}
              onRemove={onRemove}
            />
            <StackItems entries={item.data.kind === 'image-collection' ? imageCollectionEntries(item, t) : fileStackEntries(item, t)} isHorizontal={isHorizontal} onDragStart={onDragStart} />
          </div>
            }
          />
        )}
      </div>

      {/* Solid Black Folder Flap (NO stroke/borders, smooth curved silhouette) */}
      {(!expanded || !isStack) && (
        <div className="image-folder-flap-wrap">
          <svg 
            className="image-folder-flap-svg" 
            viewBox="0 0 240 74" 
            preserveAspectRatio="none"
          >
            <path 
              d="M 0,74 L 0,6 Q 0,0 6,0 L 64,0 C 74,0 80,6 85,12 C 90,18 96,24 106,24 L 234,24 Q 240,24 240,30 L 240,74 Z" 
            />
          </svg>

          <div className="image-folder-flap-content">
            {/* Elevated Tab Area: shows type badge (image, 3 images, etc.) */}
            <div className="image-folder-flap-header">
              <span className="kind-badge file-elevated-badge" style={{ color: '#06B6D4' }}>
                {badgeText}
              </span>
            </div>

            {/* Flap Footer: Left side shows image source/file name, Right side shows relative time */}
            <div className="image-folder-flap-footer">
              <div className="image-folder-meta">
                {item.note ? (
                  <span className="image-folder-source-name meta-label" title={metaDetail ? `${item.note} · ${metaDetail}` : item.note}>
                    {item.note}
                  </span>
                ) : metaDetail && (
                  <span className="image-folder-source-name file-name-meta" title={metaDetail}>
                    {metaDetail}
                  </span>
                )}
                {item.hitCount > 1 && (
                  <span className="meta-hit-count" title={t('count.copiedTimes', { count: item.hitCount })}>
                    {(item.note || metaDetail) ? ' · ×' : '×'}{item.hitCount}
                  </span>
                )}
                {copied && <span className="meta-copied">{(item.note || metaDetail || item.hitCount > 1) ? ' · ' : ''}{t('item.copied')}</span>}
              </div>
              <RelativeTime capturedAt={item.capturedAt} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Stack expand/collapse swap                                              */
/* ------------------------------------------------------------------ */

/**
 * Animated swap between a stack's collapsed deck and its expanded rows.
 *
 * Deliberately GPU-only (opacity + translate): animating height on these
 * cards janks because every frame re-layouts up to 10 rows of large
 * gradient SVGs and disk-loaded images. The height snaps instantly under
 * a short fade/slide so the eye tracks the content motion, not the jump.
 * Honors the reduced-motion setting.
 */
function StackExpandSwap({
  expanded,
  deckKey,
  panelKey,
  deck,
  panel
}: {
  expanded: boolean
  deckKey: string
  panelKey: string
  deck: React.ReactNode
  panel: React.ReactNode
}) {
  const reduceMotion = useStore((s) => !!s.settings.reduceMotion)
  if (reduceMotion) return <>{expanded ? panel : deck}</>
  // Enter-only animation: the outgoing side unmounts instantly and the
  // incoming side fades/slides in. No exit overlap — keeping an exiting
  // panel in flow balloons the card (panel height + deck height) then snaps,
  // which is exactly what made closing feel broken.
  return (
    <motion.div
      key={expanded ? panelKey : deckKey}
      className={expanded ? 'stack-expand-panel' : 'stack-collapse-deck'}
      initial={{ opacity: 0, y: expanded ? -10 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: expanded ? 0.22 : 0.15, ease: 'easeOut' }}
    >
      {expanded ? panel : deck}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* File Folder Card (Framed File / Folder / Stack in Blue Folder Card) */
/* ------------------------------------------------------------------ */

function FileFolderCard({
  item,
  copied = false,
  expanded = false,
  isHorizontal = false,
  onDragStart,
  onCopy,
  onRemove,
  onCollapse
}: {
  item: ClipboardItemDto
  copied?: boolean
  expanded?: boolean
  isHorizontal?: boolean
  onDragStart?: (e: React.DragEvent, req: DragRequest) => void
  onCopy?: (e: React.MouseEvent) => void
  onRemove?: () => void
  onCollapse?: (e?: React.MouseEvent) => void
}) {
  const { t } = useTranslation()
  if (item.data.kind !== 'files') return null

  const paths = item.data.paths
  const entries = item.data.entries
  const count = paths.length
  const isStack = count > 1
  const first = paths[0]
  const entry = entries?.[0]
  const rawName = formatImageDisplayName(entry?.name ?? first, item.capturedAt) || basename(first)
  const info = getFileKind(first, entry?.isDirectory)

  const label = isStack ? t('count.files', { count }) : kindBadge(info.kind)
  const badgeColor = isStack ? undefined : info.color

  return (
    <div className={`image-folder-card-inner${expanded && isStack ? ' is-expanded-folder' : ''}`}>
      <div className={`image-folder-viewport is-textured${expanded && isStack ? ' is-expanded-viewport' : ''}`}>
        {!isStack ? (
          (!entry?.isDirectory && (entry?.isImage || info.kind === 'image')) ? (
            <img
              className="image-folder-thumb"
              src={entry?.preview || `edgelocal://file/${encodeURIComponent(first.replace(/\\/g, '/'))}`}
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
            <div className="single-file-hero" style={{ color: info.color }}>
              <FileKindIcon path={first} isDirectory={entry?.isDirectory} width={isHorizontal ? 94 : 136} height={isHorizontal ? 94 : 136} layered />
            </div>
          )
        ) : (
          <StackExpandSwap
            expanded={expanded}
            deckKey="file-stack-deck"
            panelKey="file-stack-panel"
            deck={
          <div className="image-folder-stack-deck is-file-deck" data-count={Math.min(count, 4)}>
            {paths.slice(0, 4).map((filePath, idx) => {
              const fileEntry = entries?.[idx]
              const fileInfo = getFileKind(filePath, fileEntry?.isDirectory)
              const isImg = !fileEntry?.isDirectory && (fileEntry?.isImage || fileInfo.kind === 'image')
              // Front folder art is ~65% of the icon tall; sized so the cascade
              // fits the viewport above the label flap in each dock.
              const iconSize = isHorizontal ? 94 : 148
              const imgSrc = fileEntry?.preview || `edgelocal://file/${encodeURIComponent(filePath.replace(/\\/g, '/'))}`
              return (
                <div
                  key={`${item.id}-${filePath}-${idx}`}
                  className={`${isImg ? 'image-folder-stack-item' : 'file-stack-folder'} pos-${idx}`}
                  style={{ color: fileInfo.color }}
                >
                  {isImg ? (
                    <img
                      src={imgSrc}
                      onError={(e) => {
                        const fallback = `edgelocal://file/${encodeURIComponent(filePath.replace(/\\/g, '/'))}`
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
                    <FileKindIcon path={filePath} isDirectory={fileEntry?.isDirectory} width={iconSize} height={iconSize} layered={idx === 0} />
                  )}
                </div>
              )
            })}
          </div>
            }
            panel={
          <div className="image-folder-expanded-content">
            <StackHeader
              item={item}
              title={t('count.files', { count })}
              isHorizontal={isHorizontal}
              onCollapse={onCollapse}
              onCopy={onCopy}
              onRemove={onRemove}
            />
            <StackItems entries={fileStackEntries(item, t)} isHorizontal={isHorizontal} onDragStart={onDragStart} />
          </div>
            }
          />
        )}
      </div>

      {/* Solid Black Folder Flap */}
      {(!expanded || !isStack) && (
        <div className="image-folder-flap-wrap">
          <svg 
            className="image-folder-flap-svg" 
            viewBox="0 0 240 74" 
            preserveAspectRatio="none"
          >
            <path 
              d="M 0,74 L 0,6 Q 0,0 6,0 L 64,0 C 74,0 80,6 85,12 C 90,18 96,24 106,24 L 234,24 Q 240,24 240,30 L 240,74 Z" 
            />
          </svg>

          <div className="image-folder-flap-content">
            {/* Elevated Tab Area: shows type badge (pdf, folder, doc, 3 files, etc.) */}
            <div className="image-folder-flap-header">
              <span className="kind-badge file-elevated-badge" style={{ color: badgeColor }}>
                {label}
              </span>
            </div>

            {/* Flap Footer: Left side shows file name, Right side shows relative time */}
            <div className="image-folder-flap-footer">
              <div className="image-folder-meta">
                {item.note ? (
                  <span className="image-folder-source-name meta-label" title={`${item.note} · ${rawName}`}>
                    {item.note}
                  </span>
                ) : (
                  <span className="image-folder-source-name file-name-meta" title={rawName}>
                    {rawName}
                  </span>
                )}
                {item.hitCount > 1 && (
                  <span className="meta-hit-count" title={t('count.copiedTimes', { count: item.hitCount })}>
                    · ×{item.hitCount}
                  </span>
                )}
                {copied && <span className="meta-copied">· {t('item.copied')}</span>}
              </div>
              <RelativeTime capturedAt={item.capturedAt} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Preview                                                             */
/* ------------------------------------------------------------------ */

function Preview({ item }: { item: ClipboardItemDto }) {
  switch (item.data.kind) {
    case 'text': {
      if (item.data.isUrl) {
        return <LinkPreviewCard url={item.data.text} pageTitle={item.data.linkTitle} />
      }
      const colorInfo = parseColor(item.data.text)
      if (colorInfo) {
        return (
          <div className="color-swatch-content">
            <div className="color-swatch-code">{colorInfo.displayText}</div>
          </div>
        )
      }
      const codeInfo = detectCode(item.data.text)
      if (codeInfo.isCode) {
        return (
          <div className="code-card-preview">
            <CodeBlock
              code={item.data.text}
              language={codeInfo.language}
              showFrame={false}
              showHeader={false}
              showLineNumbers={true}
              showCopyButton={false}
              compact={true}
              maxLines={5}
            />
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
      // Non-image single file — show hero icon on top in viewport
      const info = getFileKind(first, entry?.isDirectory)
      return (
        <div className="single-file-preview">
          <div className="file-card-viewport">
            <div className="single-file-hero" style={{ color: info.color }}>
              <FileKindIcon path={first} isDirectory={entry?.isDirectory} width={154} height={154} />
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
        return <span className="kind-badge url">{t('badge.links')}</span>
      if (item.data.isColor || parseColor(item.data.text))
        return <span className="kind-badge color">{t('badge.color')}</span>
      return <span className="kind-badge">{t('badge.text')}</span>
    case 'image':
      return (
        <span className="kind-badge">
          {t('badge.image')}
        </span>
      )
    case 'image-collection':
      return (
        <span className="kind-badge">
          {t('count.images', { count: item.data.images.length })}
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
            {t('badge.image')}
          </span>
        )
      }
      const label = count > 1 ? t('count.files', { count }) : kindBadge(info.kind)
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
        // same readable host as the card (cached parse, international names decoded)
        const domain = localizeLinkInfo(parseUrlPreview(item.data.text)).domain
        if (domain) {
          return <span className="meta-detail">· {domain}</span>
        }
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
      const paths = item.data.paths
      const count = paths.length
      if (count === 1) {
        const first = paths[0]
        const rawName = entries?.[0]?.name ?? basename(first)
        const size = entries?.[0]?.size
        return (
          <>
            <span className="meta-detail file-name-meta" title={rawName}>· {rawName}</span>
            {size && size > 0 && <span className="meta-detail">· {formatBytes(size)}</span>}
          </>
        )
      }
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
      itemRenderKey(prev) === itemRenderKey(next)
    )
  }
)
