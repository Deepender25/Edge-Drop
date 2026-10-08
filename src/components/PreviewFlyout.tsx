import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/appStore'
import { formatBytes, formatImageDisplayName } from '../lib/format'
import { getFileKind } from '../lib/fileType'
import { FileKindIcon, FolderOpenIcon, CopyIcon, CheckIcon, ExternalLinkIcon, CloseIcon, GlobeIcon } from './icons'
import { parseUrlPreview } from '../lib/urlPreview'
import { parseColor } from '../lib/colorUtils'
import { detectCode } from '../lib/codeDetect'
import { CodeBlock } from './CodeBlock'
import { createPortal } from 'react-dom'
import { useAdaptiveSpring } from '../hooks/useAdaptiveSpring'
import { useDragOut } from '../hooks/useDragOut'
import { tryPaste } from '../lib/tryPaste'
import { playButtonClickSound, playToggleSound } from '../lib/soundEffects'

import { useTranslation, t } from '../i18n'

/** Fast start, soft landing — no overshoot, no spring hang. */
const flyoutEaseOpen = [0.16, 1, 0.3, 1] as const
const flyoutEaseClose = [0.3, 0, 0.2, 1] as const

const flyoutVariants = {
  hidden: (dir: 'left' | 'right' | 'top') => ({
    opacity: 0,
    x: dir === 'right' ? 14 : dir === 'left' ? -14 : 0,
    y: dir === 'top' ? -14 : 0,
    scale: 0.97,
  }),
  shown: {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    transition: {
      x: { duration: 0.26, ease: flyoutEaseOpen },
      y: { duration: 0.26, ease: flyoutEaseOpen },
      scale: { duration: 0.26, ease: flyoutEaseOpen },
      opacity: { duration: 0.18, ease: 'easeOut' as const },
    },
  },
  exit: (dir: 'left' | 'right' | 'top') => ({
    opacity: 0,
    x: dir === 'right' ? 10 : dir === 'left' ? -10 : 0,
    y: dir === 'top' ? -10 : 0,
    scale: 0.98,
    transition: {
      x: { duration: 0.18, ease: flyoutEaseClose },
      y: { duration: 0.18, ease: flyoutEaseClose },
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

  const stickPosition = (settings.stickPosition || (isRight ? 'right' : 'left')) as 'left' | 'right' | 'top'
  const isTop = stickPosition === 'top'
  const isHorizontal = isTop

  const screenH = typeof window !== 'undefined' ? window.innerHeight : 800
  const screenW = typeof window !== 'undefined' ? window.innerWidth : 1140
  const pFrac = settings.panelHeight || 0.6
  const panelH = screenH * pFrac
  const minY = panelH / 2
  const maxY = screenH - panelH / 2
  const vOffset = settings.verticalOffset ?? 0.5
  const midY = Math.round(minY + vOffset * (maxY - minY))
  const panelTop = midY - panelH / 2

  const reduceMotion = settings.reduceMotion || adaptiveSpring.type === 'tween'

  const dockWidth = Math.min(screenW - 60, 1080)
  const flyoutWidth = 440
  const maxFlyoutHeight = isHorizontal ? Math.min(460, Math.max(200, screenH - 240)) : Math.max(100, panelH - 24)

  const dockLeft = Math.round((screenW - dockWidth) / 2)
  const previewItemRect = useStore((s) => s.previewItemRect)
  const cardCenterXInBlade = previewItemRect?.x !== undefined
    ? (previewItemRect.x + (previewItemRect.width || 210) / 2) - dockLeft
    : dockWidth / 2
  const minLeft = 12
  const maxLeft = Math.max(minLeft, dockWidth - flyoutWidth - 12)
  const flyoutLeft = Math.max(minLeft, Math.min(maxLeft, Math.round(cardCenterXInBlade - flyoutWidth / 2)))

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
      if (isHorizontal) {
        useStore.getState().setPreviewFlyoutRect({
          top: 210,
          bottom: 222 + h,
          left: flyoutLeft,
          right: flyoutLeft + flyoutWidth
        })
      } else {
        const top = panelTop + (panelH - h) / 2
        useStore.getState().setPreviewFlyoutRect({ top, bottom: top + h })
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
  }, [item?.id, panelTop, panelH, isHorizontal, isTop, dockLeft, flyoutLeft, flyoutWidth])

  // Dismiss preview flyout when user clicks inside the clipboard shelf (outside the flyout)
  useEffect(() => {
    if (!previewItemId) return

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (!target || typeof target.closest !== 'function') return

      // Keep open if interaction is inside the preview flyout itself
      if (target.closest('[data-preview-flyout], .preview-flyout')) {
        return
      }

      // If clicked on any item card: let the card's handleCardClick handle it cleanly without race conditions
      if (target.closest('.item-main, .item-card')) {
        return
      }

      // Clicked inside the clipboard shelf (.blade, .root, .header, empty list space, footer, etc.)
      const inClipboard = Boolean(target.closest('.blade') || target.closest('.root'))
      if (inClipboard) {
        useStore.getState().setPreviewItemId(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [previewItemId])

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
      useStore.getState().copySubitem({ id: item.id, paths: keys })
    } else if (item.data.kind === 'image-collection') {
      if (keys.length === 1) {
        useStore.getState().copySubitem({ id: item.id, imageId: keys[0] })
      } else {
        useStore.getState().copy(item.id)
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
          custom={stickPosition}
          variants={flyoutVariants}
          initial={reduceMotion ? 'reducedHidden' : 'hidden'}
          animate={reduceMotion ? 'reducedShown' : 'shown'}
          exit={reduceMotion ? 'reducedHidden' : 'exit'}
          transition={reduceMotion ? { duration: 0.12, ease: 'linear' } : undefined}
          style={
            isHorizontal
              ? {
                  position: 'absolute',
                  left: dockLeft + flyoutLeft,
                  width: flyoutWidth,
                  top: 222,
                  display: 'flex',
                  flexDirection: 'column',
                  pointerEvents: 'none',
                  zIndex: 5,
                  originX: 0.5,
                  originY: 0,
                  willChange: 'transform, opacity',
                  backfaceVisibility: 'hidden',
                }
              : {
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
                }
          }
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
              borderRadius: 20,
              border: dragOver ? '2px dashed #4caf50' : 'none',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: dragOver ? '0 0 35px rgba(76, 175, 80, 0.3)' : 'none',
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
          <div style={{ padding: selectedKeys.size > 0 ? '20px 20px 68px 20px' : '20px', overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', msOverflowStyle: 'none', flex: 1, minHeight: 0 }}>
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
  size = 28,
  solidDark = false
}: {
  title: string
  icon: any
  onClick: () => any
  size?: number
  solidDark?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.blur()
    await onClick()
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const iconSize = size <= 26 ? 13 : 15

  return (
    <button
      className={`act${copied ? ' active' : ''}${solidDark ? ' solid-dark' : ''}`}
      title={copied ? t('flyout.copied') : title}
      onClick={handleClick}
      style={{ width: size, height: size }}
    >
      {copied ? <CheckIcon width={iconSize} height={iconSize} /> : <Icon width={iconSize} height={iconSize} />}
    </button>
  )
}

function ExplorerButton({
  path,
  title,
  size = 28
}: {
  path: string
  title?: string
  size?: number
}) {
  const { t } = useTranslation()
  const iconSize = size <= 26 ? 13 : 15

  return (
    <button
      className="act"
      title={title || t('flyout.openInExplorer')}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        e.currentTarget.blur()
        window.edge.revealFile(path)
      }}
      style={{ width: size, height: size }}
    >
      <FolderOpenIcon width={iconSize} height={iconSize} />
    </button>
  )
}

const SYS_FONT = 'var(--font-ui)'
const CODE_FONT = 'var(--font-ui)'

function SelectionBadge({
  isSelected,
  forceVisible,
  onToggle
}: {
  isSelected: boolean
  forceVisible?: boolean
  onToggle: (e: React.MouseEvent) => void
}) {
  return (
    <div
      className={`subitem-select-badge${isSelected ? ' selected' : ''}${forceVisible ? ' force-visible' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(e)
      }}
      title={isSelected ? t('flyout.deselectItem') : t('flyout.selectItem')}
    >
      {isSelected && (
        <CheckIcon width={12} height={12} style={{ color: '#000', strokeWidth: 3 }} />
      )}
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
                onClick={() => navigator.clipboard.writeText(info.cleanUrl || activeText)}
              />
            </div>
          </div>

          {info.title && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
              {info.subtitle && (
                <div>
                  <span style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'rgba(255, 255, 255, 0.6)',
                    background: 'rgba(255, 255, 255, 0.08)',
                    padding: '2px 7px',
                    borderRadius: 4,
                    display: 'inline-block'
                  }}>
                    {info.subtitle}
                  </span>
                </div>
              )}
            </div>
          )}

          <div
            onClick={(e) => {
              e.stopPropagation()
              window.open(activeText, '_blank')
            }}
            style={{
              padding: '10px 12px',
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 10,
              fontSize: 12,
              color: 'rgba(255, 255, 255, 0.80)',
              fontFamily: 'var(--font-ui)',
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
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.25)'
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
            }}
          >
            {info.cleanUrl || activeText}
          </div>
        </div>
      )
    }

    const colorInfo = parseColor(activeText)
    if (colorInfo) {
      return (
        <div
          onClick={(e) => {
            const sel = window.getSelection()?.toString()
            if (sel && sel.trim().length > 0) return
            e.stopPropagation()
            tryPaste(() => useStore.getState().paste(item.id))
          }}
          title={t('flyout.clickToPaste')}
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '36px 20px',
            borderRadius: 16,
            background: colorInfo.cssColor,
            color: colorInfo.isLight ? '#111827' : '#ffffff',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', position: 'absolute', top: 10, right: 10 }}>
            <QuickActionButton
              title={t('flyout.copyText')}
              icon={CopyIcon}
              onClick={() => useStore.getState().copy(item.id)}
            />
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textShadow: colorInfo.isLight ? '0 1px 2px rgba(255,255,255,0.5)' : '0 2px 4px rgba(0,0,0,0.6)',
          }}>
            {colorInfo.displayText}
          </div>
        </div>
      )
    }

    const codeInfo = detectCode(activeText)
    if (codeInfo.isCode) {
      return (
        <div
          onClick={(e) => {
            const sel = window.getSelection()?.toString()
            if (sel && sel.trim().length > 0) return
            e.stopPropagation()
            tryPaste(() => useStore.getState().paste(item.id))
          }}
          title={t('flyout.clickToPaste')}
          style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', width: '100%' }}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, position: 'sticky', top: 0, zIndex: 2 }}>
            <QuickActionButton
              title={t('flyout.copyText')}
              icon={CopyIcon}
              onClick={() => useStore.getState().copy(item.id)}
            />
          </div>
          <CodeBlock
            code={text}
            language={codeInfo.language}
            showFrame={false}
            showHeader={false}
            showLineNumbers={true}
            showCopyButton={false}
          />
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
            onClick={() => useStore.getState().copy(item.id)}
          />
        </div>
        <div style={{
          color: 'rgba(255,255,255,0.88)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 13.5,
          lineHeight: 1.65,
          fontFamily: 'var(--font-ui)',
          fontWeight: 400,
          letterSpacing: '0.01em'
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
            onClick={() => useStore.getState().copy(item.id)}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {item.data.images.map((img: any, idx: number) => {
          const isSelected = selectedKeys?.has(img.imageId) ?? false
          return (
            <div
              key={img.imageId}
              className={`item flyout-subitem${isSelected ? ' is-selected' : ''}`}
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
              title={selectedKeys && selectedKeys.size > 0 ? (isSelected ? t('flyout.clickToDeselect') : t('flyout.clickToSelect')) : t('flyout.clickToPasteImageDrag')}
            >
              <div className="item-main">
                <div className="body">
                  <div className="item-content">
                    <div className="thumb-wrap">
                      <img
                        className="thumb"
                        src={`edgelocal://${img.imageId}`}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        style={{ maxHeight: '60vh' }}
                      />
                    </div>
                  </div>
                  <div className="item-footer">
                    <span className="kind-badge">{idx + 1} / {item.data.images.length} · {img.width} × {img.height}</span>
                    <span className="meta-size">{formatBytes(img.bytes)}</span>
                  </div>
                </div>

                <div className="actions" onClick={(e) => e.stopPropagation()}>
                  <QuickActionButton
                    title={t('flyout.copyImage')}
                    icon={CopyIcon}
                    onClick={() => useStore.getState().copySubitem({ id: item.id, imageId: img.imageId })}
                  />
                </div>

                {onToggleSelectKey && (
                  <SelectionBadge
                    isSelected={isSelected}
                    forceVisible={selectedKeys && selectedKeys.size > 0}
                    onToggle={(e) => onToggleSelectKey(img.imageId, e)}
                  />
                )}
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
          className="item flyout-subitem single-hero-card"
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
        >
          <div className="item-main">
            <div className="body">
              <div className="item-content">
                <div className="thumb-wrap">
                  <img
                    className="thumb"
                    src={fullResUrl}
                    onError={(e) => {
                      if (entry?.preview) {
                        e.currentTarget.src = entry.preview
                      }
                    }}
                    alt={fileName}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    style={{ maxHeight: '60vh' }}
                  />
                </div>
              </div>
              <div className="item-footer">
                <span className="kind-badge">{fileName}</span>
                {entry?.size ? <span className="meta-size">{formatBytes(entry.size)}</span> : null}
              </div>
            </div>

            <div className="actions" onClick={(e) => e.stopPropagation()}>
              <QuickActionButton
                title={t('flyout.copyFile')}
                icon={CopyIcon}
                onClick={() => useStore.getState().copy(item.id)}
              />
              <ExplorerButton
                path={p}
                title={t('flyout.openInExplorer')}
              />
            </div>
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
          className="item flyout-subitem single-hero-card"
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
        >
          <div className="item-main">
            <div className="body">
              <div className="item-content" style={{ padding: '24px 20px 12px 20px' }}>
                <div className="single-file-preview">
                  <div className="single-file-hero" style={{ color: info.color }}>
                    <FileKindIcon path={p} width={154} height={154} isDirectory={entry?.isDirectory} />
                  </div>
                  <div className="single-file-meta" style={{ marginTop: 8 }}>
                    <div className="preview single single-file-name" title={fileName} style={{ fontSize: 15, WebkitLineClamp: 3, whiteSpace: 'normal', lineHeight: 1.4 }}>
                      {fileName}
                    </div>
                  </div>
                </div>
              </div>
              <div className="item-footer" style={{ padding: '8px 18px 12px 18px' }}>
                <span className="kind-badge" style={{ color: info.color, fontSize: 12 }}>
                  {info.label.toLowerCase()}
                </span>
                {!entry?.isDirectory && entry?.size ? (
                  <span className="meta-size" style={{ fontSize: 12 }}>{formatBytes(entry.size)}</span>
                ) : null}
              </div>
            </div>

            <div className="actions" onClick={(e) => e.stopPropagation()}>
              <QuickActionButton
                title={t('flyout.copyFile')}
                icon={CopyIcon}
                onClick={() => useStore.getState().copy(item.id)}
              />
              <ExplorerButton
                path={p}
                title={t('flyout.openInExplorer')}
              />
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
      <div style={{ display: useSingleColumn ? 'flex' : 'grid', flexDirection: useSingleColumn ? 'column' : undefined, gridTemplateColumns: useSingleColumn ? undefined : 'repeat(2, minmax(0, 1fr))', gap: 10, width: '100%', boxSizing: 'border-box' }}>
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
                className={`item flyout-subitem${isSelected ? ' is-selected' : ''}`}
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
              >
                <div className="item-main">
                  <div className="body">
                    <div className="item-content">
                      <div className="thumb-wrap">
                        <img
                          className="thumb"
                          src={fullResUrl}
                          onError={(e) => {
                            if (entry?.preview) e.currentTarget.src = entry.preview
                          }}
                          alt={fileName}
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          style={{ maxHeight: useSingleColumn ? '50vh' : 110 }}
                        />
                      </div>
                    </div>
                    <div className="item-footer">
                      <span className="kind-badge">{t('filters.images').toLowerCase().slice(0, -1)}</span>
                      {entry?.size ? <span className="meta-size">{formatBytes(entry.size)}</span> : null}
                    </div>
                  </div>

                  <div className="actions" onClick={(e) => e.stopPropagation()}>
                    <QuickActionButton
                      title={t('flyout.copyFile')}
                      icon={CopyIcon}
                      onClick={() => useStore.getState().copySubitem({ id: item.id, paths: [p] })}
                      size={26}
                    />
                    <ExplorerButton
                      path={p}
                      title={t('flyout.openInExplorer')}
                      size={26}
                    />
                  </div>

                  {onToggleSelectKey && (
                    <SelectionBadge
                      isSelected={isSelected}
                      forceVisible={selectedKeys && selectedKeys.size > 0}
                      onToggle={(e) => onToggleSelectKey(p, e)}
                    />
                  )}
                </div>
              </div>
            )
          }

          // Non-image file card in multi-file view (2-column grid or single column)
          return (
            <div
              key={i}
              className={`item flyout-subitem${isSelected ? ' is-selected' : ''}`}
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
            >
              <div className="item-main">
                <div className="body">
                  <div className="item-content">
                    <div className="single-file-preview">
                      <div className="single-file-hero" style={{ color: info.color }}>
                        <FileKindIcon path={p} width={120} height={120} isDirectory={entry?.isDirectory} />
                      </div>
                      <div className="single-file-meta">
                        <div className="preview single single-file-name" title={fileName}>
                          {fileName}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="item-footer">
                    <span className="kind-badge" style={{ color: info.color }}>
                      {info.label.toLowerCase()}
                    </span>
                    {!entry?.isDirectory && entry?.size ? (
                      <span className="meta-size">{formatBytes(entry.size)}</span>
                    ) : null}
                  </div>
                </div>

                <div className="actions" onClick={(e) => e.stopPropagation()}>
                  <QuickActionButton
                    title={t('flyout.copyFile')}
                    icon={CopyIcon}
                    onClick={() => useStore.getState().copySubitem({ id: item.id, paths: [p] })}
                    size={26}
                  />
                  <ExplorerButton
                    path={p}
                    title={t('flyout.openInExplorer')}
                    size={26}
                  />
                </div>

                {onToggleSelectKey && (
                  <SelectionBadge
                    isSelected={isSelected}
                    forceVisible={selectedKeys && selectedKeys.size > 0}
                    onToggle={(e) => onToggleSelectKey(p, e)}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return null
}
