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
import { memo, useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ClipboardItemDto } from '../../shared/types'
import { MAX_STACK } from '../../shared/types'
import type { DragRequest } from '../../shared/types'
import { useStore } from '../store/appStore'
import { useDragOut } from '../hooks/useDragOut'
import { basename, formatBytes, previewText, relativeTime } from '../lib/format'
import { getFileKind } from '../lib/fileType'
import { CopyIcon, FileKindIcon, ImageIcon, LinkIcon, PinIcon, PinFillIcon, TrashIcon, MinusIcon, ChevronUpIcon, ExpandIcon, ContractIcon } from './icons'
import '../styles/item.css'

/**
 * Module-level paste guard — shared across ALL item instances.
 * Tracks the timestamp of the last paste so that any subsequent click
 * (including the second click of a double-click) within PASTE_COOLDOWN ms
 * is silently dropped. This is the only reliable way to prevent double-paste:
 * it is synchronous, stateless across renders, and immune to async IPC races.
 */
let _lastPasteAt = 0
const PASTE_COOLDOWN = 600 // ms

function tryPaste(fn: () => void): void {
  const now = Date.now()
  if (now - _lastPasteAt < PASTE_COOLDOWN) return
  _lastPasteAt = now
  fn()
}

interface Props {
  item: ClipboardItemDto
}





/* ------------------------------------------------------------------ */
/* Main item card                                                      */
/* ------------------------------------------------------------------ */

function ClipboardItemBase({ item }: Props) {
  const copy = useStore.getState().copy
  const paste = useStore.getState().paste
  const togglePin = useStore.getState().togglePin
  const remove = useStore.getState().remove
  const setInternalDragReq = useStore.getState().setInternalDragReq
  const startDrag = useDragOut()
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)

  
  const open = useStore((s) => s.open)
  useEffect(() => {
    if (!open) setExpanded(false)
  }, [open])

  const isPreviewing = useStore((s) => s.previewItemId) === item.id
  const isBundle = (item.data.kind === 'files' && item.data.paths.length > 1) || item.data.kind === 'image-collection'

  const onCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
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
      setExpanded(true)
      if (useStore.getState().tutorialStep === 4 && item.id === 'onboarding-files') {
        useStore.getState().setTutorialStep(5)
      }
    }
  }, [isBundle, item.id])

  const onCollapse = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    setExpanded(false)
  }, [])

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
      setInternalDragReq(req)
      e.preventDefault()
      startDrag(req)
    }
  }, [item.data, startDrag, setInternalDragReq])

  return (
    <motion.div
      layout
      initial={open ? { opacity: 0, y: 8, scale: 0.98 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.14 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      className={`item${item.pinned ? ' pinned' : ''}${isBundle ? ' bundle' : ''}`}
    >
      <div
        className={`item-main${isPreviewing ? ' force-actions previewing' : ''}`}
        data-id={item.id}
        draggable={item.data.kind !== 'text' && (!isBundle || !expanded)}
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
        onClick={isBundle && !expanded ? onExpand : (!isBundle ? onPaste : undefined)}
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
          onClick={(e) => e.stopPropagation()} 
          style={{ display: isBundle && expanded ? 'none' : undefined }}
        >
          <button
            className={`act${item.pinned ? ' active' : ''}`}
            title={item.pinned ? 'Unpin' : 'Pin'}
            onClick={(e) => {
              e.currentTarget.blur()
              togglePin(item.id, !item.pinned)
            }}
          >
            {item.pinned ? <PinFillIcon /> : <PinIcon />}
          </button>
          <button className="act" title="Copy" onClick={(e) => {
            e.currentTarget.blur()
            onCopy(e)
          }}>
            <CopyIcon />
          </button>
          <button
            className={`act${isPreviewing ? ' preview-contract active' : ' preview-expand'}`}
            title={isPreviewing ? 'Close Preview' : 'Expand Preview'}
            onClick={(e) => {
              e.stopPropagation()
              e.currentTarget.blur()
              const rect = e.currentTarget.closest('.item-main')?.getBoundingClientRect()
              const rectData = rect ? { y: rect.y, height: rect.height } : undefined
              useStore.getState().setPreviewItemId(isPreviewing ? null : item.id, rectData)
            }}
          >
            {isPreviewing ? <ContractIcon /> : <ExpandIcon />}
          </button>
          <button
            className="act danger"
            title="Delete"
            onClick={(e) => {
              e.currentTarget.blur()
              remove(item.id)
            }}
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

const containerVariants = {
  hidden: { opacity: 0, filter: 'blur(6px)' },
  visible: { 
    opacity: 1, 
    filter: 'blur(0px)',
    transition: { 
      opacity: { duration: 0.22, ease: 'easeOut' },
      filter: { duration: 0.22, ease: 'easeOut' },
      staggerChildren: 0.05,
      delayChildren: 0.02
    }
  },
  exit: { 
    opacity: 0, 
    filter: 'blur(6px)',
    transition: { 
      opacity: { duration: 0.16, ease: 'easeIn' },
      filter: { duration: 0.16, ease: 'easeIn' },
      staggerChildren: 0.03,
      staggerDirection: -1
    }
  }
};

const rowVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.97, filter: 'blur(4px)' },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    filter: 'blur(0px)',
    transition: { 
      y: { type: 'spring', stiffness: 420, damping: 28 },
      scale: { type: 'spring', stiffness: 420, damping: 28 },
      opacity: { duration: 0.2, ease: 'easeOut' },
      filter: { duration: 0.2, ease: 'easeOut' }
    }
  },
  exit: { 
    opacity: 0, 
    y: -8, 
    scale: 0.97,
    filter: 'blur(4px)',
    transition: { 
      y: { duration: 0.14, ease: 'easeIn' },
      scale: { duration: 0.14, ease: 'easeIn' },
      opacity: { duration: 0.14, ease: 'easeIn' },
      filter: { duration: 0.14, ease: 'easeIn' }
    }
  }
};

const stackVariants = {
  hidden: { opacity: 0, filter: 'blur(5px)', scale: 0.96 },
  visible: { 
    opacity: 1, 
    filter: 'blur(0px)', 
    scale: 1,
    transition: { 
      scale: { type: 'spring', stiffness: 420, damping: 28 },
      opacity: { duration: 0.2, ease: 'easeOut' },
      filter: { duration: 0.2, ease: 'easeOut' }
    }
  },
  exit: { 
    opacity: 0, 
    filter: 'blur(5px)', 
    scale: 0.96,
    transition: { 
      scale: { duration: 0.16, ease: 'easeIn' },
      opacity: { duration: 0.16, ease: 'easeIn' },
      filter: { duration: 0.16, ease: 'easeIn' }
    }
  }
};

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
      <div className="fluid-bundle">
        <AnimatePresence initial={false} mode="wait">
          {expanded ? (
            <motion.div
              key="expanded"
              className="fluid-list"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="bundle-actions">
                <div 
                  className="bundle-collapse-zone" 
                  title="Collapse collection"
                  onClick={(e) => { e.stopPropagation(); onCollapse(e); }}
                >
                  <button className="act bundle-collapse-btn">
                    <ChevronUpIcon />
                  </button>
                </div>
                <div className="actions-pill">
                  <button
                    className={`act${item.pinned ? ' active' : ''}`}
                    title={item.pinned ? 'Unpin' : 'Pin'}
                    onClick={(e) => { e.stopPropagation(); useStore.getState().togglePin(item.id, !item.pinned); }}
                  >
                    {item.pinned ? <PinFillIcon /> : <PinIcon />}
                  </button>
                  <button className="act" title="Copy all" onClick={(e) => { e.stopPropagation(); onCopy(e); }}>
                    <CopyIcon />
                  </button>
                  <button className="act danger" title="Delete bundle" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
                    <TrashIcon />
                  </button>
                </div>
              </div>
              {item.data.images.map((img) => (
                <motion.div
                  key={img.imageId}
                  className="fluid-list-row"
                  variants={rowVariants}
                  draggable
                  onDragStartCapture={(e: any) => { e.stopPropagation(); onDragStart(e, { id: item.id, imageId: img.imageId }) }}
                  onClick={(e) => { e.stopPropagation(); tryPaste(() => window.edge.pasteSubitem({ id: item.id, imageId: img.imageId })) }}
                >
                  <motion.img
                    src={img.preview}
                    style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 4, background: 'rgba(0,0,0,0.5)' }}
                    draggable={false}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }}>
                       Image • {img.width} × {img.height}
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                      {formatBytes(img.bytes)}
                    </span>
                  </div>
                  <button
                    className="act subitem-delete-btn"
                    title="Ungroup image from collection"
                    onClick={(e) => { e.stopPropagation(); window.edge.splitItem({ id: item.id, imageId: img.imageId, splitPlacement: 'after' }); }}
                    style={{ width: 24, height: 24 }}
                  >
                    <MinusIcon width={12} height={12} />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              style={{ width: '100%' }}
              variants={stackVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="bundle-stack-large">
                {item.data.images.slice(0, 4).reverse().map((img, idx, arr) => {
                  const realIndex = arr.length - 1 - idx
                  return (
                    <motion.img
                      key={img.imageId}
                      src={img.preview}
                      className="bundle-stack-card"
                      animate={{ 
                        x: realIndex * 20 - 20, 
                        y: realIndex * 6, 
                        rotate: realIndex * 6 - 6, 
                        scale: 1 - realIndex * 0.05 
                      }}
                      style={{ zIndex: 10 - realIndex }}
                      draggable={false}
                      initial={{ borderRadius: 8 }}
                    />
                  )
                })}
              </div>
              {more > 0 && <div className="bundle-more-label">+{more} more image{more > 1 ? 's' : ''}</div>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  if (item.data.kind === 'files') {
    const entries = item.data.entries
    const paths = item.data.paths
    const count = paths.length
    return (
      <div className="fluid-bundle">
        <AnimatePresence initial={false} mode="wait">
          {expanded ? (
            <motion.div
              key="expanded"
              className="fluid-list"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="bundle-actions">
                <div
                  className="bundle-collapse-zone"
                  title="Collapse collection"
                  onClick={(e) => { e.stopPropagation(); onCollapse(e); }}
                >
                  <button className="act bundle-collapse-btn">
                    <ChevronUpIcon />
                  </button>
                </div>
                <div className="bundle-capacity">
                  {count} / {MAX_STACK}
                </div>
                <div className="actions-pill">
                  <button className="act" title="Copy all" onClick={(e) => { e.stopPropagation(); onCopy(e); }}>
                    <CopyIcon />
                  </button>
                  <button className="act danger" title="Delete bundle" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
                    <TrashIcon />
                  </button>
                </div>
              </div>
              {paths.map((filePath, idx) => {
                const entry = entries?.[idx]
                const name = entry?.name ?? basename(filePath)
                const size = entry?.size ?? 0
                return (
                  <motion.div
                    key={`${item.id}-${idx}`}
                    className="fluid-list-row"
                    variants={rowVariants}
                    draggable
                    onDragStartCapture={(e: any) => { e.stopPropagation(); onDragStart(e, { id: item.id, paths: [filePath] }) }}
                    onClick={(e) => { e.stopPropagation(); tryPaste(() => window.edge.pasteSubitem({ id: item.id, paths: [filePath] })) }}
                  >
                    {entry?.isImage && entry.preview ? (
                      <div className="fluid-list-icon" style={{ overflow: 'hidden', padding: 0 }}>
                        <img 
                          src={entry.preview} 
                          alt="" 
                          draggable={false} 
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} 
                        />
                      </div>
                    ) : (
                      <div className="fluid-list-icon" style={{ color: getFileKind(filePath).color }}>
                        <FileKindIcon path={filePath} width={16} height={16} />
                      </div>
                    )}
                    <div className="fluid-list-text-wrap">
                      <div className="fluid-list-text">{name}</div>
                      {size > 0 && <div className="fluid-list-sub">{formatBytes(size)}</div>}
                    </div>
                    <button
                      className="act subitem-copy-btn"
                      title="Copy file path"
                      onClick={(e) => { e.stopPropagation(); window.edge.copySubitem({ id: item.id, paths: [filePath] }); }}
                      style={{ width: 24, height: 24 }}
                    >
                      <CopyIcon width={12} height={12} />
                    </button>
                    <button
                      className="act subitem-delete-btn"
                      title="Ungroup file from collection"
                      onClick={(e) => { e.stopPropagation(); window.edge.splitItem({ id: item.id, paths: [filePath], splitPlacement: 'after' }); }}
                      style={{ width: 24, height: 24 }}
                    >
                      <MinusIcon width={12} height={12} />
                    </button>
                  </motion.div>
                )
              })}
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              style={{ width: '100%' }}
              variants={stackVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="bundle-stack-large">
                {paths.slice(0, 4).map((filePath, i) => ({ filePath, pathIndex: i })).reverse().map(({ filePath, pathIndex }, idx, arr) => {
                  const realIndex = arr.length - 1 - idx
                  const entry = entries?.[pathIndex]
                  return (
                    <motion.div
                      key={`${item.id}-${pathIndex}`}
                      className="bundle-stack-card bundle-file-stack-card"
                      animate={{
                        x: realIndex * 20 - 20,
                        y: realIndex * 6,
                        rotate: realIndex * 6 - 6,
                        scale: 1 - realIndex * 0.05
                      }}
                      style={{ zIndex: 10 - realIndex }}
                      initial={{ borderRadius: 8 }}
                    >
                      {entry?.isImage && entry.preview ? (
                        <img 
                          src={entry.preview} 
                          alt="" 
                          draggable={false} 
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} 
                        />
                      ) : (
                        <div style={{ color: getFileKind(filePath).color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FileKindIcon path={filePath} width={40} height={40} />
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </div>
              {count > 1 ? (
                <div className="bundle-more-label">+{count - 1} more file{count - 1 > 1 ? 's' : ''}</div>
              ) : (
                <div className="bundle-more-label">1 file</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
        return (
          <>
            <div className="preview single">{item.data.text}</div>
          </>
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
              draggable={false}
            />
          ) : (
            <div className="preview">[image]</div>
          )}
        </div>
      )

    case 'files': {
      const first = item.data.paths[0]
      const entry = item.data.entries?.[0]
      const name = entry?.name ?? basename(first)
      const isImage = entry?.isImage || getFileKind(first).kind === 'image'

      // Single image file — show its thumbnail.
      if (item.data.paths.length === 1 && isImage) {
        return (
          <div className="thumb-wrap">
            {entry?.preview ? (
              <img
                className="thumb"
                src={entry.preview}
                alt=""
                draggable={false}
              />
            ) : (
              <div className="preview">[image: {name}]</div>
            )}
            <div className="preview single">
              {name}
            </div>
          </div>
        )
      }
      // Non-image single file — show a tinted type icon alongside its name.
      const info = getFileKind(first)
      return (
        <div className="single-file-preview">
          <div className="single-file-icon" style={{ color: info.color }}>
            <FileKindIcon path={first} width={28} height={28} />
          </div>
          <div className="single-file-meta">
            <div className="preview single">
              {name}
            </div>
            <div className="single-file-sub">
              {info.label}{entry && entry.size > 0 ? ` · ${formatBytes(entry.size)}` : ''}
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
        return (
          <span className="kind-badge url">
            <LinkIcon width={11} height={11} /> link
          </span>
        )
      return <span className="kind-badge">text</span>
    case 'image':
      return (
        <span className="kind-badge">
          <ImageIcon width={11} height={11} /> image
        </span>
      )
    case 'image-collection':
      return (
        <span className="kind-badge">
          <ImageIcon width={11} height={11} />
          {item.data.images.length} images
        </span>
      )
    case 'files': {
      const firstPath = item.data.paths[0]
      const info = getFileKind(firstPath)
      const count = item.data.paths.length
      const isImage = count === 1 && (item.data.entries?.[0]?.isImage || info.kind === 'image')
      if (isImage) {
        return (
          <span className="kind-badge">
            <ImageIcon width={11} height={11} /> image
          </span>
        )
      }
      const label = count > 1 ? `${count} files` : info.label.toLowerCase()
      return (
        <span className="kind-badge" style={{ color: count > 1 ? undefined : info.color }}>
          <FileKindIcon path={firstPath} width={11} height={11} />
          {label}
        </span>
      )
    }
  }
}

export const ClipboardItemCard = memo(ClipboardItemBase)
