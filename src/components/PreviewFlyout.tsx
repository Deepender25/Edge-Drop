import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/appStore'
import { formatBytes } from '../lib/format'
import { getFileKind } from '../lib/fileType'
import { FileKindIcon, FolderOpenIcon, CopyIcon, CheckIcon } from './icons'
import { createPortal } from 'react-dom'
import { useAdaptiveSpring } from '../hooks/useAdaptiveSpring'
import { useDragOut } from '../hooks/useDragOut'
import { tryPaste } from '../lib/tryPaste'

export function PreviewFlyout({ isRight }: { isRight: boolean }) {
  const previewItemId = useStore((s) => s.previewItemId)
  const items = useStore((s) => s.items)
  const previewItemRect = useStore((s) => s.previewItemRect)
  const settings = useStore((s) => s.settings)
  const adaptiveSpring = useAdaptiveSpring()
  
  const item = previewItemId ? items.find((i) => i.id === previewItemId) : null

  // The vertical center of the clicked item card, expressed as a % of the flyout height.
  // This anchors the transformOrigin so the flyout physically grows FROM and collapses
  // TO the exact item card — identical to macOS window minimize-to-dock.
  const originY = (() => {
    if (!previewItemRect) return '50%'
    const panelHeightPx = (settings.panelHeight || 0.6) * window.innerHeight
    const panelTop = (window.innerHeight - panelHeightPx) / 2
    const itemCenterY = previewItemRect.y + previewItemRect.height / 2
    const relY = itemCenterY - panelTop
    const pct = Math.max(0, Math.min(100, (relY / panelHeightPx) * 100))
    return `${pct}%`
  })()

  const maxFlyoutHeight = `calc(${(settings.panelHeight || 0.6) * 100}vh - 24px)`

  const [dragOver, setDragOver] = useState(false)
  const flyoutRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!item || !flyoutRef.current) {
      useStore.getState().setPreviewFlyoutRect(null)
      return
    }

    const updateRect = () => {
      if (flyoutRef.current) {
        const r = flyoutRef.current.getBoundingClientRect()
        useStore.getState().setPreviewFlyoutRect({ top: r.top, bottom: r.bottom })
      }
    }

    updateRect()
    const ro = new ResizeObserver(updateRect)
    ro.observe(flyoutRef.current)
    window.addEventListener('resize', updateRect)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateRect)
      useStore.getState().setPreviewFlyoutRect(null)
    }
  }, [item?.id])

  const handleDragOver = (e: React.DragEvent) => {
    const activeDrag = useStore.getState().internalDragReq
    if (item && activeDrag && activeDrag.id !== item.id) {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const activeDrag = useStore.getState().internalDragReq
    if (item && activeDrag && activeDrag.id !== item.id) {
      await window.edge.mergeItems(activeDrag.id, item.id)
      useStore.getState().setInternalDragReq(null)
    }
  }

  return createPortal(
    <AnimatePresence mode="wait" onExitComplete={() => {
      if (!useStore.getState().previewItemId) {
        window.edge.setPreviewMode(false)
      }
    }}>
      {item && (
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          [isRight ? 'right' : 'left']: 'var(--panel-width)',
          marginLeft: isRight ? 0 : 12,
          marginRight: isRight ? 12 : 0,
          width: 420,
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'none',
          zIndex: 5,
        }}>
          <motion.div
            ref={flyoutRef}
            key={item.id}
            className="preview-flyout"
            data-preview-flyout="true"
            initial={{ opacity: 0, scale: 0.88, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 8 }}
            transition={{
              ...adaptiveSpring,
              opacity: { type: 'tween', duration: 0.16, ease: 'easeOut' },
              y: { type: 'spring', stiffness: 420, damping: 36, mass: 0.65, restDelta: 0.001 }
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              width: '100%',
              maxHeight: maxFlyoutHeight,
              background: dragOver ? 'rgba(15, 30, 18, 0.95)' : '#000000',
              borderRadius: 16,
              border: dragOver ? '2px dashed #4caf50' : '1px solid rgba(255,255,255,0.06)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: dragOver ? '0 0 35px rgba(76, 175, 80, 0.3)' : '0 20px 40px rgba(0,0,0,0.5)',
              pointerEvents: 'auto',
              transformOrigin: `${isRight ? '100%' : '0%'} ${originY}`,
              willChange: 'transform, opacity',
              transition: 'background 0.2s ease, border 0.2s ease, box-shadow 0.2s ease',
              position: 'relative'
            }}
          >
          {dragOver && (
            <div
              style={{
                position: 'absolute',
                top: 14,
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#4caf50',
                color: '#000',
                fontWeight: 600,
                fontSize: 12,
                padding: '6px 14px',
                borderRadius: 20,
                zIndex: 10,
                boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span>+ Drop to stack into preview</span>
            </div>
          )}
          {/* Content — even bezels, no header chrome */}
          <div style={{ padding: '20px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <PreviewContent item={item} />
          </div>
        </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

function QuickActionButton({
  title,
  icon: Icon,
  onClick,
  activeColor = '#4caf50',
  solidDark = false
}: {
  title: string
  icon: any
  onClick: () => any
  activeColor?: string
  solidDark?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await onClick()
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const defaultBg = solidDark ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.06)'
  const defaultBorder = solidDark ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid rgba(255, 255, 255, 0.08)'
  const defaultColor = solidDark ? '#ffffff' : 'rgba(255, 255, 255, 0.75)'

  const hoverBg = solidDark ? 'rgba(0, 0, 0, 0.98)' : 'rgba(255, 255, 255, 0.18)'
  const hoverColor = '#ffffff'

  return (
    <button
      title={copied ? 'Copied!' : title}
      onClick={handleClick}
      style={{
        width: 28,
        height: 28,
        background: copied ? (solidDark ? '#4caf50' : 'rgba(76, 175, 80, 0.2)') : defaultBg,
        border: copied ? (solidDark ? '1px solid #4caf50' : '1px solid rgba(76, 175, 80, 0.4)') : defaultBorder,
        color: copied ? (solidDark ? '#ffffff' : activeColor) : defaultColor,
        borderRadius: 8,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s ease',
        flexShrink: 0,
        boxShadow: solidDark ? '0 4px 12px rgba(0, 0, 0, 0.5)' : undefined,
        backdropFilter: solidDark ? 'blur(8px)' : undefined
      }}
      onMouseEnter={(e) => {
        if (!copied) {
          e.currentTarget.style.background = hoverBg
          e.currentTarget.style.color = hoverColor
        }
      }}
      onMouseLeave={(e) => {
        if (!copied) {
          e.currentTarget.style.background = defaultBg
          e.currentTarget.style.color = defaultColor
        }
      }}
    >
      {copied ? <CheckIcon width={14} height={14} /> : <Icon width={14} height={14} />}
    </button>
  )
}

// Heuristic: if text looks like code, a path, or a log — use monospace. Otherwise system font.
function looksLikeCode(text: string): boolean {
  const firstLine = text.split('\n')[0] || ''
  return (
    firstLine.startsWith('/') ||
    firstLine.startsWith('C:\\') ||
    /[{}\[\]();=>]/.test(firstLine) ||
    /^\s*(import|export|const|let|var|function|class|def|if|for)\b/.test(firstLine)
  )
}

const SYS_FONT = "'Segoe UI', -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
const CODE_FONT = "'Cascadia Code', 'Cascadia Mono', Consolas, 'Fira Code', 'Courier New', monospace"

function PreviewContent({ item }: { item: any }) {
  const startDrag = useDragOut()

  if (item.data.kind === 'text') {
    const text: string = item.data.text.length > 20000
      ? item.data.text.slice(0, 20000) + '\n\n… (content truncated)'
      : item.data.text
    const isCode = looksLikeCode(text)
    return (
      <div
        onClick={(e) => {
          const sel = window.getSelection()?.toString()
          if (sel && sel.trim().length > 0) return
          e.stopPropagation()
          tryPaste(() => useStore.getState().paste(item.id))
        }}
        title="Click to paste"
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', position: 'sticky', top: 0, zIndex: 2 }}>
          <QuickActionButton
            title="Copy Text"
            icon={CopyIcon}
            onClick={() => navigator.clipboard.writeText(item.data.text)}
          />
        </div>
        <div style={{
          color: 'rgba(255,255,255,0.88)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: isCode ? 12 : 13.5,
          lineHeight: isCode ? 1.65 : 1.7,
          fontFamily: isCode ? CODE_FONT : SYS_FONT,
          fontWeight: 400,
          letterSpacing: isCode ? 0 : '0.01em',
        }}>
          {text}
        </div>
      </div>
    )
  }
  
  if (item.data.kind === 'image') {
    return (
      <div
        draggable={true}
        onDragStart={(e) => {
          e.preventDefault()
          const req = { id: item.id }
          useStore.getState().setInternalDragReq(req)
          startDrag(req)
        }}
        onDragEnd={() => useStore.getState().setInternalDragReq(null)}
        onClick={(e) => {
          e.stopPropagation()
          tryPaste(() => useStore.getState().paste(item.id))
        }}
        title="Click to paste · Drag to move"
        style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', cursor: 'grab' }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
          <QuickActionButton
            title="Copy Image"
            icon={CopyIcon}
            onClick={() => window.edge.copyItem(item.id)}
            solidDark={true}
          />
        </div>
        {item.data.imageId && (
          <img src={`edgelocal://${item.data.imageId}`} alt="preview" style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: 8 }} draggable={false} />
        )}
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: SYS_FONT, letterSpacing: '0.02em' }}>
          {item.data.width} × {item.data.height} · {formatBytes(item.data.bytes)}
        </div>
      </div>
    )
  }

  if (item.data.kind === 'image-collection') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {item.data.images.map((img: any, idx: number) => (
          <div
            key={img.imageId}
            draggable={true}
            onDragStart={(e) => {
              e.preventDefault()
              const req = { id: item.id, imageId: img.imageId }
              useStore.getState().setInternalDragReq(req)
              startDrag(req)
            }}
            onDragEnd={() => useStore.getState().setInternalDragReq(null)}
            onClick={(e) => {
              e.stopPropagation()
              tryPaste(() => window.edge.pasteSubitem({ id: item.id, imageId: img.imageId }))
            }}
            title="Click to paste image · Drag to move"
            style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', cursor: 'grab' }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
              <QuickActionButton
                title="Copy Image"
                icon={CopyIcon}
                onClick={() => window.edge.copySubitem({ id: item.id, imageId: img.imageId })}
                solidDark={true}
              />
            </div>
            <img src={`edgelocal://${img.imageId}`} alt="" style={{ width: '100%', borderRadius: 8 }} draggable={false} />
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', fontFamily: SYS_FONT, letterSpacing: '0.02em' }}>
              {idx + 1} of {item.data.images.length} · {img.width} × {img.height} · {formatBytes(img.bytes)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (item.data.kind === 'files') {
    const isSingleImage = item.data.paths.length === 1 && (item.data.entries?.[0]?.isImage || getFileKind(item.data.paths[0]).kind === 'image')
    if (isSingleImage) {
      const p = item.data.paths[0]
      const entry = item.data.entries?.[0]
      const fileName = entry?.name || p.split(/[\\\/]/).pop() || p
      const previewUrl = entry?.preview
      return (
        <div
          draggable={true}
          onDragStart={(e) => {
            e.preventDefault()
            const req = { id: item.id, paths: [p] }
            useStore.getState().setInternalDragReq(req)
            startDrag(req)
          }}
          onDragEnd={() => useStore.getState().setInternalDragReq(null)}
          onClick={(e) => {
            e.stopPropagation()
            tryPaste(() => useStore.getState().paste(item.id))
          }}
          title={`Click to paste "${fileName}" · Drag to move`}
          style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', cursor: 'grab' }}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
            <QuickActionButton
              title="Copy File"
              icon={CopyIcon}
              onClick={() => window.edge.copyItem(item.id)}
              solidDark={true}
            />
            <button
              title="Open location in Explorer"
              onClick={(e) => {
                e.stopPropagation()
                window.edge.revealFile(p)
              }}
              style={{
                width: 28,
                height: 28,
                background: 'rgba(0, 0, 0, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                color: '#ffffff',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(8px)',
                transition: 'all 0.15s ease',
                flexShrink: 0
              }}
            >
              <FolderOpenIcon width={14} height={14} />
            </button>
          </div>
          {previewUrl ? (
            <img src={previewUrl} alt={fileName} style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: 8 }} draggable={false} />
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontFamily: SYS_FONT }}>
              {fileName}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: SYS_FONT, letterSpacing: '0.02em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{fileName}</span>
            {entry?.size ? <span>{formatBytes(entry.size)}</span> : null}
          </div>
        </div>
      )
    }

    const isSingleFile = item.data.paths.length === 1

    return (
      <div style={{ display: 'grid', gridTemplateColumns: isSingleFile ? '1fr' : 'repeat(2, 1fr)', gap: 10 }}>
        {item.data.paths.map((p: string, i: number) => {
          const entry = item.data.entries?.[i]
          const info = getFileKind(p)
          const fileName = entry?.name || p.split(/[\\\/]/).pop() || p
          return (
            <div
              key={i}
              draggable={true}
              onDragStart={(e) => {
                e.preventDefault()
                const req = { id: item.id, paths: [p] }
                useStore.getState().setInternalDragReq(req)
                startDrag(req)
              }}
              onDragEnd={() => useStore.getState().setInternalDragReq(null)}
              onClick={(e) => {
                e.stopPropagation()
                tryPaste(() => window.edge.pasteSubitem({ id: item.id, paths: [p] }))
              }}
              title={`Click to paste "${fileName}" · Drag to move`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: isSingleFile ? '16px' : '12px',
                background: 'rgba(255,255,255,0.035)',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.06)',
                gap: 12,
                transition: 'background 0.2s ease, border-color 0.2s ease',
                minWidth: 0,
                cursor: 'grab'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                {entry?.isImage && entry.preview ? (
                  <img src={entry.preview} alt="" style={{ width: isSingleFile ? 40 : 34, height: isSingleFile ? 40 : 34, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ color: info.color, flexShrink: 0 }}>
                    <FileKindIcon path={p} width={isSingleFile ? 32 : 26} height={isSingleFile ? 32 : 26} />
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <QuickActionButton
                    title="Copy File"
                    icon={CopyIcon}
                    onClick={() => window.edge.copySubitem({ id: item.id, paths: [p] })}
                  />
                  <button
                    title="Open location in Explorer"
                    onClick={(e) => {
                      e.stopPropagation()
                      window.edge.revealFile(p)
                    }}
                    style={{
                      width: 28,
                      height: 28,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.7)',
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease',
                      flexShrink: 0
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.18)'
                      e.currentTarget.style.color = '#fff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                      e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
                    }}
                  >
                    <FolderOpenIcon width={14} height={14} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: 2 }}>
                <span
                  title={fileName}
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.9)',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    fontFamily: SYS_FONT
                  }}
                >
                  {fileName}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', fontFamily: SYS_FONT, letterSpacing: '0.02em' }}>
                  {entry?.size ? formatBytes(entry.size) : info.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return null
}
