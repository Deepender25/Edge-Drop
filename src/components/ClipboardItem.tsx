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
import { memo, useState, useCallback, useEffect, forwardRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ClipboardItemDto } from '../../shared/types'
import { MAX_STACK } from '../../shared/types'
import type { DragRequest } from '../../shared/types'
import { useStore } from '../store/appStore'
import { useDragOut } from '../hooks/useDragOut'
import { basename, formatBytes, previewText, relativeTime, formatImageDisplayName } from '../lib/format'
import { getFileKind } from '../lib/fileType'
import { playButtonClickSound, playToggleSound, playDeleteSound, playCardExpandSound } from '../lib/soundEffects'
import { CopyIcon, FileKindIcon, GlobeIcon, PinIcon, PinFillIcon, TrashIcon, MinusIcon, ChevronUpIcon, ExpandIcon, ContractIcon, ExternalLinkIcon } from './icons'
import { parseUrlPreview } from '../lib/urlPreview'
import '../styles/item.css'

import { tryPaste } from '../lib/tryPaste'
import { useTranslation, t } from '../i18n'

interface Props {
  item: ClipboardItemDto
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
  const [expanded, setExpanded] = useState(false)

  
  const open = useStore((s) => s.open)
  const [, setTimeTick] = useState(0)

  useEffect(() => {
    if (!open) {
      setExpanded(false)
      return
    }
    const timer = window.setInterval(() => setTimeTick((n) => n + 1), 30000)
    return () => window.clearInterval(timer)
  }, [open])

  const isPreviewing = useStore((s) => s.previewItemId) === item.id
  const isBundle = (item.data.kind === 'files' && item.data.paths.length > 1) || item.data.kind === 'image-collection'

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
      setExpanded(true)
      if (useStore.getState().tutorialStep === 4 && item.id === 'onboarding-files') {
        useStore.getState().setTutorialStep(5)
      }
    }
  }, [isBundle, item.id])

  const onCollapse = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    playCardExpandSound(false)
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
      initial={open ? { opacity: 0, scale: 0.96, y: 6 } : false}
      animate={{ opacity: 1, scale: 1, y: 0, height: 'auto', marginBottom: undefined }}
      exit={{
        opacity: 0,
        height: 0,
        marginBottom: 0,
        scale: 0.95,
        y: -4,
        transition: {
          opacity: { duration: 0.12, ease: [0.32, 0, 0.67, 0] },
          height: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
          marginBottom: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
          scale: { duration: 0.14, ease: [0.32, 0, 0.67, 0] }
        }
      }}
      transition={{
        layout: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
        type: 'spring',
        stiffness: 360,
        damping: 28,
        mass: 0.6
      }}
      className={`item${item.pinned ? ' pinned' : ''}${isBundle ? ' bundle' : ''}`}
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

// Bundle expand/collapse — all blur removed; opacity+y+scale composite trivially.
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      opacity: { duration: 0.18, ease: 'easeOut' },
      staggerChildren: 0.04,
      delayChildren: 0.01
    }
  },
  exit: {
    opacity: 0,
    transition: {
      opacity: { duration: 0.12, ease: 'easeIn' },
      staggerChildren: 0.025,
      staggerDirection: -1
    }
  }
};

const rowVariants = {
  hidden: { opacity: 0, y: 8, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      y: { type: 'spring', stiffness: 500, damping: 38, mass: 0.6, restDelta: 0.001 },
      scale: { type: 'spring', stiffness: 500, damping: 38, mass: 0.6, restDelta: 0.001 },
      opacity: { duration: 0.16, ease: 'easeOut' }
    }
  },
  exit: {
    opacity: 0,
    y: -6,
    scale: 0.97,
    transition: {
      y: { duration: 0.1, ease: 'easeIn' },
      scale: { duration: 0.1, ease: 'easeIn' },
      opacity: { duration: 0.1, ease: 'easeIn' }
    }
  }
};

const stackVariants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      scale: { type: 'spring', stiffness: 480, damping: 38, mass: 0.6, restDelta: 0.001 },
      opacity: { duration: 0.18, ease: 'easeOut' }
    }
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: {
      scale: { duration: 0.12, ease: 'easeIn' },
      opacity: { duration: 0.12, ease: 'easeIn' }
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
                  title={t('item.collapsePinned')}
                  onClick={(e) => { e.stopPropagation(); onCollapse(e); }}
                >
                  <button className="act bundle-collapse-btn">
                    <ChevronUpIcon />
                  </button>
                </div>
                <div className="actions-pill">
                  <button
                    className={`act${item.pinned ? ' active' : ''}`}
                    title={item.pinned ? t('item.unpin') : t('item.pin')}
                    onClick={(e) => { e.stopPropagation(); useStore.getState().togglePin(item.id, !item.pinned); }}
                  >
                    {item.pinned ? <PinFillIcon /> : <PinIcon />}
                  </button>
                  <button className="act" title={t('item.copy')} onClick={(e) => { e.stopPropagation(); onCopy(e); }}>
                    <CopyIcon />
                  </button>
                  <button className="act danger" title={t('item.delete')} onClick={(e) => { e.stopPropagation(); onRemove(); }}>
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
                    loading="lazy"
                    decoding="async"
                    style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 4, background: 'rgba(0,0,0,0.5)' }}
                    draggable={false}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }}>
                       {t('item.imageItem')} • {img.width} × {img.height}
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                      {formatBytes(img.bytes)}
                    </span>
                  </div>
                  <button
                    className="act subitem-delete-btn"
                    title={t('item.ungroup')}
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
                      loading="lazy"
                      decoding="async"
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
              {more > 0 && <div className="bundle-more-label">{t('item.moreImages', { count: more })}</div>}
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
                  title={t('item.collapsePinned')}
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
                  <button className="act" title={t('item.copy')} onClick={(e) => { e.stopPropagation(); onCopy(e); }}>
                    <CopyIcon />
                  </button>
                  <button className="act danger" title={t('item.delete')} onClick={(e) => { e.stopPropagation(); onRemove(); }}>
                    <TrashIcon />
                  </button>
                </div>
              </div>
              {paths.map((filePath, index) => {
                const entry = entries?.[index]
                const name = formatImageDisplayName(entry?.name ?? filePath, item.capturedAt)
                const size = entry?.size ?? 0
                return (
                  <motion.div
                    key={`${item.id}-${filePath}-${index}`}
                    className="fluid-card-row"
                    layout
                    draggable
                    onMouseEnter={() => window.edge.prestageDrag({ id: item.id, paths: [filePath] })}
                    onPointerDown={() => window.edge.prestageDrag({ id: item.id, paths: [filePath] })}
                    onDragStartCapture={(e: any) => { e.stopPropagation(); onDragStart(e, { id: item.id, paths: [filePath] }) }}
                    onClick={(e) => { e.stopPropagation(); tryPaste(() => window.edge.pasteSubitem({ id: item.id, paths: [filePath] })) }}
                  >
                    <div className="fluid-row-icon">
                      {entry?.isImage && entry.preview ? (
                        <img 
                          src={entry.preview} 
                          alt="" 
                          loading="lazy"
                          decoding="async"
                          draggable={false} 
                          className="fluid-row-img"
                        />
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
                        onClick={(e) => { e.stopPropagation(); window.edge.copySubitem({ id: item.id, paths: [filePath] }); }}
                      >
                        <CopyIcon width={12} height={12} />
                      </button>
                      <button
                        className="act subitem-delete-btn"
                        title={t('item.ungroup')}
                        onClick={(e) => { e.stopPropagation(); window.edge.splitItem({ id: item.id, paths: [filePath], splitPlacement: 'after' }); }}
                      >
                        <MinusIcon width={12} height={12} />
                      </button>
                    </div>
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
                  const isImg = entry?.isImage && !!entry.preview
                  const spread = arr.length > 1 ? 22 : 0
                  const rotSpread = arr.length > 1 ? 9 : 0
                  const centerOffset = ((arr.length - 1) * spread) / 2
                  const centerRot = ((arr.length - 1) * rotSpread) / 2

                  return (
                    <motion.div
                      key={`${item.id}-${pathIndex}`}
                      className={isImg ? "bundle-stack-card" : "bundle-stack-icon-item"}
                      animate={{
                        x: realIndex * spread - centerOffset,
                        y: realIndex * 5,
                        rotate: realIndex * rotSpread - centerRot,
                        scale: 1 - realIndex * 0.05
                      }}
                      style={{ zIndex: 10 - realIndex }}
                    >
                      {isImg ? (
                        <img 
                          src={entry.preview} 
                          alt="" 
                          loading="lazy"
                          decoding="async"
                          draggable={false} 
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} 
                        />
                      ) : (
                        <FileKindIcon path={filePath} width={112} height={112} isDirectory={entry?.isDirectory} />
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

export const ClipboardItemCard = memo(ClipboardItemBase)
