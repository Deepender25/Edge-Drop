/**
 * ItemList — the scrollable body of the blade.
 *
 * Renders Pinned (if any) and Recent sections, handles OS drag-in of files &
 * images onto the shelf, and shows the empty state when there's nothing.
 * AnimatePresence here gives items their staggered enter/exit.
 *
 * Drag-in awareness: sets `dragActive` on the store while OS files are being
 * dragged over the panel so the edge-hover hook knows not to close mid-drag.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useEffect, useLayoutEffect, useState } from 'react'
import { useStore } from '../store/appStore'
import { useFilteredItems } from '../hooks/useFilteredItems'
import { ClipboardItemCard } from './ClipboardItem'
import { EmptyState } from './EmptyState'
import { ChevronDownIcon, PinFillIcon } from './icons'
import { playExpandSound } from '../lib/soundEffects'

import { useTranslation } from '../i18n'

export function ItemList() {
  const { t } = useTranslation()
  const { pinned, recent } = useFilteredItems()
  const query = useStore((s) => s.query)
  const listRef = useRef<HTMLDivElement>(null)

  const total = pinned.length + recent.length
  
  const isDraggingAny = useStore((s) => !!s.dragActive || !!s.internalDragReq)
  const open = useStore((s) => s.open)
  
  const typeFilter = useStore((s) => s.typeFilter) || 'all'
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('edge_drop_pinned_collapsed_map')
      if (saved) return JSON.parse(saved)
    } catch {}
    return { all: true, text: true, image: true, file: true, link: true }
  })

  const pinnedCollapsed = collapsedMap[typeFilter] ?? true

  const setPinnedCollapsed = (val: boolean) => {
    setCollapsedMap((prev) => {
      const next = { ...prev, [typeFilter]: val }
      localStorage.setItem('edge_drop_pinned_collapsed_map', JSON.stringify(next))
      return next
    })
  }
  
  const topRecentId = recent[0]?.id
  const topRecentTime = recent[0]?.capturedAt
  const topPinnedTime = pinned[0]?.capturedAt

  const prevTopRecentId = useRef(topRecentId)
  const prevTopRecentTime = useRef(topRecentTime)
  const prevTopPinnedTime = useRef(topPinnedTime)

  const scrollRaf = useRef<number | null>(null)
  const scrollVelocity = useRef<number>(0)

  useEffect(() => {
    return () => {
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current)
    }
  }, [])

  const prevOpen = useRef(open)
  const lastClosedAt = useRef<number>(Date.now())
  const lastClosedTopId = useRef<string | undefined>(topRecentId)
  const lastClosedTopTime = useRef<number | undefined>(topRecentTime)
  const lastClosedTopPinnedTime = useRef<number | undefined>(topPinnedTime)

  useLayoutEffect(() => {
    if (!open && prevOpen.current) {
      // Panel just closed: record timestamps and top item ids
      lastClosedAt.current = Date.now()
      lastClosedTopId.current = topRecentId
      lastClosedTopTime.current = topRecentTime
      lastClosedTopPinnedTime.current = topPinnedTime
    } else if (open && !prevOpen.current) {
      // Panel just opened: check if closed >= 60s OR if a new copy happened while closed
      const timeSinceClosed = Date.now() - lastClosedAt.current
      const hasNewCopyWhileClosed =
        topRecentId !== lastClosedTopId.current ||
        topRecentTime !== lastClosedTopTime.current ||
        topPinnedTime !== lastClosedTopPinnedTime.current

      if (timeSinceClosed >= 60000 || hasNewCopyWhileClosed) {
        if (listRef.current) {
          listRef.current.scrollTop = 0
        }
      }
    }
    prevOpen.current = open
  }, [open, topRecentId, topRecentTime, topPinnedTime])

  useLayoutEffect(() => {
    // If a brand new or freshly updated item was added while panel is open, jump to top
    if (open) {
      const isNewRecent = !!topRecentTime && (!prevTopRecentTime.current || topRecentTime > prevTopRecentTime.current)
      const isNewPinned = !!topPinnedTime && (!prevTopPinnedTime.current || topPinnedTime > prevTopPinnedTime.current)

      if (isNewRecent || isNewPinned) {
        if (listRef.current) {
          listRef.current.scrollTop = 0
        }
      }
    }

    prevTopRecentId.current = topRecentId
    prevTopRecentTime.current = topRecentTime
    prevTopPinnedTime.current = topPinnedTime
  }, [open, topRecentId, topRecentTime, topPinnedTime])

  useEffect(() => {
    if (!isDraggingAny) {
      stopScrolling()
    }
  }, [isDraggingAny])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop > 50) {
      setShowScrollTop(true)
    } else {
      setShowScrollTop(false)
    }
  }

  const scrollToTop = () => {
    if (listRef.current) {
      listRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const startScrolling = () => {
    if (scrollRaf.current !== null) return

    let lastTime = performance.now()
    const loop = (time: number) => {
      const dt = time - lastTime
      lastTime = time

      if (listRef.current && scrollVelocity.current !== 0) {
        // Apply velocity, scaled by delta time to keep it consistent across refresh rates
        listRef.current.scrollTop += scrollVelocity.current * (dt / 16)
        scrollRaf.current = requestAnimationFrame(loop)
      } else {
        scrollRaf.current = null
      }
    }
    scrollRaf.current = requestAnimationFrame(loop)
  }

  const stopScrolling = () => {
    scrollVelocity.current = 0
    if (scrollRaf.current !== null) {
      cancelAnimationFrame(scrollRaf.current)
      scrollRaf.current = null
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!listRef.current) return
    const rect = listRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top
    const edgeSize = 80 // slightly larger comfortable trigger zone

    if (y < edgeSize) {
      // Speed scales up as you get closer to the absolute edge
      const intensity = Math.max(0, 1 - (y / edgeSize))
      scrollVelocity.current = -(intensity * 20 + 2)
      startScrolling()
    } else if (y > rect.height - edgeSize) {
      const intensity = Math.max(0, 1 - ((rect.height - y) / edgeSize))
      scrollVelocity.current = (intensity * 20 + 2)
      startScrolling()
    } else {
      stopScrolling()
    }
  }

  const handleDragLeaveOrDrop = () => {
    stopScrolling()
  }

  return (
    <motion.div 
      className="list" 
      ref={listRef} 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeaveOrDrop}
      onDrop={handleDragLeaveOrDrop}
      onScroll={handleScroll}
    >
      {total === 0 ? (
        <EmptyState filtered={query.trim().length > 0} />
      ) : (
        <>
          {pinned.length > 0 && (
            <motion.section layout transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className="pinned-section">
              <motion.div 
                layout
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className={`section-label pinned-header-interactive ${pinnedCollapsed ? 'is-collapsed' : ''}`}
                onClick={() => {
                  const next = !pinnedCollapsed
                  playExpandSound(!next)
                  setPinnedCollapsed(next)
                }}
                title={pinnedCollapsed ? t('item.expandPinned') : t('item.collapsePinned')}
              >
                <div className="pinned-header-left">
                  <PinFillIcon width={13} height={13} style={{ opacity: 0.9, color: '#ffffff' }} />
                  <span>{t('item.pinned')}</span>
                  <span className="pinned-count-badge">{pinned.length}</span>
                </div>
                <div className="pinned-header-right">
                  <button className="act bundle-collapse-btn" type="button" aria-label="Toggle pinned section">
                    <ChevronDownIcon style={{ transform: pinnedCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.22s ease' }} />
                  </button>
                </div>
              </motion.div>
              <AnimatePresence initial={false}>
                {!pinnedCollapsed && (
                  <motion.div
                    key="pinned-items-container"
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}
                  >
                    <AnimatePresence initial={false}>
                      {pinned.map((it) => (
                        <ClipboardItemCard key={it.id} item={it} />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          )}

          {recent.length > 0 && (
            <motion.section layout transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pinned.length > 0 && (
                <motion.div layout transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className="section-label">
                  {t('item.recent')}
                </motion.div>
              )}
              <AnimatePresence initial={false}>
                {recent.map((it) => (
                  <ClipboardItemCard key={it.id} item={it} />
                ))}
              </AnimatePresence>
            </motion.section>
          )}
        </>
      )}

      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="scroll-top-btn"
            onClick={scrollToTop}
            title={t('item.scrollToTop')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
