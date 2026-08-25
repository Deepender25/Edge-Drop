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
import { memo, useState, useCallback, useEffect, forwardRef, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { ClipboardItemDto } from '../../shared/types'
import { MAX_STACK } from '../../shared/types'
import type { DragRequest } from '../../shared/types'
import { useStore } from '../store/appStore'
import { useDragOut } from '../hooks/useDragOut'
import { useRelativeTimeTick } from '../hooks/useRelativeTimeTick'
import { itemRenderKey } from '../lib/itemSignature'
import { basename, formatBytes, previewText, relativeTime, formatImageDisplayName } from '../lib/format'
import { getFileKind } from '../lib/fileType'
import { playButtonClickSound, playToggleSound, playDeleteSound, playCardExpandSound } from '../lib/soundEffects'
import { CopyIcon, FileKindIcon, FileStackPhoto, GlobeIcon, PinIcon, PinFillIcon, TrashIcon, MinusIcon, ChevronUpIcon, ExpandIcon, ContractIcon, ExternalLinkIcon } from './icons'
import { parseUrlPreview } from '../lib/urlPreview'
import '../styles/item.css'

import { tryPaste } from '../lib/tryPaste'
import { useTranslation, t } from '../i18n'

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

  // Accordion expansion: ONE stack open at a time, coordinated store-wide
  // (expanding another stack collapses this one; Escape / outside click /
  // filter or settings switches collapse via the same store field).
  const expandedStackId = useStore((s) => s.expandedStackId)
  const expanded = expandedStackId === item.id
  const setExpandedFlag = useCallback((v: boolean) => {
    useStore.getState().setExpandedStackId(v ? item.id : null)
  }, [item.id])

  // Shared clock: one refcounted interval refreshes every mounted card's
  // relative-time label in a single batched pass (replaces the per-card
  // setInterval, which scaled terribly across hundreds of cards).
  useRelativeTimeTick()

  const isPreviewing = useStore((s) => s.previewItemId) === item.id
  const isBundle = (item.data.kind === 'files' && item.data.paths.length > 1) || item.data.kind === 'image-collection'

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
      startDrag(req)
      setInternalDragReq(req)
    }
  }, [item.data, startDrag, setInternalDragReq])

  const handlePrestage = useCallback(() => {
    if (item.data.kind !== 'text' && !isPreviewing) {
      window.edge.prestageDrag({ id: item.id })
    }
  }, [item.data.kind, isPreviewing, item.id])

  return (
    <motion.div
      ref={ref}
      layout="position"
      layoutId={`ed-card-${item.id}`}
      initial={false}
      animate={{ opacity: 1 }}
      transition={{ layout: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } }}
      className={`item${item.pinned ? ' pinned' : ''}${isBundle ? ' bundle' : ''}`}
      data-expanded-stack={expanded ? 'true' : undefined}
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
            background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.08) 45%, transparent 75%)',
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
        onPointerDown={handlePrestage}
        onDragStart={(e) => handleDragStart(e, { id: item.id })}
        onDragEnd={() => setInternalDragReq(null)}
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
            // If they drop an entire item or a subitem onto another item, we merge them.
            // Currently our merge logic merges the entire source item. 
            // In the future we might want to merge just the subitem.
            window.edge.mergeItems(activeDrag.id, item.id)
            setInternalDragReq(null)
          } else if (activeDrag && activeDrag.id === item.id) {
            e.preventDefault()
            e.stopPropagation()
            setInternalDragReq(null)
          }
        }}
        onClick={isPreviewing ? undefined : (isBundle && !expanded ? onExpand : (!isBundle ? onPaste : undefined))}
      >
        <div className="body">
          {isBundle ? (
              <BundleFluidPreview 
                item={item} 
                expanded={expanded} 
                onDragStart={handleDragStart} 
                onCopy={onCopy} 
                onRemove={() => remove(item.id)} 
                onCollapse={onCollapse}
              />
          ) : (
            <Preview item={item} />
          )}
          <div className="meta">
            <KindBadge item={item} />
            <span>{relativeTime(item.capturedAt)}</span>
            {item.hitCount > 1 && <span>· ×{item.hitCount}</span>}
            {item.data.kind === 'image' && (
              <span>
                · {item.data.width}×{item.data.height}
              </span>
            )}
            {item.data.kind === 'image' && <span>· {formatBytes(item.data.bytes)}</span>}
            {copied && <span style={{ color: '#fff' }}>· copied</span>}
          </div>
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
              const rectData = rect ? { y: rect.y, height: rect.height } : undefined
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

function BundleFluidPreview({
  item,
  expanded,
  onDragStart,
  onCopy,
  onRemove,
  onCollapse,
}: {
  item: ClipboardItemDto
  expanded: boolean
  onDragStart: (e: React.DragEvent, req: DragRequest) => void
  onCopy: (e: React.MouseEvent) => void
  onRemove: () => void
  onCollapse: (e?: React.MouseEvent) => void
}) {
  if (item.data.kind === 'image-collection') {
    const more = item.data.images.length - 1
    return (
      <BundleExpandShell
        expanded={expanded}
        stack={
          <>
            <div className="bundle-stack-large">
              {/* Photo stacks wear the same fixed-shape folder tile as file
                  stacks (FileStackPhoto masks each preview into the SVG
                  silhouette), fanned with the same CENTER-symmetric spread
                  math as the files branch so larger stacks stay inside the
                  container instead of clipping at the card edge. */}
              {item.data.images.slice(0, 4).map((img, pathIndex) => ({ img, pathIndex })).reverse().map(({ img }, idx, arr) => {
                const realIndex = arr.length - 1 - idx
                const spread = arr.length > 1 ? 22 : 0
                const rotSpread = arr.length > 1 ? 9 : 0
                const centerOffset = ((arr.length - 1) * spread) / 2
                const centerRot = ((arr.length - 1) * rotSpread) / 2
                const stackMotion = {
                  x: realIndex * spread - centerOffset,
                  y: realIndex * 5,
                  rotate: realIndex * rotSpread - centerRot,
                  scale: 1 - realIndex * 0.05
                }
                return (
                  <motion.div
                    key={img.imageId}
                    className="bundle-stack-icon-item"
                    animate={stackMotion}
                    style={{ zIndex: 10 - realIndex }}
                  >
                    <FileStackPhoto src={img.preview} width={154} height={154} />
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
    return (
      <BundleExpandShell
        expanded={expanded}
        stack={
          <>
            <div className="bundle-stack-large">
              {paths.slice(0, 4).map((filePath, i) => ({ filePath, pathIndex: i })).reverse().map(({ filePath, pathIndex }, idx, arr) => {
                const realIndex = arr.length - 1 - idx
                const entry = entries?.[pathIndex]
                const isImg = !!(entry?.isImage && entry.preview)
                const spread = arr.length > 1 ? 22 : 0
                const rotSpread = arr.length > 1 ? 9 : 0
                const centerOffset = ((arr.length - 1) * spread) / 2
                const centerRot = ((arr.length - 1) * rotSpread) / 2
                const stackMotion = {
                  x: realIndex * spread - centerOffset,
                  y: realIndex * 5,
                  rotate: realIndex * rotSpread - centerRot,
                  scale: 1 - realIndex * 0.05
                }

                // Single unified tile path: photos wear the folder-silhouette
                // mask (FileStackPhoto), everything else wears its category's
                // pastel SVG icon — identical geometry for every stack size.
                // GIF thumbs 415 in the bounded endpoint, so tiles fall back to
                // streaming the original file (animated) on load failure.
                return (
                  <motion.div
                    key={`${item.id}-${pathIndex}`}
                    className="bundle-stack-icon-item"
                    animate={stackMotion}
                    style={{ zIndex: 10 - realIndex }}
                  >
                    {isImg ? (
                      <FileStackPhoto
                        src={entry.preview!}
                        width={154}
                        height={154}
                        fallbackSrc={fileStreamUrl(filePath)}
                      />
                    ) : (
                      <FileKindIcon path={filePath} width={154} height={154} isDirectory={entry?.isDirectory} />
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
                      <FileKindIcon path={filePath} width={48} height={48} isDirectory={entry?.isDirectory} />
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
                      onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); window.edge.copySubitem({ id: item.id, paths: [filePath] }); }}
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
    case 'text':
      if (item.data.isUrl) {
        const info = parseUrlPreview(item.data.text)
        return (
          <div className="link-preview-card">
            <div className="link-preview-header">
              <div className="link-brand-pill">
                <GlobeIcon width={12} height={12} style={{ color: 'rgba(255, 255, 255, 0.75)', flexShrink: 0 }} />
                <span className="link-service">{info.serviceName}</span>
                <span className="link-dot">·</span>
                <span className="link-domain">{info.domain}</span>
              </div>
            </div>
            {info.title && <div className="link-title">{info.title}</div>}
            <div className="preview single link-url">{item.data.text}</div>
          </div>
        )
      }
      return <div className="preview">{previewText(item.data.text)}</div>

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
                <div className="preview">[image: {displayName}]</div>
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
      // Non-image single file — show big hero icon on top, and name + meta on the bottom!
      const info = getFileKind(first, entry?.isDirectory)
      return (
        <div className="single-file-preview">
          <div className="single-file-hero" style={{ color: info.color }}>
            <FileKindIcon path={first} width={136} height={136} isDirectory={entry?.isDirectory} />
          </div>
          <div className="single-file-meta">
            <div className="preview single single-file-name" title={displayName}>
              {displayName}
            </div>
            <div className="single-file-sub">
              {info.label}{!entry?.isDirectory && entry && entry.size > 0 ? ` · ${formatBytes(entry.size)}` : ''}
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
