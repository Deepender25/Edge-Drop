/**
 * ItemList — the scrollable body of the blade.
 *
 * Renders Pinned (if any) and Recent sections, handles OS drag-in of files &
 * images onto the shelf, and shows the empty state when there's nothing.
 * AnimatePresence popLayout keeps pin/delete from height-collapsing the list.
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
import { playExpandSound, playButtonClickSound } from '../lib/soundEffects'

import { useTranslation } from '../i18n'

const getVerticalPinnedLabelStyle = (text: string): React.CSSProperties => {
  const len = text.length
  if (len <= 6) return { fontSize: 'calc(9.5px * var(--font-scale, 1))', letterSpacing: '0.14em' }
  if (len <= 8) return { fontSize: 'calc(8.5px * var(--font-scale, 1))', letterSpacing: '0.07em' }
  if (len <= 10) return { fontSize: 'calc(7.5px * var(--font-scale, 1))', letterSpacing: '0.02em' }
  return { fontSize: 'calc(7.0px * var(--font-scale, 1))', letterSpacing: '0em' }
}

export function ItemList() {
  const { t } = useTranslation()
  const { pinned, recent } = useFilteredItems()
  const query = useStore((s) => s.query)
  const listRef = useRef<HTMLDivElement>(null)

  const total = pinned.length + recent.length
  
  const isDraggingAny = useStore((s) => !!s.dragActive || !!s.internalDragReq)
  const settings = useStore((s) => s.settings)
  const isHorizontal = settings.stickPosition === 'top'
  
  const typeFilter = useStore((s) => s.typeFilter) || 'all'
  const filterScrollMap = useRef<Record<string, { top: number; left: number }>>({})
  const prevFilterRef = useRef(typeFilter)

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

  const lastClosedAt = useRef<number>(Date.now())
  const lastClosedTopId = useRef<string | undefined>(topRecentId)
  const lastClosedTopTime = useRef<number | undefined>(topRecentTime)
  const lastClosedTopPinnedTime = useRef<number | undefined>(topPinnedTime)

  // Decoupled open state tracking: subscribe to store changes without triggering full list re-renders
  useEffect(() => {
    let lastOpen = useStore.getState().open
    const unsub = useStore.subscribe((state) => {
      const isNowOpen = !!state.open
      if (isNowOpen !== lastOpen) {
        if (!isNowOpen && lastOpen) {
          // Panel just closed: record timestamps and top item ids
          lastClosedAt.current = Date.now()
          lastClosedTopId.current = prevTopRecentId.current
          lastClosedTopTime.current = prevTopRecentTime.current
          lastClosedTopPinnedTime.current = prevTopPinnedTime.current
        } else if (isNowOpen && !lastOpen) {
          // Panel just opened: check if closed >= 60s OR if a new copy happened while closed
          const timeSinceClosed = Date.now() - lastClosedAt.current
          const hasNewCopyWhileClosed =
            prevTopRecentId.current !== lastClosedTopId.current ||
            prevTopRecentTime.current !== lastClosedTopTime.current ||
            prevTopPinnedTime.current !== lastClosedTopPinnedTime.current

          if (timeSinceClosed >= 60000 || hasNewCopyWhileClosed) {
            filterScrollMap.current = {}
            if (listRef.current) {
              if (isHorizontal) listRef.current.scrollLeft = 0
              else listRef.current.scrollTop = 0
            }
          }
        }
        lastOpen = isNowOpen
      }
    })
    return unsub
  }, [isHorizontal])

  useLayoutEffect(() => {
    // If a brand new or freshly updated item was added while panel is open, jump to top
    if (useStore.getState().open) {
      const isNewRecent = !!topRecentTime && (!prevTopRecentTime.current || topRecentTime > prevTopRecentTime.current)
      const isNewPinned = !!topPinnedTime && (!prevTopPinnedTime.current || topPinnedTime > prevTopPinnedTime.current)

      if (isNewRecent || isNewPinned) {
        filterScrollMap.current[typeFilter] = { top: 0, left: 0 }
        if (listRef.current) {
          if (isHorizontal) listRef.current.scrollLeft = 0
          else listRef.current.scrollTop = 0
        }
      }
    }

    prevTopRecentId.current = topRecentId
    prevTopRecentTime.current = topRecentTime
    prevTopPinnedTime.current = topPinnedTime
  }, [topRecentId, topRecentTime, topPinnedTime, isHorizontal, typeFilter])

  // Independent scroll position per filter page (unsynchronized across tabs)
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return

    if (prevFilterRef.current !== typeFilter) {
      // Save outgoing filter's scroll position before applying new filter's position
      filterScrollMap.current[prevFilterRef.current] = {
        top: el.scrollTop,
        left: el.scrollLeft
      }
      prevFilterRef.current = typeFilter

      // Restore incoming filter's saved scroll position (defaulting to 0)
      const saved = filterScrollMap.current[typeFilter]
      if (isHorizontal) {
        el.scrollLeft = saved?.left ?? 0
      } else {
        el.scrollTop = saved?.top ?? 0
      }
    }
  }, [typeFilter, isHorizontal])

  // Reset scroll on search query change
  const prevQueryRef = useRef(query)
  useLayoutEffect(() => {
    if (prevQueryRef.current !== query) {
      prevQueryRef.current = query
      if (listRef.current) {
        if (isHorizontal) listRef.current.scrollLeft = 0
        else listRef.current.scrollTop = 0
      }
    }
  }, [query, isHorizontal])

  // Reset scroll map when switching dock position
  const prevStickPos = useRef(settings.stickPosition)
  useLayoutEffect(() => {
    if (prevStickPos.current !== settings.stickPosition) {
      prevStickPos.current = settings.stickPosition
      filterScrollMap.current = {}
      if (listRef.current) {
        listRef.current.scrollTop = 0
        listRef.current.scrollLeft = 0
      }
    }
  }, [settings.stickPosition])

  useEffect(() => {
    if (!isDraggingAny) {
      stopScrolling()
    }
  }, [isDraggingAny])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    filterScrollMap.current[typeFilter] = {
      top: el.scrollTop,
      left: el.scrollLeft
    }
    const scrollPos = isHorizontal ? el.scrollLeft : el.scrollTop
    const next = scrollPos > 50
    setShowScrollTop((prev) => (prev === next ? prev : next))
  }

  const scrollToTop = () => {
    playButtonClickSound()
    if (listRef.current) {
      filterScrollMap.current[typeFilter] = { top: 0, left: 0 }
      if (isHorizontal) {
        listRef.current.scrollTo({ left: 0, behavior: 'smooth' })
      } else {
        listRef.current.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
  }

  useEffect(() => {
    const el = listRef.current
    if (!el || !isHorizontal) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [isHorizontal])

  const startScrolling = () => {
    if (scrollRaf.current !== null) return

    let lastTime = performance.now()
    const loop = (time: number) => {
      const dt = time - lastTime
      lastTime = time

      if (listRef.current && scrollVelocity.current !== 0) {
        if (isHorizontal) {
          listRef.current.scrollLeft += scrollVelocity.current * (dt / 16)
        } else {
          listRef.current.scrollTop += scrollVelocity.current * (dt / 16)
        }
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

    if (isHorizontal) {
      const x = e.clientX - rect.left
      const edgeSize = 80
      if (x < edgeSize) {
        const intensity = Math.max(0, 1 - (x / edgeSize))
        scrollVelocity.current = -(intensity * 20 + 2)
        startScrolling()
      } else if (x > rect.width - edgeSize) {
        const intensity = Math.max(0, 1 - ((rect.width - x) / edgeSize))
        scrollVelocity.current = (intensity * 20 + 2)
        startScrolling()
      } else {
        stopScrolling()
      }
      return
    }

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

  const filterKey = `${typeFilter}:${query}`

  return (
    <div
      className={`list${isHorizontal ? ' horizontal' : ''}`}
      ref={listRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeaveOrDrop}
      onDrop={handleDragLeaveOrDrop}
      onScroll={handleScroll}
    >
      {total === 0 ? (
        <EmptyState filtered={query.trim().length > 0} />
      ) : (
        <motion.div
          key={filterKey}
          className="list-stack"
          initial={{ opacity: 0.45 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
        >
          {pinned.length > 0 && (
            <section className="pinned-section">
              <div
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
                  <div className="pinned-label-group">
                    <span style={isHorizontal ? getVerticalPinnedLabelStyle(t('item.pinned')) : undefined}>
                      {t('item.pinned')}
                    </span>
                    <span className="pinned-count-badge">{pinned.length}</span>
                  </div>
                </div>
                <div className="pinned-header-right">
                  <button
                    className="act bundle-collapse-btn"
                    type="button"
                    aria-label={pinnedCollapsed ? t('item.expandPinned') : t('item.collapsePinned')}
                  >
                    <ChevronDownIcon
                      style={{
                        transform: isHorizontal
                          ? (pinnedCollapsed ? 'rotate(-90deg)' : 'rotate(90deg)')
                          : (pinnedCollapsed ? 'rotate(0deg)' : 'rotate(180deg)'),
                        transition: 'transform 0.14s ease'
                      }}
                    />
                  </button>
                </div>
              </div>
              {!pinnedCollapsed && pinned.map((it) => (
                <ClipboardItemCard key={it.id} item={it} />
              ))}
            </section>
          )}

          {recent.length > 0 && (
            <section className="recent-section">
              {pinned.length > 0 && (
                <div className="section-label recent-header">
                  <span className="recent-label-text">{t('item.recent')}</span>
                </div>
              )}
              {recent.map((it) => (
                <ClipboardItemCard key={it.id} item={it} />
              ))}
            </section>
          )}
        </motion.div>
      )}

      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: settings.reduceMotion ? 0.01 : 0.14, ease: 'easeOut' }}
            className={`scroll-top-btn${isHorizontal ? ' horizontal' : ''}`}
            onClick={scrollToTop}
            title={t('item.scrollToTop')}
            aria-label={t('item.scrollToTop')}
          >
            {isHorizontal ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
