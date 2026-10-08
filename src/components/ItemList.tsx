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
  // Eased auto-scroll target (signed px/frame). The rAF loop chases this
  // instead of jumping straight to each dragover event's intensity.
  const scrollTarget = useRef<number>(0)

  // Cache the list box across dragover events: getBoundingClientRect()
  // forces a synchronous reflow, and dragover fires dozens of times per
  // second while stacking — reading it every event janks the whole gesture.
  // The box only moves on window/panel resize (scrolling content doesn't
  // move the container), so a 200ms refresh is plenty fresh.
  const listRectRef = useRef<{ rect: DOMRect; at: number } | null>(null)
  const getListRect = () => {
    const el = listRef.current
    if (!el) return null
    const now = performance.now()
    const cached = listRectRef.current
    if (cached && now - cached.at < 200) return cached.rect
    const rect = el.getBoundingClientRect()
    listRectRef.current = { rect, at: now }
    return rect
  }

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
      // Clamp dt so a single hitched frame can't cause a huge jump —
      // big steps after hitches are what make the scroll feel juddery.
      const dt = Math.min(64, time - lastTime)
      lastTime = time

      // Ease actual velocity toward the target so intensity changes between
      // dragover events (or zone exits) ramp smoothly instead of stepping.
      const target = scrollTarget.current
      const cur = scrollVelocity.current + (target - scrollVelocity.current) * Math.min(1, dt / 120)
      if (Math.abs(cur) < 0.05 && target === 0) {
        scrollVelocity.current = 0
        scrollRaf.current = null
        return
      }
      scrollVelocity.current = cur

      if (listRef.current) {
        const step = cur * (dt / 16)
        if (isHorizontal) {
          listRef.current.scrollLeft += step
        } else {
          listRef.current.scrollTop += step
        }
        scrollRaf.current = requestAnimationFrame(loop)
      } else {
        scrollRaf.current = null
      }
    }
    scrollRaf.current = requestAnimationFrame(loop)
  }

  const stopScrolling = () => {
    scrollTarget.current = 0
    scrollVelocity.current = 0
    if (scrollRaf.current !== null) {
      cancelAnimationFrame(scrollRaf.current)
      scrollRaf.current = null
    }
  }

  // Edge auto-scroll tuning: separate enter/exit thresholds (hysteresis) so
  // cursor jitter at the boundary can't start/stop the loop every event —
  // that start/stop flicker is what made edge scrolling feel stuttery.
  const EDGE_ENTER = 80
  const EDGE_EXIT = 110
  const MAX_SCROLL_PX = 20 // px per 60fps frame at full intensity

  const setScrollTarget = (v: number) => {
    scrollTarget.current = v
    if (v !== 0) startScrolling()
  }

  const handleDragOver = (e: React.DragEvent) => {
    const rect = getListRect()
    if (!rect) return

    const pos = isHorizontal ? e.clientX - rect.left : e.clientY - rect.top
    const len = isHorizontal ? rect.width : rect.height
    // Base 5px/frame so the scroll feels alive the moment the zone is
    // entered (the old +2 crawled at ~120px/s across most of the zone).
    const speedFor = (d: number) => Math.max(0, 1 - d / EDGE_ENTER) * MAX_SCROLL_PX + 5
    const active = scrollTarget.current

    if (active < 0) {
      // Scrolling toward the start edge: stay until clearly out, else ease
      // out — or flip if the cursor dove straight to the opposite edge.
      setScrollTarget(pos > EDGE_EXIT ? (pos > len - EDGE_ENTER ? speedFor(len - pos) : 0) : -speedFor(pos))
    } else if (active > 0) {
      setScrollTarget(len - pos > EDGE_EXIT ? (pos < EDGE_ENTER ? -speedFor(pos) : 0) : speedFor(len - pos))
    } else if (pos < EDGE_ENTER) {
      setScrollTarget(-speedFor(pos))
    } else if (pos > len - EDGE_ENTER) {
      setScrollTarget(speedFor(len - pos))
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // dragleave BUBBLES from every card crossed mid-gesture — without a
    // containment check, crossing any card boundary hard-stops the scroll
    // loop, and the next dragover restarts it. That stop/start cycle on
    // every card crossed is the stops-and-jitters. Only stop when actually
    // leaving the list (same pattern as the blade's onDragLeave).
    const related = e.relatedTarget as Node | null
    if (related && listRef.current?.contains(related)) return
    stopScrolling()
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
      onDragLeave={handleDragLeave}
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
                className={`pinned-accordion ${isHorizontal ? 'horizontal' : ''} ${!pinnedCollapsed ? 'is-expanded' : ''}`}
                style={
                  isHorizontal
                    ? ({ '--pinned-target-width': `${pinned.length * 210 + (pinned.length - 1) * 10}px` } as React.CSSProperties)
                    : undefined
                }
              >
                <div className="pinned-accordion-inner">
                  {pinned.map((it) => (
                    <ClipboardItemCard key={it.id} item={it} />
                  ))}
                </div>
              </div>
              <button
                type="button"
                className={`pinned-floating-pill ${isHorizontal ? 'horizontal' : ''} ${pinnedCollapsed ? 'is-collapsed' : ''}`}
                onClick={() => {
                  const next = !pinnedCollapsed
                  playExpandSound(!next)
                  setPinnedCollapsed(next)
                }}
                title={pinnedCollapsed ? t('item.expandPinned') : t('item.collapsePinned')}
                aria-label={pinnedCollapsed ? t('item.expandPinned') : t('item.collapsePinned')}
              >
                <PinFillIcon width={11} height={11} className="pinned-pill-icon" />
                <span className="pinned-pill-count">{pinned.length}</span>
                <ChevronDownIcon
                  width={11}
                  height={11}
                  className="pinned-pill-arrow"
                  style={{
                    transform: isHorizontal
                      ? (pinnedCollapsed ? 'rotate(-90deg)' : 'rotate(90deg)')
                      : (pinnedCollapsed ? 'rotate(0deg)' : 'rotate(180deg)')
                  }}
                />
              </button>
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
