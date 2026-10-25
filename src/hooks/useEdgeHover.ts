/**
 * useEdgeHover — the heart of the "invisible until you approach the edge" feel.
 *
 * Detection strategy:
 *
 *  OPENING: cursor dwells in the leftmost TRIGGER_PX band within the hot zone.
 *
 *  CLOSING — two complementary mechanisms:
 *
 *  1. panel:leave custom event (primary): Panel.tsx dispatches this event on the
 *     blade div's onMouseLeave. React's mouseleave does NOT bubble through child
 *     elements, so it fires exactly when the cursor leaves the visible black area.
 *     This correctly handles all directions (right, top, bottom) without relying
 *     on Electron's broken document-level pointerleave for transparent windows.
 *
 *  2. Y-axis overshooting (backup): while the cursor is inside the window, we
 *     track whether it has gone above or below the panel's visual bounds via
 *     pointermove. This catches cases where the cursor leaves the panel vertically
 *     before React's mouseleave has a chance to fire.
 *
 *  Drag-awareness: while an external OS file drag is active we never close.
 *  A drag from another app is also seen before it reaches the window (main
 *  flags it on every cursor update): the edge bar gets ready for it, and at
 *  the bar the shelf opens straight into its drop zone (see lib/edgeDrag.ts).
 */
import { useEffect, useRef } from 'react'
import { edge } from '../lib/edge'
import { useStore } from '../store/appStore'
import { normalizeHoverOpenDelay } from '../../shared/types'
import { DRAG_CATCH_DWELL_MS, edgeDragPull, inEdgeDragCatch, setEdgeDragPull, type EdgeDragLane } from '../lib/edgeDrag'

const TRIGGER_PX = 3    // leftmost px that count as "the edge"
const DWELL_MS = 40      // cursor must linger this long to open (base; user delay adds on top)
const GRACE_MS = 250     // close delay after leaving
const PANEL_WIDE = 270   // blade is 270px (var(--panel-width))
/** Hysteresis thresholds for closing the panel.
 * KEEP_OPEN_PX: if cursor x is <= this, the panel stays open (clearly inside blade).
 * START_CLOSE_PX: if cursor x is > this, start the close timer (clearly outside).
 * Gap between the two prevents rapid cancel/schedule oscillation at the blade edge
 * when the cursor hovers just outside the visual boundary.
 */
const KEEP_OPEN_PX = PANEL_WIDE - 15  // 255 — clearly inside blade
const START_CLOSE_PX = PANEL_WIDE + 20 // 290 — 20px buffer outside the visual boundary
const BUFFER_PX = 30                 // 30px overshoot buffer across adjacent monitors
const PREVIEW_WIDE = 740             // Extended width when preview flyout is active
/** Keep-open margin past the flyout's far edge (740 = 270 + 12 + 440 + 18). */
const PREVIEW_EDGE_MARGIN = 18

/**
 * Side docks: how far from the screen edge an open flyout keeps the shelf
 * open. An image preview can be wider than the usual 440px; its flyout
 * publishes how far it reaches, and the zone grows to match (never shrinks).
 */
function flyoutWide(state: ReturnType<typeof useStore.getState>): number {
  const reach = state.previewItemId ? state.previewFlyoutRect?.reach : undefined
  return reach ? Math.max(PREVIEW_WIDE, reach + PREVIEW_EDGE_MARGIN) : PREVIEW_WIDE
}

/** Total dwell before a hover opens the shelf: base + the user's Open Delay setting. */
function dwellMsFor(state: { settings: { hoverOpenDelay?: number } }): number {
  return DWELL_MS + normalizeHoverOpenDelay(state.settings.hoverOpenDelay)
}

export const PANEL_LEAVE_EVENT = 'panel:leave'
export const PANEL_ENTER_EVENT = 'panel:enter'

// How long to keep the panel alive after the user explicitly closes the preview
// via the X button. This prevents the jarring simultaneous collapse of both
// the preview and the clipboard.
const PREVIEW_CLOSE_STAY_MS = 2500

// Module-level flag set by the X button click. useEdgeHover reads this to
// extend the close grace period without needing React state or store updates.
let _previewClosedByUser = false
let _previewClosedTimer: number | undefined

/**
 * Call this from the preview flyout's X button to signal that the user
 * deliberately closed the preview — the clipboard should stay open for a
 * while so they can keep browsing.
 */
export function notifyPreviewClosedByUser(): void {
  _previewClosedByUser = true
  if (_previewClosedTimer !== undefined) window.clearTimeout(_previewClosedTimer)
  _previewClosedTimer = window.setTimeout(() => {
    _previewClosedByUser = false
    _previewClosedTimer = undefined
  }, PREVIEW_CLOSE_STAY_MS)
}

export function getHorizontalDockMetrics(
  displayWidth: number,
  horizontalOffset = 0.5,
  hotZoneHeight = 0.25,
  triggerAlignment: 'top' | 'center' | 'bottom' | 'left' | 'right' = 'center'
) {
  const dockWidth = Math.min(displayWidth - 60, 1080)
  const pad = displayWidth >= dockWidth + 60 ? 30 : 0
  const minX = pad
  const maxX = displayWidth - dockWidth - pad
  const hOffset = Math.min(1, Math.max(0, horizontalOffset))
  const dockX = minX + Math.round(Math.max(0, maxX - minX) * hOffset)
  const dockCenterX = dockX + dockWidth / 2
  // Trigger bar length scales with hotZoneHeight (+25% increase):
  // Small (0.25) => 275px, Medium (0.40) => 400px, Large (0.60) => 575px
  const triggerWidth = Math.round(
    hotZoneHeight >= 0.55 ? 575 : hotZoneHeight >= 0.35 ? 400 : 275
  )
  let triggerLeft = dockCenterX - triggerWidth / 2
  let triggerRight = dockCenterX + triggerWidth / 2

  if (triggerAlignment === 'top' || triggerAlignment === 'left') {
    triggerLeft = dockX
    triggerRight = dockX + triggerWidth
  } else if (triggerAlignment === 'bottom' || triggerAlignment === 'right') {
    triggerLeft = dockX + dockWidth - triggerWidth
    triggerRight = dockX + dockWidth
  }

  return {
    dockWidth,
    dockX,
    dockCenterX,
    triggerWidth,
    triggerLeft,
    triggerRight
  }
}

/** Extra margin around the card menu that still counts as "on the menu". */
const CARD_MENU_BUFFER = 12

/**
 * The main-process cursor poll reports work-area coordinates; the card menu's
 * box is in window (client) coordinates. The window sits at the work area's
 * left edge (left dock), right edge (right dock) or 30px left of the dock
 * (top dock), always at the work area's top.
 */
export function cursorToWindow(
  cursor: { x: number; y: number },
  stickPosition: 'left' | 'right' | 'top' | undefined,
  displayWidth: number,
  windowWidth: number,
  dockX: number
): { x: number; y: number } {
  if (stickPosition === 'right') return { x: cursor.x - (displayWidth - windowWidth), y: cursor.y }
  if (stickPosition === 'top') return { x: cursor.x - (dockX - 30), y: cursor.y }
  return { x: cursor.x, y: cursor.y }
}

/**
 * True while the card menu (or the note editor it turns into) holds the shelf
 * open for this cursor: only while the pointer is on it. Leaving both the
 * shelf and the menu closes the shelf like any other leave; an open editor
 * saves what was typed as it closes (setOpen in the store) and the keyboard
 * goes back to the app that had it.
 */
export function cardMenuHolds(
  menu: { mode: 'menu' | 'edit' } | null,
  rect: { left: number; top: number; right: number; bottom: number } | null,
  point: { x: number; y: number }
): boolean {
  if (!menu || !rect) return false
  return (
    point.x >= rect.left - CARD_MENU_BUFFER &&
    point.x <= rect.right + CARD_MENU_BUFFER &&
    point.y >= rect.top - CARD_MENU_BUFFER &&
    point.y <= rect.bottom + CARD_MENU_BUFFER
  )
}

export function useEdgeHover(): void {
  // Throttle the self-healing setInteractive(true) call.
  // Without this, it fires at 60Hz (every 16ms) via the cursor-edge poll,
  // flooding the IPC queue and starving the messages that open the panel.
  const lastSetInteractiveRef = useRef(0)

  // Track active display dimensions (received from main process cursor poll)
  const displaySize = useRef({
    width: typeof window !== 'undefined' && window.screen ? window.screen.width : 1920,
    height: typeof window !== 'undefined' && window.screen ? window.screen.height : 1080
  })

  // Hot zone and panel bounds, recomputed on resize to avoid reading DOM at 1000Hz
  const zone = useRef<{
    top: number
    bottom: number
    midY: number
    panelHalfH: number
    left?: number
    right?: number
    midX?: number
    panelHalfW?: number
    dockW?: number
  }>({ top: 0, bottom: 0, midY: 0, panelHalfH: 0 })

  // Last known pointer position (updated on every pointermove). Used to vet
  // `panel:leave` events — Framer Motion layout reflows can fire spurious
  // mouseleave events while the cursor never actually left the blade.
  const lastClient = useRef({ x: -1, y: -1 })

  useEffect(() => {
    const recompute = () => {
      const h = window.innerHeight
      const s = useStore.getState().settings
      const isHorizontal = s.stickPosition === 'top'

      const pFrac = s.panelHeight || 0.6
      const panelH = h * pFrac
      const minY = panelH / 2
      const maxY = h - panelH / 2
      const vOffset = s.verticalOffset ?? 0.5
      const midY = minY + vOffset * (maxY - minY)

      const alignment = s.triggerAlignment || 'center'
      const panelTop = midY - panelH / 2
      const panelBottom = midY + panelH / 2
      const triggerH = Math.min(panelH, h * (s.hotZoneHeight || 0.25))

      let top = midY - triggerH / 2
      let bottom = midY + triggerH / 2

      if (alignment === 'top') {
        top = panelTop
        bottom = panelTop + triggerH
      } else if (alignment === 'bottom') {
        top = panelBottom - triggerH
        bottom = panelBottom
      }

      // Horizontal dock bounds (for top/bottom) — calculated in DISPLAY coordinates
      const dispW = displaySize.current.width
      const dockMetrics = getHorizontalDockMetrics(dispW, s.horizontalOffset ?? 0.5, s.hotZoneHeight ?? 0.25, s.triggerAlignment || 'center')
      const left = dockMetrics.triggerLeft
      const right = dockMetrics.triggerRight
      const midX = dockMetrics.dockCenterX
      const dockW = dockMetrics.dockWidth
      const panelHalfW = dockW / 2 + 24

      const panelHalfH = isHorizontal ? 120 : panelH / 2 + 24
      zone.current = { 
        top, 
        bottom,
        midY,
        panelHalfH,
        left,
        right,
        midX,
        panelHalfW,
        dockW
      }
    }
    recompute()
    window.addEventListener('resize', recompute)
    const unsubStore = useStore.subscribe((state, prevState) => {
      if (
        state.settings.panelHeight !== prevState.settings.panelHeight ||
        state.settings.hotZoneHeight !== prevState.settings.hotZoneHeight ||
        state.settings.verticalOffset !== prevState.settings.verticalOffset ||
        state.settings.horizontalOffset !== prevState.settings.horizontalOffset ||
        state.settings.stickPosition !== prevState.settings.stickPosition ||
        state.settings.triggerAlignment !== prevState.settings.triggerAlignment
      ) {
        recompute()
      }
    })
    return () => {
      window.removeEventListener('resize', recompute)
      unsubStore()
    }
  }, [])

  // Single stable effect — deps never change after mount.
  useEffect(() => {
    let dwellTimer: number | undefined
    let graceTimer: number | undefined
    let interactiveTimer: number | undefined
    let dragOpenTimer: number | undefined

    const closePanelNow = () => {
      const s = useStore.getState()
      if (s.styleFlyoutOpen) s.setStyleFlyoutOpen(false)
      if (s.languageFlyoutOpen) s.setLanguageFlyoutOpen(false)
      s.setOpen(false)
      if (interactiveTimer !== undefined) window.clearTimeout(interactiveTimer)
      interactiveTimer = window.setTimeout(() => {
        interactiveTimer = undefined
        if (!useStore.getState().open) edge.setInteractive(false)
      }, 300)
    }

    const closePanel = () => {
      const state = useStore.getState()
      if (!state.open) return
      if (state.sliderActive || state.edgeTransition?.active) return
      if (state.dragActive && !state.internalDragReq) return

      // If any flyout is open, let it play its exit spring first.
      // The Electron window resize (inside setOpen) would cut the flyout animation
      // in half if we close both simultaneously — so we sequence it properly.
      if (state.styleFlyoutOpen || state.languageFlyoutOpen) {
        if (state.styleFlyoutOpen) state.setStyleFlyoutOpen(false)
        if (state.languageFlyoutOpen) state.setLanguageFlyoutOpen(false)
        if (graceTimer !== undefined) window.clearTimeout(graceTimer)
        graceTimer = window.setTimeout(() => {
          graceTimer = undefined
          if (!useStore.getState().open) return // already closed by another path
          closePanelNow()
        }, 300)
        return
      }

      // If the preview screen is open, close the preview screen first,
      // and after a delay let the main clipboard panel start retracting.
      if (state.previewItemId) {
        state.setPreviewItemId(null)
        if (graceTimer !== undefined) window.clearTimeout(graceTimer)
        graceTimer = window.setTimeout(() => {
          graceTimer = undefined
          if (!useStore.getState().open) return
          closePanelNow()
        }, 300)
        return
      }

      closePanelNow()
    }

    const scheduleClose = (delay = GRACE_MS) => {
      const state = useStore.getState()
      if (state.sliderActive || state.edgeTransition?.active) return
      if (state.dragActive && !state.internalDragReq) return
      if (graceTimer !== undefined) return // already closing

      // If position/display/slider was recently changed (< 1.75s ago), wait out remaining preview stay window
      const timeSincePositionChange = state.sliderReleasedTime > 0 ? Date.now() - state.sliderReleasedTime : Infinity
      let effectiveDelay = delay

      if (timeSincePositionChange < 1750) {
        effectiveDelay = Math.max(delay, 1750 - timeSincePositionChange)
      } else if (_previewClosedByUser) {
        effectiveDelay = PREVIEW_CLOSE_STAY_MS
      }
      // The card menu just closed (an action, Escape, a click outside): it
      // may have left the pointer outside the blade, so give it a moment to
      // come back before the shelf closes.
      const menuStayLeft = state.cardMenuStayUntil - Date.now()
      if (menuStayLeft > 0) effectiveDelay = Math.max(effectiveDelay, menuStayLeft)

      graceTimer = window.setTimeout(closePanel, effectiveDelay)
    }

    const cancelClose = () => {
      if (graceTimer !== undefined) {
        window.clearTimeout(graceTimer)
        graceTimer = undefined
      }
      if (interactiveTimer !== undefined) {
        window.clearTimeout(interactiveTimer)
        interactiveTimer = undefined
      }
      // User re-entered the clipboard — clear the preview grace period flags only
      // after the 1750ms position-changed stay window has completed, so the panel
      // does not close prematurely during edge or display transitions.
      const state = useStore.getState()
      const elapsed = state.sliderReleasedTime > 0 ? Date.now() - state.sliderReleasedTime : Infinity
      if (elapsed >= 1750) {
        state.resetPositionChangedTime()
      }
      // Back inside: the post-menu grace has done its job.
      state.clearCardMenuStay()
      if (_previewClosedByUser) {
        _previewClosedByUser = false
        if (_previewClosedTimer !== undefined) {
          window.clearTimeout(_previewClosedTimer)
          _previewClosedTimer = undefined
        }
      }
    }

    const openPanel = () => {
      cancelClose()
      if (dwellTimer !== undefined) {
        window.clearTimeout(dwellTimer)
        dwellTimer = undefined
      }
      if (interactiveTimer !== undefined) {
        window.clearTimeout(interactiveTimer)
        interactiveTimer = undefined
      }
      // Sequence the open across two steps so the OS/DWM surface work
      // (click-through off + always-on-top re-assert over IPC) starts before
      // the React clip-path/spring commit. Previously both fired in the same
      // tick, so DWM recomposition contended with layout + first-paint work
      // and the first open after launch visibly hitched. No visual change:
      // the same two calls run in the same order, one frame apart.
      try {
        void (edge.setInteractive(true) as unknown as Promise<void>)?.catch?.(() => {})
      } catch { /* ignore IPC errors; close path still governs state */ }
      if (useStore.getState().open) return
      const commitOpen = () => {
        if (useStore.getState().open) return
        useStore.getState().setOpen(true)
      }
      try {
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => commitOpen())
        } else {
          commitOpen()
        }
      } catch {
        commitOpen()
      }
    }

    // ── panel:leave / panel:enter (from Panel.tsx blade div) ──────────────
    // NOTE: `mouseleave` can fire spuriously when Framer Motion's `layout`
    // reflow repositions an exiting child out from under the cursor (e.g. on
    // expand). So we treat `panel:leave` as a *hint* and only actually close
    // if the last known pointer position is genuinely outside the blade.
    const cursorInWindow = (state: ReturnType<typeof useStore.getState>, point: { x: number; y: number }) => {
      const s = state.settings
      const dispW = displaySize.current.width
      const dockX = s.stickPosition === 'top'
        ? getHorizontalDockMetrics(dispW, s.horizontalOffset ?? 0.5, s.hotZoneHeight ?? 0.25, s.triggerAlignment || 'center').dockX
        : 0
      return cursorToWindow(point, s.stickPosition, dispW, window.innerWidth, dockX)
    }

    const isInsideBlade = () => {
      const state = useStore.getState()
      if (state.sliderActive || state.edgeTransition?.active) return true
      if (state.cardMenu && cardMenuHolds(state.cardMenu, state.cardMenuRect, cursorInWindow(state, lastClient.current))) return true
      const timeSincePositionChange = state.sliderReleasedTime > 0 ? Date.now() - state.sliderReleasedTime : Infinity
      if (timeSincePositionChange < 1750) return true

      const { x, y } = lastClient.current
      if (x < -BUFFER_PX || y < 0) return true // unknown — be conservative, don't close
      const s = state.settings
      const hasFlyout = !!(state.previewItemId || state.styleFlyoutOpen || state.languageFlyoutOpen)
      const currentPanelWide = hasFlyout ? flyoutWide(state) : PANEL_WIDE

      if (s.stickPosition === 'top') {
        const dispW = displaySize.current.width
        const { dockWidth, dockX } = getHorizontalDockMetrics(dispW, s.horizontalOffset ?? 0.5, s.hotZoneHeight ?? 0.25, s.triggerAlignment || 'center')
        const bladeHeight = 218
        const inBlade = y >= -BUFFER_PX && y <= bladeHeight && x >= dockX - BUFFER_PX && x <= dockX + dockWidth + BUFFER_PX
        if (inBlade) return true
        if (hasFlyout && state.previewFlyoutRect && state.previewFlyoutRect.left !== undefined && state.previewFlyoutRect.right !== undefined) {
          const FLYOUT_BUFFER = 24
          const flyoutScreenLeft = dockX + state.previewFlyoutRect.left
          const flyoutScreenRight = dockX + state.previewFlyoutRect.right
          const inFlyout = y >= (state.previewFlyoutRect.top - FLYOUT_BUFFER) &&
            y <= (state.previewFlyoutRect.bottom + FLYOUT_BUFFER) &&
            x >= flyoutScreenLeft - FLYOUT_BUFFER && x <= flyoutScreenRight + FLYOUT_BUFFER
          if (inFlyout) return true
        }
        return false
      }

      let insideX = false
      if (s.stickPosition === 'right') {
        insideX = x >= window.innerWidth - currentPanelWide - BUFFER_PX && x <= window.innerWidth + BUFFER_PX
      } else {
        insideX = x >= -BUFFER_PX && x <= currentPanelWide + BUFFER_PX
      }
      if (!insideX) return false

      const inPreviewCol = s.stickPosition === 'right'
        ? x < window.innerWidth - KEEP_OPEN_PX
        : x > KEEP_OPEN_PX

      if (inPreviewCol && hasFlyout && state.previewFlyoutRect) {
        const FLYOUT_BUFFER = 24
        return y >= state.previewFlyoutRect.top - FLYOUT_BUFFER && y <= state.previewFlyoutRect.bottom + FLYOUT_BUFFER
      }

      const { midY, panelHalfH } = zone.current
      return y >= midY - panelHalfH && y <= midY + panelHalfH
    }

    const onPanelLeave = () => {
      if (isInsideBlade()) {
        cancelClose()
        return
      }
      scheduleClose()
    }

    const onPanelEnter = () => {
      cancelClose()
    }

    let edgeHintTimer: number | undefined
    let edgeHintFired = false

    const triggerEdgeHint = () => {
      if (edgeHintFired) return
      edgeHintFired = true
      const s = useStore.getState()
      s.setEdgeHintActive(true)
      if (edgeHintTimer !== undefined) window.clearTimeout(edgeHintTimer)
      edgeHintTimer = window.setTimeout(() => {
        edgeHintTimer = undefined
        useStore.getState().setEdgeHintActive(false)
      }, 450)
    }

    // ── main-process cursor poll (replaces broken pointermove forwarding) ──
    // The main process polls screen.getCursorScreenPoint() every 16ms and
    // sends window:cursor-edge with raw x/y coords. We check the hot zone
    // here with the renderer's own settings so everything stays in sync.
    const clearDragOpen = () => {
      if (dragOpenTimer !== undefined) {
        window.clearTimeout(dragOpenTimer)
        dragOpenTimer = undefined
      }
    }

    const unsubCursorEdge = window.edge.onCursorEdge((data) => {
      lastClient.current = { x: data.x, y: data.y }
      if (data.displayWidth) displaySize.current.width = data.displayWidth
      if (data.displayHeight) displaySize.current.height = data.displayHeight
      const state = useStore.getState()
      const { stickPosition, displayWidth } = data
      const { top, bottom, midY, panelHalfH } = zone.current

      // ── A drag from another app (anywhere on screen) ─────────────────────
      // Follows the hover setting: with hover opening off, cursor moves never
      // open the shelf, dragged or not.
      const drag = !!data.drag && !state.internalDragReq && (state.settings.hoverActivation ?? true)
      if (state.externalDrag !== drag) state.setExternalDrag(drag)
      if (drag && !state.open) {
        const dispW = displayWidth || displaySize.current.width
        const s = state.settings
        const bar = stickPosition === 'top'
          ? getHorizontalDockMetrics(dispW, s.horizontalOffset ?? 0.5, s.hotZoneHeight ?? 0.25, s.triggerAlignment || 'center')
          : null
        const lane: EdgeDragLane = bar
          ? { stickPosition: 'top', start: bar.triggerLeft, end: bar.triggerRight, displayWidth: dispW }
          : { stickPosition: stickPosition === 'right' ? 'right' : 'left', start: top, end: bottom, displayWidth: dispW }
        setEdgeDragPull(edgeDragPull(lane, data.x, data.y))
        if (inEdgeDragCatch(lane, data.x, data.y)) {
          if (dragOpenTimer === undefined) {
            dragOpenTimer = window.setTimeout(() => {
              dragOpenTimer = undefined
              if (useStore.getState().externalDrag) openPanel()
            }, DRAG_CATCH_DWELL_MS)
          }
        } else {
          clearDragOpen()
        }
      } else {
        clearDragOpen()
        if (!drag) setEdgeDragPull(0)
      }

      // The card menu (or its note editor) is part of the shelf while the pointer is on it.
      if (state.open && state.cardMenu && cardMenuHolds(state.cardMenu, state.cardMenuRect, cursorInWindow(state, data))) {
        const now = Date.now()
        if (now - lastSetInteractiveRef.current > 2000) {
          lastSetInteractiveRef.current = now
          edge.setInteractive(true)
        }
        cancelClose()
        return
      }
      const hasFlyout = !!(state.previewItemId || state.styleFlyoutOpen || state.languageFlyoutOpen)
      const currentKeepOpenPx = hasFlyout ? flyoutWide(state) - 15 : KEEP_OPEN_PX
      const currentStartClosePx = hasFlyout ? flyoutWide(state) + 20 : START_CLOSE_PX

      switch (stickPosition) {
        case 'top': {
          const distFromTop = data.y
          const triggerDepth = Math.max(state.settings.hotZoneWidth ?? 3, 1)
          const inEdgeNear = distFromTop >= -BUFFER_PX && distFromTop <= (triggerDepth + 25)
          const dispW = displayWidth || displaySize.current.width
          const { dockWidth, dockX, triggerLeft, triggerRight } = getHorizontalDockMetrics(dispW, state.settings.horizontalOffset ?? 0.5, state.settings.hotZoneHeight ?? 0.25, state.settings.triggerAlignment || 'center')
          const inZone = data.x >= triggerLeft && data.x <= triggerRight

          if (!inEdgeNear) {
            edgeHintFired = false
          }

          const isHoverEnabled = state.settings.hoverActivation ?? true

          if (inEdgeNear && !inZone && !state.open && isHoverEnabled && (state.settings.showEdgeLocationHint ?? false)) {
            triggerEdgeHint()
          }

          if (distFromTop >= -BUFFER_PX && distFromTop <= triggerDepth && inZone && !state.open && isHoverEnabled) {
            if (state.edgeHintActive) state.setEdgeHintActive(false)
            cancelClose()
            if (dwellTimer === undefined) {
              dwellTimer = window.setTimeout(() => {
                dwellTimer = undefined
                openPanel()
              }, dwellMsFor(state))
            }
            return
          }

          if (dwellTimer !== undefined) {
            window.clearTimeout(dwellTimer)
            dwellTimer = undefined
          }

          if (!state.open) return
          if (state.edgeHintActive) state.setEdgeHintActive(false)

          const now = Date.now()
          if (now - lastSetInteractiveRef.current > 2000) {
            lastSetInteractiveRef.current = now
            edge.setInteractive(true)
          }

          const baseBladeH = 218
          const keepOpenDepth = baseBladeH
          const startCloseDepth = baseBladeH + 40
          const insideX = data.x >= dockX - BUFFER_PX && data.x <= dockX + dockWidth + BUFFER_PX
          const outsideX = data.x < dockX - (BUFFER_PX + 40) || data.x > dockX + dockWidth + (BUFFER_PX + 40)

          let inFlyout = false
          if (hasFlyout && state.previewFlyoutRect && state.previewFlyoutRect.left !== undefined && state.previewFlyoutRect.right !== undefined) {
            const FLYOUT_BUFFER = 24
            const flyoutScreenLeft = dockX + state.previewFlyoutRect.left
            const flyoutScreenRight = dockX + state.previewFlyoutRect.right
            inFlyout = distFromTop >= (state.previewFlyoutRect.top - FLYOUT_BUFFER) &&
              distFromTop <= (state.previewFlyoutRect.bottom + FLYOUT_BUFFER) &&
              data.x >= flyoutScreenLeft - FLYOUT_BUFFER && data.x <= flyoutScreenRight + FLYOUT_BUFFER
          }

          if ((distFromTop >= -BUFFER_PX && distFromTop <= keepOpenDepth && insideX) || inFlyout) {
            cancelClose()
            return
          }

          if (distFromTop > startCloseDepth || distFromTop < -BUFFER_PX || outsideX) {
            scheduleClose()
          }
          break
        }

        case 'right': {
          const distFromRight = displayWidth - data.x
          const inEdgeNear = distFromRight >= -BUFFER_PX && distFromRight <= (TRIGGER_PX + 25)
          const inZone = data.y >= top && data.y <= bottom

          if (!inEdgeNear) {
            edgeHintFired = false
          }

          const isHoverEnabled = state.settings.hoverActivation ?? true

          if (inEdgeNear && !inZone && !state.open && isHoverEnabled && (state.settings.showEdgeLocationHint ?? false)) {
            triggerEdgeHint()
          }

          if (distFromRight >= -BUFFER_PX && distFromRight <= TRIGGER_PX && inZone && !state.open && isHoverEnabled) {
            if (state.edgeHintActive) state.setEdgeHintActive(false)
            cancelClose()
            if (dwellTimer === undefined) {
              dwellTimer = window.setTimeout(() => {
                dwellTimer = undefined
                openPanel()
              }, dwellMsFor(state))
            }
            return
          }

          if (dwellTimer !== undefined) {
            window.clearTimeout(dwellTimer)
            dwellTimer = undefined
          }

          if (!state.open) return

          if (state.edgeHintActive) state.setEdgeHintActive(false)

          const now = Date.now()
          if (now - lastSetInteractiveRef.current > 2000) {
            lastSetInteractiveRef.current = now
            edge.setInteractive(true)
          }

          const inPreviewColumn = distFromRight > KEEP_OPEN_PX
          let insideY = false
          if (inPreviewColumn && hasFlyout && state.previewFlyoutRect) {
            const FLYOUT_BUFFER = 24
            insideY = data.y >= state.previewFlyoutRect.top - FLYOUT_BUFFER && data.y <= state.previewFlyoutRect.bottom + FLYOUT_BUFFER
          } else {
            insideY = data.y >= midY - panelHalfH && data.y <= midY + panelHalfH
          }

          if (distFromRight >= -BUFFER_PX && distFromRight <= currentKeepOpenPx && insideY) {
            cancelClose()
            return
          }

          if (distFromRight > currentStartClosePx || distFromRight < -BUFFER_PX || !insideY) {
            scheduleClose()
          }
          break
        }

        // left
        default: {
          const inEdgeNear = data.x >= -BUFFER_PX && data.x <= (TRIGGER_PX + 25)
          const inZone = data.y >= top && data.y <= bottom

          if (!inEdgeNear) {
            edgeHintFired = false
          }

          const isHoverEnabled = state.settings.hoverActivation ?? true

          if (inEdgeNear && !inZone && !state.open && isHoverEnabled && (state.settings.showEdgeLocationHint ?? false)) {
            triggerEdgeHint()
          }

          if (data.x >= -BUFFER_PX && data.x <= TRIGGER_PX && inZone && !state.open && isHoverEnabled) {
            if (state.edgeHintActive) state.setEdgeHintActive(false)
            cancelClose()
            if (dwellTimer === undefined) {
              dwellTimer = window.setTimeout(() => {
                dwellTimer = undefined
                openPanel()
              }, dwellMsFor(state))
            }
            return
          }

          if (dwellTimer !== undefined) {
            window.clearTimeout(dwellTimer)
            dwellTimer = undefined
          }

          if (!state.open) return

          if (state.edgeHintActive) state.setEdgeHintActive(false)

          const now = Date.now()
          if (now - lastSetInteractiveRef.current > 2000) {
            lastSetInteractiveRef.current = now
            edge.setInteractive(true)
          }

          const inPreviewColumn = data.x > KEEP_OPEN_PX
          let insideY = false
          if (inPreviewColumn && hasFlyout && state.previewFlyoutRect) {
            const FLYOUT_BUFFER = 24
            insideY = data.y >= state.previewFlyoutRect.top - FLYOUT_BUFFER && data.y <= state.previewFlyoutRect.bottom + FLYOUT_BUFFER
          } else {
            insideY = data.y >= midY - panelHalfH && data.y <= midY + panelHalfH
          }

          if (data.x >= -BUFFER_PX && data.x <= currentKeepOpenPx && insideY) {
            cancelClose()
            return
          }

          if (data.x > currentStartClosePx || data.x < -BUFFER_PX || !insideY) {
            scheduleClose()
          }
        }
      }
    })

    // ── keyboard ───────────────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      // Never close the panel while the user is typing in a text field
      // (search owns Escape: clear, then blur).
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === 'Escape' && useStore.getState().open) scheduleClose(0)
    }

    // ── window blur (Alt+Tab / OS focus stolen) ────────────────────────────
    // When the user presses Alt+Tab or any other mechanism gives focus to
    // another OS window, the Electron renderer fires a native `blur` event on
    // the global `window` object. Because the Edge-Drop window is `focusable:
    // false`, the cursor-poll path never learns that the app lost OS focus —
    // the cursor position it last saw was still "inside the blade", so
    // isInsideBlade() keeps returning true and the panel is stuck open.
    //
    // Listening for `window.blur` here catches the exact moment the OS
    // switches focus away and immediately force-closes the panel with a tiny
    // grace period so the animation is not jarring (e.g. user Alt+Tabs to
    // quickly read something and comes back — 400 ms gives them a moment).
    const onWindowBlur = () => {
      const state = useStore.getState()
      if (!state.open) return
      // Don't close during an external OS file drag — the drag surface may
      // temporarily shift focus to the OS drag-ghost or file manager.
      if (state.dragActive && !state.internalDragReq) return
      scheduleClose(400)
    }

    // ── OS file drag awareness ─────────────────────────────────────────────
    const onDocDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        useStore.getState().setDragActive(true)
        openPanel()
      }
    }
    const onDocDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        cancelClose()
      }
    }
    const onDocDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) {
        useStore.getState().setDragActive(false)
        if (useStore.getState().internalDragReq) scheduleClose(0)
      }
    }
    const onDocDrop = (e: DragEvent) => {
      e.preventDefault()
      useStore.getState().setDragActive(false)
    }
    const onDocDragEnd = (e: DragEvent) => {
      e.preventDefault()
      useStore.getState().setDragActive(false)
    }

    // ── register ───────────────────────────────────────────────────────────
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onWindowBlur)
    window.addEventListener(PANEL_LEAVE_EVENT, onPanelLeave)
    window.addEventListener(PANEL_ENTER_EVENT, onPanelEnter)
    document.addEventListener('dragenter', onDocDragEnter)
    document.addEventListener('dragover', onDocDragOver)
    document.addEventListener('dragleave', onDocDragLeave)
    document.addEventListener('drop', onDocDrop)
    document.addEventListener('dragend', onDocDragEnd)

    return () => {
      unsubCursorEdge()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onWindowBlur)
      window.removeEventListener(PANEL_LEAVE_EVENT, onPanelLeave)
      window.removeEventListener(PANEL_ENTER_EVENT, onPanelEnter)
      document.removeEventListener('dragenter', onDocDragEnter)
      document.removeEventListener('dragover', onDocDragOver)
      document.removeEventListener('dragleave', onDocDragLeave)
      document.removeEventListener('drop', onDocDrop)
      document.removeEventListener('dragend', onDocDragEnd)
      window.clearTimeout(dwellTimer)
      window.clearTimeout(graceTimer)
      window.clearTimeout(interactiveTimer)
      window.clearTimeout(dragOpenTimer)
    }
  }, [])
}
