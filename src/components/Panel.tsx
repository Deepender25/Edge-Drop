/**
 * Panel — the blade that grows out of the left edge.
 *
 * Motion: when `open` flips true the blade slides in from x = -100% (fully off
 * the left edge) to x = 0 with a spring, and its opacity/blur animate together
 * for the "extending from the screen" feel. A faint ambient glow leads the
 * edge. When closed, the whole blade sits off-screen so the window stays
 * transparent and click-through.
 */
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState, useMemo } from 'react'
import { useStore } from '../store/appStore'
import { PANEL_LEAVE_EVENT, PANEL_ENTER_EVENT } from '../hooks/useEdgeHover'
import { Header } from './Header'
import { ItemList } from './ItemList'
import { Settings } from './Settings'
import { ToastStack } from './Toast'
import { ClearMenu } from './ClearMenu'
import { PreviewFlyout } from './PreviewFlyout'
import { IndicatorStyleFlyout } from './IndicatorStyleFlyout'
import { CopyIndicatorCurve } from './CopyIndicatorCurve'
import { useFilteredItems } from '../hooks/useFilteredItems'

import { useTranslation } from '../i18n'

export function Panel() {
  const { t } = useTranslation()
  const open = useStore((s) => s.open)
  const { pinned, recent } = useFilteredItems()
  const filteredItems = useMemo(() => [...pinned, ...recent], [pinned, recent])
  const filteredCount = filteredItems.length
  const clear = useStore((s) => s.clear)
  const typeFilter = useStore((s) => s.typeFilter)
  const query = useStore((s) => s.query)

  const settings = useStore((s) => s.settings)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const setQuery = useStore((s) => s.setQuery)
  const edgeHintActive = useStore((s) => s.edgeHintActive)

  useEffect(() => {
    if (!open) {
      // Delay resetting view state until after the retraction spring finishes (~350ms),
      // so the blade smoothly retracts with the current view without flashing the main clipboard.
      const timer = window.setTimeout(() => {
        if (!useStore.getState().open) {
          setSettingsOpen(false)
          setQuery('')
        }
      }, 400)
      return () => window.clearTimeout(timer)
    }
  }, [open, setSettingsOpen, setQuery])

  const screenH = typeof window !== 'undefined' ? window.innerHeight : 800
  const pFrac = settings.panelHeight || 0.6
  const panelH = screenH * pFrac
  const minY = panelH / 2
  const maxY = screenH - panelH / 2
  const vOffset = settings.verticalOffset ?? 0.5
  const midY = Math.round(minY + vOffset * (maxY - minY))
  const topOffset = `${midY}px`

  // The actual pixel height of the trigger zone on the left edge
  const triggerHeightPx = Math.round(window.innerHeight * settings.hotZoneHeight)
  const halfTrigger = Math.round(triggerHeightPx / 2)

  // The height of the complete pop-up panel
  const panelHeightStr = `${(settings.panelHeight || 0.6) * 100}vh`

  const setDragActive = useStore((s) => s.setDragActive)
  const setInternalDragReq = useStore((s) => s.setInternalDragReq)
  const internalDragReq = useStore((s) => s.internalDragReq)

  const bladeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const blade = bladeRef.current
    if (!blade) return

    const handleLeave = () => window.dispatchEvent(new Event(PANEL_LEAVE_EVENT))
    const handleEnter = () => window.dispatchEvent(new Event(PANEL_ENTER_EVENT))

    blade.addEventListener('mouseleave', handleLeave)
    blade.addEventListener('mouseenter', handleEnter)
    return () => {
      blade.removeEventListener('mouseleave', handleLeave)
      blade.removeEventListener('mouseenter', handleEnter)
    }
  }, [])

  useEffect(() => {
    const unsubDragEnd = window.edge.onDragEnd(() => {
      // Delay clearing to allow React's drop event to process first if they coincide
      setTimeout(() => {
        setInternalDragReq(null)
        setDragActive(false)
      }, 150)
    })

    const unsubInternalDrop = window.edge.onInternalDrop((pos) => {
      // The OS drag ended inside our window, but Electron/Windows swallowed the drop event.
      if (!internalDragReq) return
      
      const req = { ...internalDragReq }
      setInternalDragReq(null)
      setDragActive(false)
      
      const el = document.elementFromPoint(pos.x, pos.y)
      if (!el) return

      // Check if dropped inside the Preview Flyout
      const flyoutEl = el.closest('[data-preview-flyout]') || el.closest('.preview-flyout')
      if (flyoutEl) {
        const currentPreviewId = useStore.getState().previewItemId
        if (req.id === currentPreviewId) {
          // Dropped back onto its own preview flyout — DO NOTHING (keep in collection)
          console.log('[Panel] Dropped back onto own preview flyout, keeping in collection')
          return
        } else if (currentPreviewId) {
          // Dropped onto a different item's preview flyout — MERGE
          console.log('[Panel] Dropped onto another preview flyout, merging')
          window.edge.mergeItems(req.id, currentPreviewId)
          return
        }
      }

      if (el.closest('.split-dropzone')) {
        console.log('[Panel] Dropped in split dropzone, splitting')
        if (req.imageId || (req.paths && req.paths.length > 0)) {
          window.edge.splitItem(req)
        }
        return
      }

      const itemEl = el.closest('.item-main')
      if (itemEl) {
        const targetId = itemEl.getAttribute('data-id')
        if (targetId && targetId !== req.id) {
          // Dropped on a DIFFERENT item: merge
          window.edge.mergeItems(req.id, targetId)
        } else if (targetId === req.id) {
          // Dropped on the SAME item: do nothing, keep it in the collection
        }
      }
      // Dropping anywhere else (e.g. empty shelf / list space) is a clean return to shelf (no-op).
    })

    return () => {
      unsubDragEnd()
      unsubInternalDrop()
    }
  }, [internalDragReq, setInternalDragReq, setDragActive])

  const hasDragContent = (e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer?.types || [])
    return (
      types.includes('Files') ||
      types.includes('text/uri-list') ||
      types.includes('text/plain') ||
      types.includes('text/html') ||
      types.includes('URL')
    )
  }

  const onDragEnter = (e: React.DragEvent) => {
    if (hasDragContent(e)) {
      e.preventDefault()
      setDragActive(true)
    }
  }

  const onDragOver = (e: React.DragEvent) => {
    if (hasDragContent(e)) {
      e.preventDefault()
    }
  }

  const onDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null
    if (related && e.currentTarget.contains(related)) return
    setDragActive(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (internalDragReq) {
      setInternalDragReq(null)
      window.edge?.setInternalDrag?.(false)
    }
    setDragActive(false)
  }

  const isRight = settings.stickPosition === 'right'

  let containerClass = 'blade-container'
  if (isRight) containerClass += ' blade-right'

  const containerStyle: Record<string, unknown> = {
    position: 'absolute',
    zIndex: 10,
    pointerEvents: open ? 'auto' : 'none',
    transition: 'clip-path 0.44s cubic-bezier(0.175, 0.885, 0.32, 1.08)'
  }

  let originX = 0
  let originY = 0.5
  if (isRight) {
    containerStyle.top = topOffset
    containerStyle.y = '-50%'
    containerStyle.right = 0
    originX = 1
  } else {
    containerStyle.top = topOffset
    containerStyle.y = '-50%'
    containerStyle.left = 0
  }
  containerStyle.originX = originX
  containerStyle.originY = originY



  const alignment = settings.triggerAlignment || 'center'
  let insetTop = `calc(50% - ${halfTrigger}px)`
  let insetBottom = `calc(50% - ${halfTrigger}px)`

  if (alignment === 'top') {
    insetTop = '0px'
    insetBottom = `calc(100% - ${triggerHeightPx}px)`
  } else if (alignment === 'bottom') {
    insetTop = `calc(100% - ${triggerHeightPx}px)`
    insetBottom = '0px'
  }

  // Set clipPath via style (not animate) to avoid Framer Motion's broken
  // calc() interpolation — CSS transitions handle it correctly.
  let clipPath: string
  const hotWidth = settings.hotZoneWidth || 3
  if (isRight) {
    clipPath = open
      ? 'inset(calc(0% - 100px) 0px calc(0% - 100px) calc(0% - 800px) round 24px 0px 0px 24px)'
      : `inset(${insetTop} 0px ${insetBottom} calc(100% - ${hotWidth}px) round 24px 0px 0px 24px)`
  } else {
    clipPath = open
      ? 'inset(calc(0% - 100px) calc(0% - 800px) calc(0% - 100px) 0px round 0px 24px 24px 0px)'
      : `inset(${insetTop} calc(100% - ${hotWidth}px) ${insetBottom} 0px round 0px 24px 24px 0px)`
  }
  containerStyle.clipPath = clipPath

  return (
    <div className="root">
      <CopyIndicatorCurve />
      <motion.div
        className={containerClass}
        initial={{ scaleX: 0.93, scaleY: 0.96, opacity: 0.98 }}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={containerStyle}
        animate={
          open
            ? { scaleX: 1, scaleY: 1, opacity: 1 }
            : { scaleX: 0.96, scaleY: 0.97, opacity: 0.98 }
        }
        transition={
          open
            ? {
                scaleX: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
                scaleY: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.16, ease: 'easeOut' }
              }
            : {
                scaleX: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                scaleY: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                opacity: { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
              }
        }
      >
        {/* Edge Location Hint Beacon (Ultra-subtle fast hairline pulse when touching edge at wrong position) */}
        <AnimatePresence>
          {!open && edgeHintActive && (settings.showEdgeLocationHint ?? false) && (
            <motion.div
              key="edge-location-beacon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                top: insetTop,
                bottom: insetBottom,
                [isRight ? 'right' : 'left']: 0,
                width: 2,
                boxSizing: 'border-box',
                background: 'linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.65) 25%, rgba(255, 255, 255, 0.65) 75%, transparent)',
                boxShadow: '0 0 6px rgba(255, 255, 255, 0.3)',
                borderRadius: isRight ? '999px 0 0 999px' : '0 999px 999px 0',
                pointerEvents: 'none',
                zIndex: 99
              }}
            />
          )}
        </AnimatePresence>
        {isRight ? (
          <>
            <div className="flare-top flare-right">
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 30 0 L 30 30 L 0 30 A 30 30 0 0 0 30 0 Z" fill="#000000" />
              </svg>
            </div>
            <div className="flare-bottom flare-right">
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 30 30 L 30 0 L 0 0 A 30 30 0 0 1 30 30 Z" fill="#000000" />
              </svg>
            </div>
          </>
        ) : (
          <>
            <div className="flare-top">
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 0 0 L 0 30 L 30 30 A 30 30 0 0 1 0 0 Z" fill="#000000" />
              </svg>
            </div>
            <div className="flare-bottom">
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 0 30 L 0 0 L 30 0 A 30 30 0 0 0 0 30 Z" fill="#000000" />
              </svg>
            </div>
          </>
        )}
        <div
          ref={bladeRef}
          className="blade"
          style={{ height: panelHeightStr }}
        >
          <Header />

          <ToastStack />
          <div style={{ flex: 1, display: 'grid', gridTemplate: '1fr / 1fr', overflow: 'hidden', position: 'relative' }}>
            <AnimatePresence initial={false}>
              {settingsOpen ? (
                <motion.div
                  key="settings"
                  initial={{ opacity: 1, x: isRight ? -8 : 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: isRight ? 8 : -8 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.5 }}
                  style={{ gridArea: '1 / 1 / 2 / 2', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
                >
                  <Settings />
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={{ opacity: 1, x: isRight ? 8 : -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: isRight ? -8 : 8 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.5 }}
                  style={{ gridArea: '1 / 1 / 2 / 2', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
                >
                  <ItemList />
                <div className="footer" style={{ position: 'relative' }}>
                  <span className="count">
                    {filteredCount} {t('item.items')}
                  </span>
                  <div className="spacer" />
                  <ClearMenu
                    items={filteredItems}
                    disabled={recent.length === 0}
                    panelOpen={open}
                    onClear={(ids) => clear(ids)}
                    onClearAll={() => {
                      if (typeFilter === 'all' && !query.trim()) {
                        clear()
                      } else {
                        clear(recent.map((it) => it.id))
                      }
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>
          <DropOverlay />
          <SplitDropZone isRight={isRight} />
        </div>
        <PreviewFlyout isRight={isRight} />
        <IndicatorStyleFlyout isRight={isRight} />
      </motion.div>
    </div>
  )
}

/*
function getTutorialText(step: number): string {
  switch (step) {
    case 1:
      return 'Click the trash icon on the pinned card below to delete it.'
    case 2:
      return 'Copy any text or image (Ctrl + C) from another application to capture it.'
    case 3:
      return 'Drag the image card below and drop it onto your desktop.'
    case 4:
      return 'Click the files card below to expand the stack and view its contents.'
    case 5:
      return 'Click the Clear button at the bottom of the panel to finish.'
    default:
      return ''
  }
}
*/

function DropOverlay() {
  const { t } = useTranslation()
  const dragActive = useStore((s) => s.dragActive)
  const internalDragReq = useStore((s) => s.internalDragReq)

  return (
    <AnimatePresence>
      {dragActive && !internalDragReq && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            pointerEvents: 'none',
            background: 'rgba(6, 6, 8, 0.95)',
            textAlign: 'center',
            padding: '24px'
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '16px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255, 255, 255, 0.9)'
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v13"></path>
              <path d="m8 12 4 4 4-4"></path>
              <path d="M4 20h16"></path>
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.95)', letterSpacing: '0.01em' }}>
              {t('item.dropToSave')}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 400, color: 'rgba(255, 255, 255, 0.5)', lineHeight: 1.4 }}>
              {t('item.dropToSaveDesc')}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SplitDropZone({ isRight = false }: { isRight?: boolean }) {
  const internalDragReq = useStore((s) => s.internalDragReq)
  const isSubitemDragging = !!(
    internalDragReq &&
    (internalDragReq.imageId || (internalDragReq.paths && internalDragReq.paths.length > 0))
  )

  const [isOver, setIsOver] = useState(false)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    setIsOver(true)
  }

  const handleDragLeave = () => {
    setIsOver(false)
  }

  return (
    <AnimatePresence>
      {isSubitemDragging && (
        <motion.div
          className={`split-dropzone${isOver ? ' active' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          initial={{ opacity: 0, x: isRight ? 15 : -15 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: isRight ? 15 : -15 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          style={{
            left: isRight ? 'auto' : 0,
            right: isRight ? 0 : 'auto',
            justifyContent: isRight ? 'flex-end' : 'flex-start'
          }}
        >
          <div className="glow-line" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
