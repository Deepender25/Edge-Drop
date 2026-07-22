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
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/appStore'
import { PANEL_LEAVE_EVENT, PANEL_ENTER_EVENT } from '../hooks/useEdgeHover'
import { Header } from './Header'
import { ItemList } from './ItemList'
import { Settings } from './Settings'
import { ToastStack } from './Toast'
import { TrashIcon } from './icons'
import { PreviewFlyout } from './PreviewFlyout'

export function Panel() {
  const open = useStore((s) => s.open)
  const total = useStore((s) => s.items.length)
  const clear = useStore((s) => s.clear)
  const settings = useStore((s) => s.settings)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const setQuery = useStore((s) => s.setQuery)
  const bounceAnimation = settings.bounceAnimation
  const blurAnimation = settings.blurAnimation

  useEffect(() => {
    if (!open) {
      setSettingsOpen(false)
      setQuery('')
    }
  }, [open, setSettingsOpen, setQuery])

  const topOffset = '50%'

  // The actual pixel height of the trigger zone on the left edge
  const triggerHeightPx = window.innerHeight * settings.hotZoneHeight
  const halfTrigger = triggerHeightPx / 2

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
      } else {
        // Dropped on empty space: split only if dropped inside item-list container
        const itemListEl = el.closest('.item-list')
        if (itemListEl && (req.imageId || (req.paths && req.paths.length > 0))) {
          window.edge.splitItem(req)
        }
      }
    })

    return () => {
      unsubDragEnd()
      unsubInternalDrop()
    }
  }, [internalDragReq, setInternalDragReq, setDragActive])

  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')

  const onDragEnter = (e: React.DragEvent) => {
    if (hasFiles(e)) {
      e.preventDefault()
      setDragActive(true)
    }
  }

  const onDragOver = (e: React.DragEvent) => {
    if (hasFiles(e)) e.preventDefault()
  }

  const onDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null
    if (related && e.currentTarget.contains(related)) return
    setDragActive(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('[Panel] onDrop internalDragReq=', internalDragReq)
    if (internalDragReq) {
      e.preventDefault()
      // If it reaches here, it means it was dropped on the general panel background
      // (not on another item, which would have called stopPropagation).
      // Check if it's a subitem that should be split out:
      if (internalDragReq.imageId || (internalDragReq.paths && internalDragReq.paths.length > 0)) {
        console.log('[Panel] calling splitItem')
        window.edge.splitItem(internalDragReq)
      } else {
        console.log('[Panel] internalDragReq has no subitem, not splitting')
      }
      setInternalDragReq(null)
    } else if (hasFiles(e)) {
      e.preventDefault()
    }
    setDragActive(false)
  }

  const isRight = settings.stickPosition === 'right'

  let containerClass = 'blade-container'
  if (isRight) containerClass += ' blade-right'

  const containerStyle: Record<string, unknown> = {
    position: 'absolute',
    zIndex: 10,
    pointerEvents: open ? 'auto' : 'none'
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



  // Set clipPath via style (not animate) to avoid Framer Motion's broken
  // calc() interpolation — CSS transitions handle it correctly.
  let clipPath: string
  if (isRight) {
    clipPath = open
      ? 'inset(calc(0% - 100px) 0px calc(0% - 100px) calc(0% - 800px) round 24px 0px 0px 24px)'
      : `inset(calc(50% - ${halfTrigger}px) 0px calc(50% - ${halfTrigger}px) calc(100% - ${settings.hotZoneWidth || 3}px) round 24px 0px 0px 24px)`
  } else {
    clipPath = open
      ? 'inset(calc(0% - 100px) calc(0% - 800px) calc(0% - 100px) 0px round 0px 24px 24px 0px)'
      : `inset(calc(50% - ${halfTrigger}px) calc(100% - ${settings.hotZoneWidth || 3}px) calc(50% - ${halfTrigger}px) 0px round 0px 24px 24px 0px)`
  }
  containerStyle.clipPath = clipPath

  return (
    <div className="root">
      <motion.div
        className={containerClass}
        initial={false}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={containerStyle}
        animate={{
          scale: bounceAnimation && open ? [0.92, 1.05, 0.98, 1] : 1,
          filter: blurAnimation ? (open ? 'blur(0px)' : 'blur(16px)') : 'blur(0px)',
          opacity: open ? 1 : 0.98
        }}
        transition={{
          scale: bounceAnimation && open ? { duration: 0.55, ease: [0.22, 1, 0.36, 1] } : { duration: 0.15 },
          filter: blurAnimation ? { duration: open ? 0.8 : 0.45, ease: open ? [0.16, 1, 0.3, 1] : [0.4, 0, 0.2, 1] } : { duration: 0.1 },
          opacity: { duration: open ? 0.12 : 0.08, ease: 'easeOut' }
        }}
      >
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
          <AnimatePresence mode="wait">
            {settingsOpen ? (
              <motion.div
                key="settings"
                initial={{ opacity: 0, x: isRight ? -8 : 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: isRight ? 8 : -8 }}
                transition={{ type: 'spring', stiffness: 400, damping: 36, mass: 0.6 }}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 18, background: 'linear-gradient(to bottom, #000000, transparent)', pointerEvents: 'none', zIndex: 10 }} />
                <Settings />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 18, background: 'linear-gradient(to top, #000000, transparent)', pointerEvents: 'none', zIndex: 10 }} />
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0, x: isRight ? 8 : -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: isRight ? -8 : 8 }}
                transition={{ type: 'spring', stiffness: 400, damping: 36, mass: 0.6 }}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 18, background: 'linear-gradient(to bottom, #000000, transparent)', pointerEvents: 'none', zIndex: 10 }} />
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 18, background: 'linear-gradient(to bottom, #000000, transparent)', pointerEvents: 'none', zIndex: 10 }} />
                <ItemList />
                <div className="footer" style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: -18, left: 0, right: 0, height: 18, background: 'linear-gradient(to top, #000000, transparent)', pointerEvents: 'none', zIndex: 10 }} />
                  <span className="count">
                    {total} item{total === 1 ? '' : 's'}
                  </span>
                  <div className="spacer" />
                  <button 
                    className="text-btn danger"
                    onClick={clear} 
                    disabled={total === 0} 
                    title="Clear shelf" 
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <TrashIcon width={14} height={14} />
                    <span>Clear</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <DropOverlay />
          <SplitDropZone isRight={isRight} />
        </div>
        <PreviewFlyout isRight={isRight} />
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
            background: 'rgba(6, 6, 8, 0.82)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
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
              Drop to save
            </div>
            <div style={{ fontSize: '12px', fontWeight: 400, color: 'rgba(255, 255, 255, 0.5)', lineHeight: 1.4 }}>
              Any file, image, link, or text
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
