/**
 * ClipboardItem — a single history/shelf entry.
 *
 * Interactions:
 *   - Double-click body   -> copy item back to clipboard
 *   - Drag the tile       -> native OS drag-out (via useDragOut)
 *   - File bundle: click body -> expand/collapse
 *   - Drag collapsed bundle -> drag all files as one entity
 *   - Drag expanded sub-row  -> drag just that one file
 *   - Pin / Delete           -> quick actions on hover
 *   - Copy button (⧉)      -> single-click copy (explicit affordance)
 *
 * Visual: a raised dark tile. Image items show a thumbnail; text items show a
 * clamped preview; file items list names or bundle badge. Motion is handled by
 * the parent list (layout/AnimatePresence), so this component stays presentational.
 */
import { memo, useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ClipboardItemDto } from '../../shared/types'
import type { DragRequest } from '../../shared/types'
import { useStore } from '../store/appStore'
import { useDragOut } from '../hooks/useDragOut'
import { basename, formatBytes, previewText, relativeTime } from '../lib/format'
import { CopyIcon, FileIcon, ImageIcon, LinkIcon, PinIcon, TrashIcon, MinusIcon, ChevronUpIcon } from './icons'
import '../styles/item.css'

interface Props {
  item: ClipboardItemDto
}

/* ------------------------------------------------------------------ */
/* Main item card                                                      */
/* ------------------------------------------------------------------ */

function ClipboardItemBase({ item }: Props) {
  const copy = useStore((s) => s.copy)
  const togglePin = useStore((s) => s.togglePin)
  const remove = useStore((s) => s.remove)
  const setInternalDragReq = useStore((s) => s.setInternalDragReq)
  const internalDragReq = useStore((s) => s.internalDragReq)
  const startDrag = useDragOut()
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  
  const open = useStore((s) => s.open)
  useEffect(() => {
    if (!open) setExpanded(false)
  }, [open])

  const isBundle = (item.data.kind === 'files' && item.data.paths.length > 1) || item.data.kind === 'image-collection'

  const onDoubleClick = useCallback(() => {
    copy(item.id)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 900)
  }, [copy, item.id])

  const onCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    copy(item.id)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 900)
  }, [copy, item.id])

  const onExpand = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (isBundle) setExpanded(true)
  }, [isBundle])

  const onCollapse = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    setExpanded(false)
  }, [])

  const handleDragStart = useCallback((e: React.DragEvent, req: DragRequest) => {
    if (item.data.kind === 'text') {
      // Native HTML5 drag handles text perfectly and gives us a ghost image.
      // We ONLY set text/plain so that target applications (like browsers or Word)
      // treat the drop as pure text insertion rather than rendering a rich HTML block.
      e.dataTransfer.setData('text/plain', item.data.text)
      e.dataTransfer.effectAllowed = 'copy'
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
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.14 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      className={`item${item.pinned ? ' pinned' : ''}${isBundle ? ' bundle' : ''}`}
    >
      <div
        className="item-main"
        data-id={item.id}
        draggable={!isBundle || !expanded}
        onDragStart={(e) => handleDragStart(e, { id: item.id })}
        onDragEnd={() => setInternalDragReq(null)}
        onDragOver={(e) => {
          if (internalDragReq && internalDragReq.id !== item.id) {
            e.preventDefault()
          }
        }}
        onDrop={(e) => {
          if (internalDragReq && internalDragReq.id !== item.id) {
            e.preventDefault()
            e.stopPropagation()
            // If they drop an entire item or a subitem onto another item, we merge them.
            // Currently our merge logic merges the entire source item. 
            // In the future we might want to merge just the subitem.
            window.edge.mergeItems(internalDragReq.id, item.id)
            setInternalDragReq(null)
          }
        }}
        onDoubleClick={!isBundle ? onDoubleClick : undefined}
        onClick={isBundle && !expanded ? onExpand : undefined}
        title={isBundle ? (expanded ? '' : 'Click to expand, drag to drop all files') : 'Double-click to copy, drag to any app'}
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
            onClick={() => togglePin(item.id, !item.pinned)}
          >
            <PinIcon />
          </button>
          <button className="act" title="Copy" onClick={onCopy}>
            <CopyIcon />
          </button>
          <button
            className="act danger"
            title="Delete"
            onClick={() => remove(item.id)}
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </motion.div>
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
      <motion.div layout className="fluid-bundle" transition={{ type: 'spring', stiffness: 400, damping: 35 }}>
        <AnimatePresence initial={false} mode="popLayout">
          {expanded ? (
            <motion.div key="expanded" layout className="fluid-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
                    <PinIcon />
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
                  draggable
                  onDragStartCapture={(e: any) => { e.stopPropagation(); onDragStart(e, { id: item.id, imageId: img.imageId }) }}
                  onClick={(e) => e.stopPropagation()}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1, zIndex: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.img
                    layoutId={`img-${item.id}-${img.imageId}`}
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
            <motion.div key="collapsed" layout style={{ width: '100%' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="bundle-stack-large">
                {item.data.images.slice(0, 4).reverse().map((img, idx, arr) => {
                  const realIndex = arr.length - 1 - idx
                  return (
                    <motion.img
                      layoutId={`img-${item.id}-${img.imageId}`}
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
      </motion.div>
    )
  }

  if (item.data.kind === 'files') {
    const more = item.data.paths.length - 1
    return (
      <motion.div layout className="fluid-bundle" transition={{ type: 'spring', stiffness: 400, damping: 35 }}>
        <AnimatePresence initial={false} mode="popLayout">
          {expanded ? (
            <motion.div key="expanded" layout className="fluid-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
                  <button className="act" title="Copy all" onClick={(e) => { e.stopPropagation(); onCopy(e); }}>
                    <CopyIcon />
                  </button>
                  <button className="act danger" title="Delete bundle" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
                    <TrashIcon />
                  </button>
                </div>
              </div>
              {item.data.paths.map((filePath, idx) => (
                <motion.div
                  key={`${item.id}-${idx}`}
                  className="fluid-list-row"
                  draggable
                  onDragStartCapture={(e: any) => { e.stopPropagation(); onDragStart(e, { id: item.id, paths: [filePath] }) }}
                  onClick={(e) => e.stopPropagation()}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1, zIndex: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="fluid-list-icon">
                    <FileIcon width={16} height={16} />
                  </div>
                  <div className="fluid-list-text">{filePath.split(/[\\/]/).pop()}</div>
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
              ))}
            </motion.div>
          ) : (
            <motion.div key="collapsed" layout style={{ width: '100%' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="bundle-stack-files">
                {item.data.paths.slice(0, 4).reverse().map((filePath, idx, arr) => {
                  const realIndex = arr.length - 1 - idx
                  return (
                    <motion.div
                      layoutId={`file-${item.id}-${idx}`}
                      key={`${item.id}-${idx}`}
                      className="bundle-stack-file"
                      animate={{ 
                        x: realIndex * 8, 
                        y: realIndex * 6, 
                        scale: 1 - realIndex * 0.05 
                      }}
                      style={{ zIndex: 10 - realIndex }}
                    >
                      <div className="icon">
                        <FileIcon width={14} height={14} />
                      </div>
                      <span className="name">{filePath.split(/[\\/]/).pop()}</span>
                    </motion.div>
                  )
                })}
              </div>
              {more > 0 && <div className="bundle-more-label">+{more} more file{more > 1 ? 's' : ''}</div>}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
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
      // Single file — show image thumbnail if available, else just the name.
      if (item.data.previews && item.data.previews[0]) {
        return (
          <div className="thumb-wrap">
            <img
              className="thumb"
              src={item.data.previews[0]}
              alt=""
              draggable={false}
            />
            <div className="preview single" title={item.data.paths[0]}>
              {basename(first)}
            </div>
          </div>
        )
      }
      return (
        <div className="preview single" title={item.data.paths.join('\n')}>
          {basename(first)}
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
    case 'files':
      return (
        <span className="kind-badge">
          <FileIcon width={11} height={11} />
          {item.data.paths.length > 1 ? `${item.data.paths.length} files` : 'file'}
        </span>
      )
  }
}

export const ClipboardItemCard = memo(ClipboardItemBase)
