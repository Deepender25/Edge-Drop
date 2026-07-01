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
import { useEffect, useRef } from 'react'
import { useStore } from '../store/appStore'
import { PANEL_LEAVE_EVENT, PANEL_ENTER_EVENT } from '../hooks/useEdgeHover'
import { Header } from './Header'
import { ItemList } from './ItemList'
import { Settings } from './Settings'

export function Panel() {
  const open = useStore((s) => s.open)
  const total = useStore((s) => s.items.length)
  const clear = useStore((s) => s.clear)
  const settings = useStore((s) => s.settings)
  const settingsOpen = useStore((s) => s.settingsOpen)

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
      if (!el) {
        if (req.imageId || (req.paths && req.paths.length > 0)) window.edge.splitItem(req)
        return
      }

      const itemEl = el.closest('.item-main')
      if (itemEl) {
        const targetId = itemEl.getAttribute('data-id')
        if (targetId && targetId !== req.id) {
          // Dropped on a DIFFERENT item: merge
          window.edge.mergeItems(req.id, targetId)
        } else if (targetId === req.id) {
          // Dropped on the SAME item: split it!
          if (req.imageId || (req.paths && req.paths.length > 0)) {
            const rect = itemEl.getBoundingClientRect()
            req.splitPlacement = pos.y < rect.top + rect.height / 2 ? 'before' : 'after'
            window.edge.splitItem(req)
          }
        }
      } else {
        // Dropped on empty space (e.g. padding): split
        if (req.imageId || (req.paths && req.paths.length > 0)) {
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

  return (
    <div className="root">
      <motion.div
        className="blade-container"
        initial={false}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          top: topOffset,
          y: '-50%',
          position: 'absolute',
          left: 0,
          zIndex: 10,
          pointerEvents: open ? 'auto' : 'none'
        }}
        animate={{
          clipPath: open
            ? 'inset(-100px -100px -100px 0px round 0px 24px 24px 0px)'
            : `inset(calc(50% - ${halfTrigger}px) calc(100% - 3px) calc(50% - ${halfTrigger}px) 0px round 0px 12px 12px 0px)`
        }}
        transition={{
          type: 'tween',
          ease: [0.16, 1, 0.3, 1],
          duration: 0.6
        }}
      >
        <div className="flare-top" />
        <div className="flare-bottom" />
        <div
          ref={bladeRef}
          className="blade"
          style={{ height: panelHeightStr }}
        >
          <Header />

          <AnimatePresence mode="wait">
            {settingsOpen ? (
              <motion.div
                key="settings"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
              >
                <Settings />
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
              >
                <ItemList />
                <div className="footer">
                  <span className="count">
                    {total} item{total === 1 ? '' : 's'}
                  </span>
                  <div className="spacer" />
                  <button className="text-btn danger" onClick={clear} disabled={total === 0}>
                    Clear
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <DropOverlay />
        </div>
      </motion.div>
    </div>
  )
}

function DropOverlay() {
  const dragActive = useStore((s) => s.dragActive)
  const internalDragReq = useStore((s) => s.internalDragReq)

  return (
    <AnimatePresence>
      {dragActive && !internalDragReq && (
        <motion.div
          initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          animate={{ opacity: 1, backdropFilter: 'blur(8px)' }}
          exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            background: 'rgba(0, 0, 0, 0.4)'
          }}
        >
          <motion.div
            initial={{ scale: 0.95, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            style={{
              padding: '16px 28px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '999px',
              color: '#fff',
              fontWeight: 600,
              fontSize: '1rem',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Drop items here to save
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
