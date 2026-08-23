import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/appStore'
import { formatBytes, formatImageDisplayName } from '../lib/format'
import { getFileKind } from '../lib/fileType'
import { FileKindIcon, FolderOpenIcon, CopyIcon, CheckIcon, ExternalLinkIcon, CloseIcon, GlobeIcon } from './icons'
import { parseUrlPreview } from '../lib/urlPreview'
import { createPortal } from 'react-dom'
import { useAdaptiveSpring } from '../hooks/useAdaptiveSpring'
import { useDragOut } from '../hooks/useDragOut'
import { tryPaste } from '../lib/tryPaste'
import { playButtonClickSound, playToggleSound } from '../lib/soundEffects'

import { useTranslation } from '../i18n'

/** Fast start, soft landing — no overshoot, no spring hang. */
const flyoutEaseOpen = [0.16, 1, 0.3, 1] as const
const flyoutEaseClose = [0.3, 0, 0.2, 1] as const

const flyoutVariants = {
  hidden: (isRight: boolean) => ({
    opacity: 0,
    x: isRight ? 14 : -14,
    scale: 0.97,
  }),
  shown: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      x: { duration: 0.26, ease: flyoutEaseOpen },
      scale: { duration: 0.26, ease: flyoutEaseOpen },
      opacity: { duration: 0.18, ease: 'easeOut' as const },
    },
  },
  exit: (isRight: boolean) => ({
    opacity: 0,
    x: isRight ? 10 : -10,
    scale: 0.98,
    transition: {
      x: { duration: 0.18, ease: flyoutEaseClose },
      scale: { duration: 0.18, ease: flyoutEaseClose },
      opacity: { duration: 0.14, ease: 'easeIn' as const },
    },
  }),
  reducedHidden: { opacity: 0 },
  reducedShown: { opacity: 1 },
}

export function PreviewFlyout({ isRight }: { isRight: boolean }) {
  const { t } = useTranslation()
  const previewItemId = useStore((s) => s.previewItemId)
  const items = useStore((s) => s.items)
  const settings = useStore((s) => s.settings)
  const adaptiveSpring = useAdaptiveSpring()
  
  const item = previewItemId ? items.find((i) => i.id === previewItemId) : null

  const screenH = typeof window !== 'undefined' ? window.innerHeight : 800
  const pFrac = settings.panelHeight || 0.6
  const panelH = screenH * pFrac
  const minY = panelH / 2
  const maxY = screenH - panelH / 2
  const vOffset = settings.verticalOffset ?? 0.5
  const midY = Math.round(minY + vOffset * (maxY - minY))
  const panelTop = midY - panelH / 2

  const reduceMotion = settings.reduceMotion || adaptiveSpring.type === 'tween'

  const maxFlyoutHeight = Math.max(100, panelH - 24)

  const [dragOver, setDragOver] = useState(false)
  const flyoutRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!item || !flyoutRef.current) {
      useStore.getState().setPreviewFlyoutRect(null)
      return
    }

    const updateRect = () => {
      if (!flyoutRef.current) return
      // offsetHeight ignores the wrapper transform, so the hover
      // keep-alive zone stays full-size while the open/close motion plays.
      const h = flyoutRef.current.offsetHeight
      const top = panelTop + (panelH - h) / 2
      useStore.getState().setPreviewFlyoutRect({ top, bottom: top + h })
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
  }, [item?.id, panelTop, panelH])

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

  // ── Multi-selection state (Option 1: Tap-to-toggle) ────────────────────────
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  // Reset selection whenever preview item changes or closes
  useEffect(() => {
    setSelectedKeys(new Set())
  }, [item?.id])

  const toggleSelectKey = (key: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    playToggleSound(true)
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const allItemKeys = getItemKeys(item)

  const handleSelectAllToggle = () => {
    playButtonClickSound()
    if (selectedKeys.size === allItemKeys.length) {
      setSelectedKeys(new Set())
    } else {
      setSelectedKeys(new Set(allItemKeys))
    }
  }

  const handleBatchCopy = () => {
    if (!item || selectedKeys.size === 0) return
    playButtonClickSound()
    const keys = Array.from(selectedKeys)
    if (item.data.kind === 'files') {
      window.edge.copySubitem({ id: item.id, paths: keys })
    } else if (item.data.kind === 'image-collection') {
      if (keys.length === 1) {
        window.edge.copySubitem({ id: item.id, imageId: keys[0] })
      } else {
        window.edge.copyItem(item.id)
      }
    }
  }

  const handleBatchPaste = () => {
    if (!item || selectedKeys.size === 0) return
    playButtonClickSound()
    const keys = Array.from(selectedKeys)
    if (item.data.kind === 'files') {
      tryPaste(() => window.edge.pasteSubitem({ id: item.id, paths: keys }))
    } else if (item.data.kind === 'image-collection') {
      if (keys.length === 1) {
        tryPaste(() => window.edge.pasteSubitem({ id: item.id, imageId: keys[0] }))
      } else {
        tryPaste(() => useStore.getState().paste(item.id))
      }
    }
  }

  return createPortal(
    <AnimatePresence onExitComplete={() => {
      if (!useStore.getState().previewItemId) {
        window.edge.setPreviewMode(false)
      }
    }}>
      {item && (
        <motion.div
          key={item.id}
          custom={isRight}
          variants={flyoutVariants}
          initial={reduceMotion ? 'reducedHidden' : 'hidden'}
          animate={reduceMotion ? 'reducedShown' : 'shown'}
          exit={reduceMotion ? 'reducedHidden' : 'exit'}
          transition={reduceMotion ? { duration: 0.12, ease: 'linear' } : undefined}
          style={{
            position: 'absolute',
            top: panelTop,
            height: panelH,
            [isRight ? 'right' : 'left']: 'var(--panel-width)',
            marginLeft: isRight ? 0 : 12,
            marginRight: isRight ? 12 : 0,
            width: 440,
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none',
            zIndex: 5,
            originX: isRight ? 1 : 0,
            originY: 0.5,
            willChange: 'transform, opacity',
            backfaceVisibility: 'hidden',
          }}
        >
          <div
            ref={flyoutRef}
            className="preview-flyout"
            data-preview-flyout="true"
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
              <span>+ {t('onboarding.dropToExtract')}</span>
            </div>
          )}
          {/* Content — even bezels, no header chrome */}
          <div style={{ padding: selectedKeys.size > 0 ? '20px 20px 68px 20px' : '20px', overflowY: 'auto', overflowX: 'hidden', flex: 1, minHeight: 0 }}>
            <PreviewContent
              item={item}
              selectedKeys={selectedKeys}
              onToggleSelectKey={toggleSelectKey}
            />
          </div>

          {/* Floating Multi-Selection Batch Action Bar */}
          <AnimatePresence>
            {selectedKeys.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 14, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 14, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                style={{
                  position: 'absolute',
                  bottom: 12,
                  left: 12,
                  right: 12,
                  background: 'rgba(16, 16, 20, 0.92)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 12px 32px rgba(0, 0, 0, 0.75)',
                  borderRadius: 12,
                  padding: '7px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  zIndex: 20
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.16)',
                    color: '#ffffff',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontFamily: CODE_FONT,
                    letterSpacing: '0.02em',
                    whiteSpace: 'nowrap'
                  }}>
                    {t('flyout.selectedCount').replace('{count}', String(selectedKeys.size))}
                  </div>
                  <button
                    onClick={handleSelectAllToggle}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'rgba(255, 255, 255, 0.65)',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      padding: '2px 4px',
                      fontFamily: SYS_FONT,
                      transition: 'color 0.15s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.65)')}
                  >
                    {selectedKeys.size === allItemKeys.length ? t('flyout.deselectAll') : t('flyout.selectAll')}
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    title={t('flyout.copySelected')}
                    onClick={handleBatchCopy}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      height: 28,
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: 'rgba(255, 255, 255, 0.85)',
                      borderRadius: 8,
                      padding: '0 10px',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: SYS_FONT,
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)'
                      e.currentTarget.style.color = '#ffffff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
                      e.currentTarget.style.color = 'rgba(255, 255, 255, 0.85)'
                    }}
                  >
                    <CopyIcon width={13} height={13} />
                    <span>{t('item.copy')}</span>
                  </button>

                  <button
                    title={t('flyout.pasteSelected')}
                    onClick={handleBatchPaste}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      height: 28,
                      background: '#ffffff',
                      border: 'none',
                      color: '#000000',
                      borderRadius: 8,
                      padding: '0 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: SYS_FONT,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>{t('flyout.paste')}</span>
                  </button>

                  <button
                    title={t('flyout.clearSelection')}
                    onClick={() => {
                      playButtonClickSound()
                      setSelectedKeys(new Set())
                    }}
                    style={{
                      width: 28,
                      height: 28,
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: 'rgba(255, 255, 255, 0.7)',
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)'
                      e.currentTarget.style.color = '#ffffff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
                      e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)'
                    }}
                  >
                    <CloseIcon width={14} height={14} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

function getItemKeys(item: any): string[] {
  if (!item) return []
  if (item.data.kind === 'files') {
    return item.data.paths || []
  }
  if (item.data.kind === 'image-collection') {
    return (item.data.images || []).map((img: any) => img.imageId)
  }
  return []
}

function QuickActionButton({
  title,
  icon: Icon,
  onClick,
  activeColor = '#4caf50',
  solidDark = false,
  size = 28
}: {
  title: string
  icon: any
  onClick: () => any
  activeColor?: string
  solidDark?: boolean
  size?: number
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
  const iconSize = size === 24 ? 12 : 14
  const borderRadius = size === 24 ? 6 : 8

  return (
    <button
      title={copied ? 'Copied!' : title}
      onClick={handleClick}
      style={{
        width: size,
        height: size,
        background: copied ? (solidDark ? '#4caf50' : 'rgba(76, 175, 80, 0.2)') : defaultBg,
        border: copied ? (solidDark ? '1px solid #4caf50' : '1px solid rgba(76, 175, 80, 0.4)') : defaultBorder,
        color: copied ? (solidDark ? '#ffffff' : activeColor) : defaultColor,
        borderRadius,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s ease',
        flexShrink: 0,
        boxShadow: solidDark ? '0 4px 12px rgba(0, 0, 0, 0.5)' : undefined
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
      {copied ? <CheckIcon width={iconSize} height={iconSize} /> : <Icon width={iconSize} height={iconSize} />}
    </button>
  )
}

function ExplorerButton({
  path,
  title,
  size = 28,
  solidDark = false
}: {
  path: string
  title?: string
  size?: number
  solidDark?: boolean
}) {
  const { t } = useTranslation()
  const defaultBg = solidDark ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.06)'
  const defaultBorder = solidDark ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid rgba(255, 255, 255, 0.08)'
  const defaultColor = solidDark ? '#ffffff' : 'rgba(255, 255, 255, 0.75)'
  const hoverBg = solidDark ? 'rgba(0, 0, 0, 0.98)' : 'rgba(255, 255, 255, 0.18)'
  const hoverColor = '#ffffff'
  const iconSize = size === 24 ? 12 : 14
  const borderRadius = size === 24 ? 6 : 8

  return (
    <button
      title={title || t('flyout.openInExplorer')}
      onClick={(e) => {
        e.stopPropagation()
        window.edge.revealFile(path)
      }}
      style={{
        width: size,
        height: size,
        background: defaultBg,
        border: defaultBorder,
        color: defaultColor,
        borderRadius,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s ease',
        flexShrink: 0,
        boxShadow: solidDark ? '0 4px 12px rgba(0, 0, 0, 0.5)' : undefined
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = hoverBg
        e.currentTarget.style.color = hoverColor
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = defaultBg
        e.currentTarget.style.color = defaultColor
      }}
    >
      <FolderOpenIcon width={iconSize} height={iconSize} />
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

function SelectionBadge({
  isSelected,
  onToggle
}: {
  isSelected: boolean
  onToggle: (e: React.MouseEvent) => void
}) {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        onToggle(e)
      }}
      title={isSelected ? 'Deselect item' : 'Select item'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
        margin: -4,
        cursor: 'pointer',
        zIndex: 6,
        flexShrink: 0
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          background: isSelected ? '#ffffff' : 'rgba(0, 0, 0, 0.75)',
          border: isSelected ? '2px solid #ffffff' : '2px solid rgba(255, 255, 255, 0.5)',
          color: isSelected ? '#000000' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isSelected ? '0 2px 8px rgba(0, 0, 0, 0.6)' : '0 2px 6px rgba(0, 0, 0, 0.4)',
          transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease'
        }}
      >
        {isSelected && (
          <CheckIcon width={14} height={14} strokeWidth={3} style={{ shapeRendering: 'geometricPrecision' }} />
        )}
      </div>
    </div>
  )
}

function PreviewContent({
  item,
  selectedKeys,
  onToggleSelectKey
}: {
  item: any
  selectedKeys?: Set<string>
  onToggleSelectKey?: (key: string, e?: React.MouseEvent) => void
}) {
  const { t } = useTranslation()
  const startDrag = useDragOut()

  const [fullText, setFullText] = useState<string | null>(null)

  useEffect(() => {
    if (item?.data?.kind === 'text' && item.data.hasFullPayload) {
      window.edge.getFullText(item.id).then((t) => setFullText(t)).catch(() => {})
    } else {
      setFullText(null)
    }
  }, [item?.id, item?.data?.hasFullPayload])

  if (item.data.kind === 'text') {
    const activeText = fullText ?? item.data.text
    const text: string = activeText.length > 20000
      ? activeText.slice(0, 20000) + `\n\n${t('flyout.contentTruncated')}`
      : activeText
    const isCode = looksLikeCode(text)
    const isUrl = item.data.isUrl

    if (isUrl) {
      const info = parseUrlPreview(activeText)
      return (
        <div
          onClick={(e) => {
            const sel = window.getSelection()?.toString()
            if (sel && sel.trim().length > 0) return
            e.stopPropagation()
            tryPaste(() => useStore.getState().paste(item.id))
          }}
          title={t('flyout.clickToPaste')}
          style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14, cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: 999,
              padding: '3px 10px',
              maxWidth: 'calc(100% - 75px)',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              boxSizing: 'border-box'
            }}>
              <GlobeIcon width={13} height={13} style={{ color: 'rgba(255, 255, 255, 0.85)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#ffffff', fontFamily: SYS_FONT, flexShrink: 0, whiteSpace: 'nowrap' }}>{info.serviceName}</span>
              <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.35)', flexShrink: 0 }}>·</span>
              <span style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.65)', fontFamily: SYS_FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>{info.domain}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <QuickActionButton
                title={t('flyout.openLink')}
                icon={ExternalLinkIcon}
                onClick={() => window.open(activeText, '_blank')}
              />
              <QuickActionButton
                title={t('flyout.copyText')}
                icon={CopyIcon}
                onClick={() => navigator.clipboard.writeText(activeText)}
              />
            </div>
          </div>

          {info.title && (
            <div style={{
              fontSize: 16,
              fontWeight: 600,
              color: '#ffffff',
              lineHeight: 1.35,
              fontFamily: SYS_FONT,
              wordBreak: 'break-word'
            }}>
              {info.title}
            </div>
          )}

          <div
            onClick={(e) => {
              e.stopPropagation()
              window.open(activeText, '_blank')
            }}
            style={{
              padding: '10px 12px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 10,
              fontSize: 12.5,
              color: 'rgba(255, 255, 255, 0.80)',
              fontFamily: SYS_FONT,
              wordBreak: 'break-all',
              lineHeight: 1.45,
              cursor: 'pointer',
              transition: 'background 0.15s ease, border-color 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.16)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
            }}
          >
            {activeText}
          </div>
        </div>
      )
    }

    return (
      <div
        onClick={(e) => {
          const sel = window.getSelection()?.toString()
          if (sel && sel.trim().length > 0) return
          e.stopPropagation()
          tryPaste(() => useStore.getState().paste(item.id))
        }}
        title={t('flyout.clickToPaste')}
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, position: 'sticky', top: 0, zIndex: 2 }}>
          <QuickActionButton
            title={t('flyout.copyText')}
            icon={CopyIcon}
            onClick={() => window.edge.copyItem(item.id)}
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
          letterSpacing: isCode ? 0 : '0.01em'
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
        title={t('flyout.clickToPasteDrag')}
        style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', cursor: 'grab' }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
          <QuickActionButton
            title={t('flyout.copyImage')}
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
        {item.data.images.map((img: any, idx: number) => {
          const isSelected = selectedKeys?.has(img.imageId) ?? false
          return (
            <div
              key={img.imageId}
              draggable={true}
              onDragStart={(e) => {
                e.preventDefault()
                const sel = selectedKeys ? Array.from(selectedKeys) : []
                const req = (sel.length > 0 && isSelected)
                  ? { id: item.id }
                  : { id: item.id, imageId: img.imageId }
                useStore.getState().setInternalDragReq(req)
                startDrag(req)
              }}
              onDragEnd={() => useStore.getState().setInternalDragReq(null)}
              onClick={(e) => {
                e.stopPropagation()
                if (selectedKeys && selectedKeys.size > 0 && onToggleSelectKey) {
                  onToggleSelectKey(img.imageId, e)
                } else {
                  tryPaste(() => window.edge.pasteSubitem({ id: item.id, imageId: img.imageId }))
                }
              }}
              title={selectedKeys && selectedKeys.size > 0 ? (isSelected ? 'Click to deselect' : 'Click to select') : 'Click to paste image · Drag to move'}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                position: 'relative',
                cursor: 'grab',
                padding: 4,
                borderRadius: 10,
                border: isSelected ? '2px solid #ffffff' : '2px solid transparent',
                background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                boxShadow: isSelected ? '0 0 16px rgba(255, 255, 255, 0.2)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 3 }}>
                <SelectionBadge
                  isSelected={isSelected}
                  onToggle={(e) => onToggleSelectKey?.(img.imageId, e)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, position: 'absolute', top: 12, right: 12, zIndex: 2 }}>
                <QuickActionButton
                  title={t('flyout.copyImage')}
                  icon={CopyIcon}
                  onClick={() => window.edge.copySubitem({ id: item.id, imageId: img.imageId })}
                  solidDark={true}
                />
              </div>
              <img src={`edgelocal://${img.imageId}`} alt="" style={{ width: '100%', borderRadius: 8 }} draggable={false} />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', fontFamily: SYS_FONT, letterSpacing: '0.02em' }}>
                {idx + 1} / {item.data.images.length} · {img.width} × {img.height} · {formatBytes(img.bytes)}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (item.data.kind === 'files') {
    const isSingleImage = item.data.paths.length === 1 && (item.data.entries?.[0]?.isImage || getFileKind(item.data.paths[0]).kind === 'image')
    if (isSingleImage) {
      const p = item.data.paths[0]
      const entry = item.data.entries?.[0]
      const fileName = formatImageDisplayName(entry?.name || p, item.capturedAt)
      const fullResUrl = `edgelocal://file/${encodeURIComponent(p.replace(/\\/g, '/'))}`
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
          title={t('flyout.clickToPasteDrag')}
          style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', cursor: 'grab' }}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
            <QuickActionButton
              title={t('flyout.copyFile')}
              icon={CopyIcon}
              onClick={() => window.edge.copyItem(item.id)}
              solidDark={true}
              size={28}
            />
            <ExplorerButton
              path={p}
              title={t('flyout.openInExplorer')}
              solidDark={true}
              size={28}
            />
          </div>
          <img
            src={fullResUrl}
            onError={(e) => {
              if (entry?.preview) {
                e.currentTarget.src = entry.preview
              }
            }}
            alt={fileName}
            style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: 8 }}
            draggable={false}
          />
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: SYS_FONT, letterSpacing: '0.02em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{fileName}</span>
            {entry?.size ? <span>{formatBytes(entry.size)}</span> : null}
          </div>
        </div>
      )
    }

    const isSingleNonImage = item.data.paths.length === 1
    if (isSingleNonImage) {
      const p = item.data.paths[0]
      const entry = item.data.entries?.[0]
      const info = getFileKind(p, entry?.isDirectory)
      const fileName = formatImageDisplayName(entry?.name || p, item.capturedAt)
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
          title={t('flyout.clickToPasteDrag')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 16,
            padding: '36px 20px 28px',
            background: 'rgba(255, 255, 255, 0.035)',
            borderRadius: 14,
            border: '1px solid rgba(255, 255, 255, 0.06)',
            position: 'relative',
            cursor: 'grab'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, position: 'absolute', top: 12, right: 12, zIndex: 2 }}>
            <QuickActionButton
              title={t('flyout.copyFile')}
              icon={CopyIcon}
              onClick={() => window.edge.copyItem(item.id)}
              size={28}
            />
            <ExplorerButton
              path={p}
              title={t('flyout.openInExplorer')}
              size={28}
            />
          </div>

          <div style={{
            width: 104,
            height: 104,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            filter: 'drop-shadow(0 8px 24px rgba(0, 0, 0, 0.55))',
            marginTop: 4
          }}>
            <FileKindIcon path={p} width={104} height={104} isDirectory={entry?.isDirectory} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '100%', padding: '0 10px' }}>
            <div
              title={fileName}
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: '#ffffff',
                wordBreak: 'break-word',
                lineHeight: 1.4,
                fontFamily: SYS_FONT
              }}
            >
              {fileName}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.45)', fontFamily: SYS_FONT, letterSpacing: '0.02em' }}>
              {!entry?.isDirectory && entry?.size ? `${formatBytes(entry.size)} · ` : ''}{info.label}
            </div>
          </div>
        </div>
      )
    }

    const hasImageFiles = item.data.entries?.some((e: any) => !e.isDirectory && e.isImage) || item.data.paths.some((p: string, i: number) => {
      const e = item.data.entries?.[i]
      return !e?.isDirectory && getFileKind(p, e?.isDirectory).kind === 'image'
    })
    const useSingleColumn = hasImageFiles

    return (
      <div style={{ display: useSingleColumn ? 'flex' : 'grid', flexDirection: useSingleColumn ? 'column' : undefined, gridTemplateColumns: useSingleColumn ? undefined : 'repeat(2, minmax(0, 1fr))', gap: 12, width: '100%', boxSizing: 'border-box' }}>
        {item.data.paths.map((p: string, i: number) => {
          const entry = item.data.entries?.[i]
          const info = getFileKind(p, entry?.isDirectory)
          const fileName = formatImageDisplayName(entry?.name || p, item.capturedAt)
          const isSelected = selectedKeys?.has(p) ?? false
          const isImg = !entry?.isDirectory && (entry?.isImage || info.kind === 'image')

          if (isImg) {
            const fullResUrl = `edgelocal://file/${encodeURIComponent(p.replace(/\\/g, '/'))}`
            return (
              <div
                key={i}
                draggable={true}
                onDragStart={(e) => {
                  e.preventDefault()
                  const sel = selectedKeys ? Array.from(selectedKeys) : []
                  const req = (sel.length > 0 && isSelected)
                    ? { id: item.id, paths: sel }
                    : { id: item.id, paths: [p] }
                  useStore.getState().setInternalDragReq(req)
                  startDrag(req)
                }}
                onDragEnd={() => useStore.getState().setInternalDragReq(null)}
                onClick={(e) => {
                  e.stopPropagation()
                  if (selectedKeys && selectedKeys.size > 0 && onToggleSelectKey) {
                    onToggleSelectKey(p, e)
                  } else {
                    tryPaste(() => window.edge.pasteSubitem({ id: item.id, paths: [p] }))
                  }
                }}
                title={t('flyout.clickToPasteDrag')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 10px',
                  background: isSelected ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.035)',
                  borderRadius: 10,
                  border: isSelected ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                  cursor: 'grab',
                  position: 'relative',
                  minWidth: 0,
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              >
                {/* Multi-Select Checkbox */}
                {onToggleSelectKey && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleSelectKey(p, e)
                    }}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: isSelected ? '1.5px solid #fff' : '1.5px solid rgba(255, 255, 255, 0.3)',
                      background: isSelected ? '#fff' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    {isSelected && (
                      <CheckIcon width={12} height={12} style={{ color: '#000', strokeWidth: 3 }} />
                    )}
                  </div>
                )}

                {/* Left Thumbnail (small image card) */}
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: 'rgba(0, 0, 0, 0.4)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <img
                    src={fullResUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>

                {/* File Name & Metadata */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                  <span
                    title={fileName}
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#ffffff',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                      lineHeight: 1.35,
                      fontFamily: SYS_FONT,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {fileName}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.45)', fontFamily: SYS_FONT }}>
                    {entry?.size ? `${formatBytes(entry.size)} · ` : ''}{info.label}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <QuickActionButton
                    title={t('flyout.copyFile')}
                    icon={CopyIcon}
                    onClick={() => window.edge.copySubitem({ id: item.id, paths: [p] })}
                    size={24}
                  />
                  <ExplorerButton
                    path={p}
                    title={t('flyout.openInExplorer')}
                    size={24}
                  />
                </div>
              </div>
            )
          }

          // Non-image file card in multi-file view (2-column grid or single column)
          return (
            <div
              key={i}
              draggable={true}
              onDragStart={(e) => {
                e.preventDefault()
                const sel = selectedKeys ? Array.from(selectedKeys) : []
                const req = (sel.length > 0 && isSelected)
                  ? { id: item.id, paths: sel }
                  : { id: item.id, paths: [p] }
                useStore.getState().setInternalDragReq(req)
                startDrag(req)
              }}
              onDragEnd={() => useStore.getState().setInternalDragReq(null)}
              onClick={(e) => {
                e.stopPropagation()
                if (selectedKeys && selectedKeys.size > 0 && onToggleSelectKey) {
                  onToggleSelectKey(p, e)
                } else {
                  tryPaste(() => window.edge.pasteSubitem({ id: item.id, paths: [p] }))
                }
              }}
              title={t('flyout.clickToPasteDrag')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 8,
                padding: '14px 10px 12px',
                background: isSelected ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.035)',
                borderRadius: 12,
                border: isSelected ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                cursor: 'grab',
                position: 'relative',
                minWidth: 0,
                width: '100%',
                boxSizing: 'border-box'
              }}
            >
              {/* Top Controls: Checkbox (left) + Action Buttons (right) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 4 }}>
                {onToggleSelectKey ? (
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleSelectKey(p, e)
                    }}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: isSelected ? '1.5px solid #fff' : '1.5px solid rgba(255, 255, 255, 0.3)',
                      background: isSelected ? '#fff' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    {isSelected && (
                      <CheckIcon width={12} height={12} style={{ color: '#000', strokeWidth: 3 }} />
                    )}
                  </div>
                ) : <div />}

                <div style={{ display: 'flex', gap: 4 }}>
                  <QuickActionButton
                    title={t('flyout.copyFile')}
                    icon={CopyIcon}
                    onClick={() => window.edge.copySubitem({ id: item.id, paths: [p] })}
                    size={24}
                  />
                  <ExplorerButton
                    path={p}
                    title={t('flyout.openInExplorer')}
                    size={24}
                  />
                </div>
              </div>

              {/* Centered Large 3D Pastel Vector Icon */}
              <div style={{
                width: 64,
                height: 64,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.45))',
                marginTop: 8
              }}>
                <FileKindIcon path={p} width={64} height={64} isDirectory={entry?.isDirectory} />
              </div>

              {/* File Name & Metadata below icon */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%', minWidth: 0, padding: '0 4px', boxSizing: 'border-box' }}>
                <span
                  title={fileName}
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'rgba(255, 255, 255, 0.92)',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    lineHeight: 1.35,
                    fontFamily: SYS_FONT,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {fileName}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.42)', fontFamily: SYS_FONT, letterSpacing: '0.02em' }}>
                  {!entry?.isDirectory && entry?.size ? formatBytes(entry.size) : info.label}
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
