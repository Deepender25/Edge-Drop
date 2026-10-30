/**
 * Panel — the blade that grows out of the screen edge.
 *
 * Motion: when closed, a clip-path leaves only the thin edge bar visible.
 * When `open` flips true the clip springs out to the full blade, growing
 * outward and along the edge together, while a black veil over the content
 * fades away just behind it (see `.blade::after` in panel.css). Closing runs
 * the reverse: the content dims first and the shape draws back into the bar.
 */
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react'
import { useStore } from '../store/appStore'
import { PANEL_LEAVE_EVENT, PANEL_ENTER_EVENT } from '../hooks/useEdgeHover'
import { Header } from './Header'
import { ShelfSearch } from './ShelfSearch'
import { ItemList } from './ItemList'
import { EmojiPicker } from './EmojiPicker'
import { Settings } from './Settings'
import { ToastStack } from './Toast'
import { ClearMenu } from './ClearMenu'
import { PreviewFlyout } from './PreviewFlyout'
import { IndicatorStyleFlyout } from './IndicatorStyleFlyout'
import { LanguageFlyout } from './LanguageFlyout'
import { CardMenu } from './CardMenu'
import { CopyIndicatorCurve } from './CopyIndicatorCurve'
import { useFilteredItems } from '../hooks/useFilteredItems'
import { registerEdgeDragCue } from '../lib/edgeDrag'
import { DashedOutline } from './DashedOutline'
import { isKept } from '../../shared/itemMeta'

import { useTranslation } from '../i18n'

// Shelf open/close motion: real damped springs written out as CSS linear()
// easings, so the browser runs them with no per-frame JS.
// - Open: response 0.38s, damping 0.86, launched with a little initial
//   velocity so the very first frame already moves. It is cut where the
//   spring first reaches its target; the overshoot after that point would sit
//   outside the blade and be clipped away, so it would only cost frames.
// - Close: critically damped (no bounce), response 0.24s, cut once less than
//   a pixel of travel is left. Dismissal is quicker than presentation.
const SHELF_OPEN_MOTION =
  'clip-path 285ms linear(0, 0.055 3.5%, 0.149 8.5%, 0.414 21.8%, 0.524 27.8%, 0.614 33.3%, 0.693 38.8%, 0.759 44.3%, 0.817 50%, 0.866 56%, 0.907 62.5%, 0.941 69.8%, 0.969 78.3%, 0.989 88.5%, 1)'
/** Launch intro of the edge bar: appears a little wider and longer as a dark
 * pill, then settles into the slim black bar (see the beacon in Panel). */
const EDGE_INTRO_MS = 1300
/** The edge bar's ends taper over 24px of its length (the blade's corner
 * size) across its full thickness, so it reads as a soft pill, not a box.
 * The closed clip-path in Panel uses the same shape, so the intro lands on it
 * exactly. */
const EDGE_BAR_RADIUS = {
  left: '0 100% 100% 0 / 0 24px 24px 0',
  right: '100% 0 0 100% / 24px 0 0 24px',
  top: '0 0 24px 24px / 0 0 100% 100%'
}
const SHELF_CLOSE_MOTION =
  'clip-path 289ms linear(0, 0.021 1.8%, 0.058 3.8%, 0.116 6.3%, 0.23 10.5%, 0.402 16.8%, 0.503 20.8%, 0.586 24.5%, 0.659 28.2%, 0.725 32.3%, 0.782 36.5%, 0.832 41%, 0.874 46%, 0.911 51.7%, 0.941 58.5%, 0.965 66.8%, 0.982 77.5%, 0.994 93.8%, 1)'

export function Panel() {
  const open = useStore((s) => s.open)
  const { pinned, recent } = useFilteredItems()
  const filteredItems = useMemo(() => [...pinned, ...recent], [pinned, recent])
  const filteredCount = filteredItems.length
  // What Clear removes: the visible recent cards without a note (pinned and
  // noted cards are kept).
  const clearable = useMemo(() => recent.filter((it) => !isKept(it)), [recent])
  const clear = useStore((s) => s.clear)
  const typeFilter = useStore((s) => s.typeFilter)
  const query = useStore((s) => s.query)

  const settings = useStore((s) => s.settings)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const setQuery = useStore((s) => s.setQuery)
  const emojiOpen = useStore((s) => s.emojiOpen)
  const setEmojiOpen = useStore((s) => s.setEmojiOpen)
  // Mount the picker on first open and keep it while the shelf stays open.
  // Tearing it (and ItemList) down on every smile click is what made the
  // switch hitch. Once the shelf has closed and the picker is no longer shown
  // it is freed: its grid, images and glyph state would otherwise stay in
  // memory for the rest of the session. Every open lands on the first page
  // anyway, so the next mount looks the same.
  const emojiMountedRef = useRef(false)
  if (emojiOpen) emojiMountedRef.current = true
  else if (!open) emojiMountedRef.current = false
  const emojiMounted = emojiMountedRef.current
  const edgeHintActive = useStore((s) => s.edgeHintActive)
  const edgeTransition = useStore((s) => s.edgeTransition)
  const [startupBeacon, setStartupBeacon] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Launch intro: the edge bar settles into place (EDGE_INTRO_MS), then the
    // intro hands over to the real bar underneath.
    const timer = window.setTimeout(() => {
      setStartupBeacon(false)
    }, EDGE_INTRO_MS + 250)
    return () => window.clearTimeout(timer)
  }, [])

  // The edge bar is the closed panel clipped to a thin strip, so an intro that
  // is briefly wider than that strip is drawn outside the panel, over the
  // panel's own box (measured here), with the same strip insets.
  const containerRef = useRef<HTMLDivElement>(null)
  const showEdgeHint = !!edgeHintActive && (settings.showEdgeLocationHint ?? false)
  const showEdgeBeacon = !open && (startupBeacon || showEdgeHint)
  // A drag from another app is on its way: the bar swells, ready for it
  // (placed like the beacon, see EdgeDragCue). After the shelf closes it waits
  // for the close to finish, so it never appears over the shape drawing back.
  const externalDrag = useStore((s) => s.externalDrag)
  const [closeSettled, setCloseSettled] = useState(true)
  useEffect(() => {
    if (open) {
      setCloseSettled(false)
      return
    }
    const timer = window.setTimeout(() => setCloseSettled(true), 320)
    return () => window.clearTimeout(timer)
  }, [open])
  const showDragCue = externalDrag && !open && closeSettled && !startupBeacon
  const [beaconFrame, setBeaconFrame] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    if (!(showEdgeBeacon || showDragCue) || !containerRef.current) return
    // In .root's own pixels: the viewport in the app; in the onboarding tour the
    // shelf is scaled and moved (.ob-shelf), and viewport pixels would land twice transformed.
    const r = containerRef.current.getBoundingClientRect()
    const host = containerRef.current.closest<HTMLElement>('.root')
    const h = host?.getBoundingClientRect()
    const k = host && h && host.offsetWidth ? h.width / host.offsetWidth : 1
    const ox = h?.left ?? 0
    const oy = h?.top ?? 0
    setBeaconFrame({ left: (r.left - ox) / k, top: (r.top - oy) / k, width: r.width / k, height: r.height / k })
  }, [
    showEdgeBeacon,
    showDragCue,
    settings.stickPosition,
    settings.panelHeight,
    settings.verticalOffset,
    settings.horizontalOffset,
    settings.hotZoneHeight,
    settings.triggerAlignment
  ])

  useEffect(() => {
    if (!open) {
      // Delay resetting view state until after the retraction spring finishes (~350ms),
      // so the blade smoothly retracts with the current view without flashing the main clipboard.
      const timer = window.setTimeout(() => {
        if (!useStore.getState().open) {
          setSettingsOpen(false)
          setQuery('')
          setEmojiOpen(false)
        }
      }, 400)
      return () => window.clearTimeout(timer)
    }
  }, [open, setSettingsOpen, setQuery, setEmojiOpen])

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

      const isTop = (settings.stickPosition === 'top')
      const isRight = (settings.stickPosition === 'right')
      
      const isInsideSplitZone = 
        !!el.closest('.split-dropzone') ||
        (isTop && pos.y <= 80) ||
        (!isTop && isRight && pos.x >= window.innerWidth - 100) ||
        (!isTop && !isRight && pos.x <= 100)

      if (isInsideSplitZone) {
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
  const isTop = settings.stickPosition === 'top'
  const isHorizontal = isTop

  const isTransitioning = !!edgeTransition?.active
  const isVisuallyOpen = isTransitioning
    ? edgeTransition.stage === 'expanding'
    : open

  let containerClass = 'blade-container'
  if (isRight) containerClass += ' blade-right'
  else if (isTop) containerClass += ' blade-top'
  else containerClass += ' blade-left'
  if (isHorizontal) containerClass += ' horizontal-dock'
  if (isVisuallyOpen) containerClass += ' is-open'
  if (isTransitioning) containerClass += ' is-transitioning'

  const reduceMotion = !!settings.reduceMotion
  if (reduceMotion) containerClass += ' reduce-motion'
  // The transition is read from the new style, so picking it by the target
  // state gives the open spring on open and the close spring on close.
  const clipTransition = reduceMotion
    ? 'clip-path 0.01s linear'
    : isVisuallyOpen ? SHELF_OPEN_MOTION : SHELF_CLOSE_MOTION

  let currentTransition = clipTransition
  let currentOpacity = 1

  if (isTransitioning && !reduceMotion) {
    if (edgeTransition.stage === 'retracting') {
      currentTransition = SHELF_CLOSE_MOTION
      currentOpacity = 1
    } else if (edgeTransition.stage === 'bar_fade_out') {
      currentTransition = 'opacity 0.10s ease-out'
      currentOpacity = 0
    } else if (edgeTransition.stage === 'bar_fade_in') {
      currentTransition = 'opacity 0.12s ease-out'
      currentOpacity = 1
    } else if (edgeTransition.stage === 'expanding') {
      currentTransition = SHELF_OPEN_MOTION
      currentOpacity = 1
    }
  }

  const containerStyle: Record<string, unknown> = {
    position: 'absolute',
    zIndex: 10,
    pointerEvents: isTransitioning ? 'none' : open ? 'auto' : 'none',
    transition: mounted ? currentTransition : 'none',
    opacity: currentOpacity
  }
  if (isTransitioning) {
    containerStyle.willChange = 'clip-path, opacity'
  }

  // Static centering via plain CSS transform (framer x/y shorthands removed
  // with the bounce cleanup — same visual placement, no runtime needed).
  if (isRight) {
    containerStyle.top = topOffset
    containerStyle.transform = 'translateY(-50%)'
    containerStyle.right = 0
  } else if (isTop) {
    containerStyle.top = 0
    containerStyle.left = '50%'
    containerStyle.transform = 'translate(-50%, 0)'
  } else {
    containerStyle.top = topOffset
    containerStyle.transform = 'translateY(-50%)'
    containerStyle.left = 0
  }

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

  const triggerWidthPx = Math.round(
    settings.hotZoneHeight >= 0.55 ? 575 : settings.hotZoneHeight >= 0.35 ? 400 : 275
  )
  const halfTriggerW = triggerWidthPx / 2
  let insetLeft = `calc(50% - ${halfTriggerW}px)`
  let insetRight = `calc(50% - ${halfTriggerW}px)`

  if (alignment === 'top' || alignment === 'left') {
    insetLeft = '0px'
    insetRight = `calc(100% - ${triggerWidthPx}px)`
  } else if (alignment === 'bottom' || alignment === 'right') {
    insetLeft = `calc(100% - ${triggerWidthPx}px)`
    insetRight = '0px'
  }

  // Set clipPath via style (not animate) to avoid Framer Motion's broken
  // calc() interpolation — CSS transitions handle it correctly.
  // The open clip is the blade's own box plus the 30px reverse-curve flares,
  // nothing more (flyouts are portaled to <body>, and the blade clips its
  // own overflow). With no spare margin the shape grows outward and along
  // the edge together, instead of the outward edge snapping across in the
  // first frames. Every dock keeps the same 24px corners while it grows.
  let clipPath: string
  const hotWidth = settings.hotZoneWidth || 3
  if (isRight) {
    clipPath = isVisuallyOpen
      ? 'inset(-30px 0px -30px 0px round 24px 0px 0px 24px)'
      : `inset(${insetTop} 0px ${insetBottom} calc(100% - ${hotWidth}px) round ${hotWidth}px 0px 0px ${hotWidth}px / 24px 0px 0px 24px)`
  } else if (isTop) {
    clipPath = isVisuallyOpen
      ? 'inset(0px -30px 0px -30px round 0px 0px 24px 24px)'
      : `inset(0px ${insetRight} calc(100% - ${hotWidth}px) ${insetLeft} round 0px 0px 24px 24px / 0px 0px ${hotWidth}px ${hotWidth}px)`
  } else {
    clipPath = isVisuallyOpen
      ? 'inset(-30px 0px -30px 0px round 0px 24px 24px 0px)'
      : `inset(${insetTop} calc(100% - ${hotWidth}px) ${insetBottom} 0px round 0px ${hotWidth}px ${hotWidth}px 0px / 0px 24px 24px 0px)`
  }
  containerStyle.clipPath = clipPath

  // Edge bar intro (launch) and location hint. Not a light: the bar itself,
  // solid black with no border like the drag cue, a little wider and longer
  // than the bar, settling into the slim black bar it lands on exactly (same
  // insets, same black), so the hand-over is invisible. The hint is the same
  // shape as a short swell.
  const beaconThick = isHorizontal ? 'height' : 'width'
  const beaconLong = isHorizontal ? 'width' : 'height'
  const beaconWide = hotWidth + 6
  // Launch: the bar swells out of itself (solid all along, so the bar under
  // it never shows through), holds a beat, then glides back to slim.
  const beaconMotion = startupBeacon
    ? {
        animate: {
          [beaconThick]: reduceMotion ? hotWidth : [hotWidth, beaconWide, beaconWide, hotWidth],
          [beaconLong]: reduceMotion ? '100%' : ['100%', '114%', '114%', '100%'],
          opacity: 1
        },
        transition: {
          duration: EDGE_INTRO_MS / 1000,
          times: [0, 0.22, 0.38, 1],
          ease: [[0.22, 1, 0.36, 1], 'linear', [0.22, 1, 0.36, 1]]
        }
      }
    : {
        animate: {
          [beaconThick]: reduceMotion ? hotWidth : [hotWidth, hotWidth + 4, hotWidth],
          [beaconLong]: reduceMotion ? '100%' : ['100%', '106%', '100%'],
          opacity: 1
        },
        transition: { duration: 0.45, ease: 'easeInOut' }
      }

  return (
    <div className="root">
      <CopyIndicatorCurve />
      <AnimatePresence>
        {showEdgeBeacon && beaconFrame && (
          <motion.div
            key="edge-beacon"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            style={{ position: 'absolute', ...beaconFrame, pointerEvents: 'none', zIndex: 11 }}
          >
            <div
              style={
                isHorizontal
                  ? { position: 'absolute', left: insetLeft, right: insetRight, top: 0, height: hotWidth }
                  : { position: 'absolute', top: insetTop, bottom: insetBottom, [isRight ? 'right' : 'left']: 0, width: hotWidth }
              }
            >
              <motion.div
                key={startupBeacon ? 'intro' : 'hint'}
                data-edge-beacon=""
                {...beaconMotion}
                style={
                  isHorizontal
                    ? { position: 'absolute', top: 0, left: '50%', x: '-50%', backgroundColor: '#000000', borderRadius: EDGE_BAR_RADIUS.top }
                    : {
                        position: 'absolute',
                        backgroundColor: '#000000',
                        top: '50%',
                        [isRight ? 'right' : 'left']: 0,
                        y: '-50%',
                        borderRadius: isRight ? EDGE_BAR_RADIUS.right : EDGE_BAR_RADIUS.left
                      }
                }
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showDragCue && beaconFrame && (
          <motion.div
            key="edge-drag-cue"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: reduceMotion ? 0.01 : 0.14 } }}
            style={{ position: 'absolute', ...beaconFrame, pointerEvents: 'none', zIndex: 11 }}
          >
            <div
              style={
                isHorizontal
                  ? { position: 'absolute', left: insetLeft, right: insetRight, top: 0, height: hotWidth }
                  : { position: 'absolute', top: insetTop, bottom: insetBottom, [isRight ? 'right' : 'left']: 0, width: hotWidth }
              }
            >
              <EdgeDragCue side={isHorizontal ? 'top' : isRight ? 'right' : 'left'} barPx={hotWidth} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div
        ref={containerRef}
        className={containerClass}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={containerStyle}
      >

        {isTop && (
          <>
            <div className="flare-horizontal flare-top-left" style={{ opacity: isVisuallyOpen ? 1 : 0 }}>
              <svg width="32" height="30" viewBox="0 0 32 30" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision">
                <path d="M 0 0 C 13.43 0 30 16.57 30 30 L 32 30 L 32 0 Z" fill="#000000" />
              </svg>
            </div>
            <div className="flare-horizontal flare-top-right" style={{ opacity: isVisuallyOpen ? 1 : 0 }}>
              <svg width="32" height="30" viewBox="0 0 32 30" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision">
                <path d="M 2 30 C 2 16.57 18.57 0 32 0 L 0 0 L 0 30 Z" fill="#000000" />
              </svg>
            </div>
          </>
        )}
        {!isHorizontal && (isRight ? (
          <>
            <div className="flare-top flare-right" style={{ opacity: isVisuallyOpen ? 1 : 0 }}>
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 30 0 L 30 30 L 0 30 A 30 30 0 0 0 30 0 Z" fill="#000000" />
              </svg>
            </div>
            <div className="flare-bottom flare-right" style={{ opacity: isVisuallyOpen ? 1 : 0 }}>
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 30 30 L 30 0 L 0 0 A 30 30 0 0 1 30 30 Z" fill="#000000" />
              </svg>
            </div>
          </>
        ) : (
          <>
            <div className="flare-top" style={{ opacity: isVisuallyOpen ? 1 : 0 }}>
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 0 0 L 0 30 L 30 30 A 30 30 0 0 1 0 0 Z" fill="#000000" />
              </svg>
            </div>
            <div className="flare-bottom" style={{ opacity: isVisuallyOpen ? 1 : 0 }}>
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 0 30 L 0 0 L 30 0 A 30 30 0 0 0 0 30 Z" fill="#000000" />
              </svg>
            </div>
          </>
        ))}
        <div
          ref={bladeRef}
          className="blade"
          style={isHorizontal ? { width: 'min(calc(100vw - 60px), 1080px)', height: 210 } : { height: panelHeightStr }}
        >
          <Header
            isHorizontal={isHorizontal}
            itemCount={filteredCount}
            clearProps={{
              items: filteredItems,
              disabled: clearable.length === 0,
              panelOpen: open,
              onClear: (ids) => clear(ids),
              onClearAll: () => {
                if (typeFilter === 'all' && !query.trim()) {
                  clear()
                } else {
                  clear(clearable.map((it) => it.id))
                }
              }
            }}
          />

          <ToastStack />
          {!isHorizontal && !emojiOpen && !settingsOpen && <ShelfSearch />}
          <div style={{ flex: 1, display: 'grid', gridTemplate: '1fr / 1fr', overflow: 'hidden', position: 'relative' }}>
            {/* Main clipboard / emoji view (persistent so ItemList is never torn down and doesn't jump on Y-axis) */}
            <div
              style={{
                gridArea: '1 / 1 / 2 / 2',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative',
                opacity: settingsOpen ? 0 : 1,
                visibility: settingsOpen ? 'hidden' : 'visible',
                pointerEvents: settingsOpen ? 'none' : 'auto',
                transition: `opacity ${settings.reduceMotion ? '0.01s' : '0.16s'} ease, visibility ${settings.reduceMotion ? '0.01s' : '0.16s'} ease`
              }}
              aria-hidden={settingsOpen}
            >
              <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplate: '1fr / 1fr', overflow: 'hidden' }}>
                <div
                  style={{
                    gridArea: '1 / 1 / 2 / 2',
                    display: emojiOpen ? 'none' : 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                    height: '100%',
                    overflow: 'hidden'
                  }}
                  aria-hidden={emojiOpen}
                >
                  <ItemList />
                </div>
                <div
                  style={{
                    gridArea: '1 / 1 / 2 / 2',
                    display: emojiOpen ? 'flex' : 'none',
                    flexDirection: 'column',
                    minHeight: 0,
                    height: '100%',
                    overflow: 'hidden'
                  }}
                  aria-hidden={!emojiOpen}
                >
                  {emojiMounted ? <EmojiPicker active={emojiOpen} isHorizontal={isHorizontal} /> : null}
                </div>
              </div>
              {!isHorizontal && !emojiOpen && (
                <div className="footer" style={{ position: 'relative', zIndex: 100 }}>
                  <div className="footer-capsule">
                    <span className="footer-capsule-count" title={`${filteredCount}`}>
                      {filteredCount}
                    </span>
                  </div>
                  <div className="spacer" />
                  <ClearMenu
                    items={filteredItems}
                    disabled={clearable.length === 0}
                    panelOpen={open}
                    onClear={(ids) => clear(ids)}
                    onClearAll={() => {
                      if (typeFilter === 'all' && !query.trim()) {
                        clear()
                      } else {
                        clear(clearable.map((it) => it.id))
                      }
                    }}
                  />
                </div>
              )}
            </div>

            {/* Settings view */}
            <AnimatePresence>
              {settingsOpen && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, x: isHorizontal ? 0 : (isRight ? -8 : 8), y: isHorizontal ? (isTop ? -8 : 8) : 0 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, x: isHorizontal ? 0 : (isRight ? 8 : -8), y: isHorizontal ? (isTop ? -8 : 8) : 0 }}
                  transition={settings.reduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 500, damping: 32, mass: 0.5 }}
                  style={{ gridArea: '1 / 1 / 2 / 2', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
                >
                  <Settings isHorizontal={isHorizontal} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <PinGlow isHorizontal={isHorizontal} />
          <DropOverlay isHorizontal={isHorizontal} />
          <SplitDropZone
            stickPosition={settings.stickPosition || (isRight ? 'right' : 'left')}
            lineStart={isHorizontal ? insetLeft : insetTop}
            lineEnd={isHorizontal ? insetRight : insetBottom}
          />
        </div>
        <PreviewFlyout isRight={isRight} />
        <IndicatorStyleFlyout isRight={isRight} />
        <LanguageFlyout isRight={isRight} />
        <CardMenu />
      </div>
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

/**
 * The edge bar getting ready for a drag from another app: a slightly wider,
 * lit pill over the bar (same look as the launch beacon) that grows as the
 * drag gets closer (--pull, written by lib/edgeDrag.ts without a render).
 */
function EdgeDragCue({ side, barPx }: { side: 'left' | 'right' | 'top'; barPx: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    registerEdgeDragCue(ref.current)
    return () => registerEdgeDragCue(null)
  }, [])
  return (
    <div
      ref={ref}
      data-edge-drag-cue=""
      className={`edge-drag-cue side-${side}`}
      style={{ '--bar': `${barPx}px`, '--barn': barPx } as React.CSSProperties}
    />
  )
}

/** Tray with an arrow dropping into it; the arrow is its own group so it can move. */
function TrayArrowIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g className="drop-arrow">
        <path d="M12 3.25v9" />
        <path d="m8.25 8.75 3.75 3.75 3.75-3.75" />
      </g>
      <path d="M3.5 14h4.1l1.6 2.6h5.6l1.6-2.6h4.1" />
      <path d="M3.5 14v3.75a2.25 2.25 0 0 0 2.25 2.25h12.5a2.25 2.25 0 0 0 2.25-2.25V14l-2.1-5.1" />
      <path d="M5.6 8.9 3.5 14" />
    </svg>
  )
}

/**
 * Drop zone for anything dragged in from another app: a dashed well over the
 * dimmed shelf. It is up from the first frame of an open caused by the drag
 * (the content veil reveals it with the shelf), lights up once the drag is
 * over the shelf, and on a drop it takes the item in (the well tightens, the
 * arrow sinks into the tray) before handing over to the new card.
 */
/**
 * A pin or unpin lights the shelf from the side the card goes to: pinned cards lead the list (its left
 * in the top dock, its top in the side docks), an unpinned one goes back the other way. Once per change.
 */
function PinGlow({ isHorizontal }: { isHorizontal: boolean }) {
  const glow = useStore((s) => s.pinGlow)
  if (!glow) return null
  const pin = glow.kind === 'pin'
  const from = isHorizontal ? (pin ? 'left' : 'right') : (pin ? 'top' : 'bottom')
  return <div key={glow.at} className={`pin-glow from-${from}`} aria-hidden="true" />
}

/** How long the drop zone takes to fade once something is dropped on it. */
const ACCEPT_FADE_MS = 280

function DropOverlay({ isHorizontal }: { isHorizontal: boolean }) {
  const { t } = useTranslation()
  const open = useStore((s) => s.open)
  const incoming = useStore((s) => !s.internalDragReq && (s.externalDrag || s.dragActive))
  const over = useStore((s) => s.dragActive && !s.internalDragReq)
  const reduceMotion = useStore((s) => !!s.settings.reduceMotion)
  const [accepted, setAccepted] = useState(false)
  // Once up, the zone stays when the drag goes away without a drop (it left
  // the shelf, was let go elsewhere or cancelled): either the shelf then
  // closes, and the zone stays until the shape has drawn back (320ms) so no
  // cards show through the collapse; or the shelf stays open (the pointer is
  // still on it), and after the close grace has passed (GRACE_MS 250 in
  // useEdgeHover, plus margin) the zone fades and the cards return. A drop
  // hands over to the accept instead.
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (accepted) {
      if (held) setHeld(false)
      return
    }
    if (open && incoming) {
      if (!held) setHeld(true)
      return
    }
    if (!held) return
    const timer = window.setTimeout(() => setHeld(false), open ? 450 : 320)
    return () => window.clearTimeout(timer)
  }, [open, incoming, held, accepted])
  const visible = held || (open && incoming)
  // A drag that opens the shelf opens it straight into the zone: no fade-in then, or the cards showed
  // under the fading zone for a moment, a flicker between the two. Onto an open shelf it fades in.
  const wasOpen = useRef(open)
  const intoZone = open && !wasOpen.current
  useEffect(() => {
    wasOpen.current = open
  }, [open])

  useEffect(() => {
    if (!visible) return
    // Capture phase: the preload's own drop handler stops nothing for drops
    // from other apps, so this sees each of them.
    const onDrop = () => setAccepted(true)
    document.addEventListener('drop', onDrop, true)
    return () => document.removeEventListener('drop', onDrop, true)
  }, [visible])
  // The drop: the zone fades at once, taking it in as it goes (is-accepted: the well draws in, the arrow
  // drops, the zone fades in CSS, panel.css), so the new card comes up under it; it is unmounted only once
  // it has faded. It used to hold for 240ms first, an empty zone after the drop that then cut to the cards.
  useEffect(() => {
    if (!accepted) return
    const timer = window.setTimeout(() => setAccepted(false), reduceMotion ? 0 : ACCEPT_FADE_MS + 40)
    return () => window.clearTimeout(timer)
  }, [accepted, reduceMotion])

  return (
    <AnimatePresence>
      {(visible || accepted) && (
        <motion.div
          key="drop-overlay"
          className={`drop-overlay${isHorizontal ? ' is-horizontal' : ''}${over ? ' is-over' : ''}${accepted ? ' is-accepted' : ''}`}
          initial={{ opacity: intoZone ? 1 : 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.14, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="drop-well">
            <DashedOutline radius={16} />
            <span className="drop-icon">
              <TrayArrowIcon />
            </span>
            <span className="drop-text">
              <span className="drop-title">{t('item.dropToSave')}</span>
              <span className="drop-sub">{t('item.dropToSaveDesc')}</span>
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Detach target while a card is dragged out of an open stack: a soft blue
 * glow coming out of the screen edge where the slim edge bar sits when the
 * shelf is closed (same length, same alignment), fading out toward its ends;
 * with the card over the strip it grows and brightens. The whole strip along
 * that edge takes the drop. lineStart/lineEnd are the edge bar's insets.
 */
function SplitDropZone({ stickPosition = 'left', lineStart, lineEnd }: { stickPosition?: 'left' | 'right' | 'top'; lineStart: string; lineEnd: string }) {
  const internalDragReq = useStore((s) => s.internalDragReq)
  const reduceMotion = useStore((s) => !!s.settings.reduceMotion)
  const isSubitemDragging = !!(
    internalDragReq &&
    (internalDragReq.imageId || (internalDragReq.paths && internalDragReq.paths.length > 0))
  )

  const [isOver, setIsOver] = useState(false)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    setIsOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null
    if (related && e.currentTarget.contains(related)) return
    setIsOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsOver(false)
    const req = useStore.getState().internalDragReq
    if (req && (req.imageId || (req.paths && req.paths.length > 0))) {
      window.edge.splitItem(req)
      useStore.getState().setInternalDragReq(null)
    }
  }

  return (
    <AnimatePresence>
      {isSubitemDragging && (
        <motion.div
          className={`split-dropzone pos-${stickPosition}${isOver ? ' active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            if (!isOver) setIsOver(true)
          }}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.14 }}
        >
          <div
            className="split-bar"
            style={
              stickPosition === 'top'
                ? { left: `max(0px, ${lineStart})`, right: `max(0px, ${lineEnd})` }
                : { top: `max(0px, ${lineStart})`, bottom: `max(0px, ${lineEnd})` }
            }
          >
            <div className={`split-glow side-${stickPosition}`} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
