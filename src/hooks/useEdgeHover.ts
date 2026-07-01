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
 */
import { useEffect, useRef } from 'react'
import { edge } from '../lib/edge'
import { useStore } from '../store/appStore'

const TRIGGER_PX = 3    // leftmost px that count as "the edge"
const DWELL_MS = 120     // cursor must linger this long to open
const GRACE_MS = 250     // close delay after leaving
const PANEL_WIDE = 280   // blade is ~270px (var(--panel-width)); grace margin
/** Hysteresis thresholds for closing the panel.
 * KEEP_OPEN_PX: if cursor x is <= this, the panel stays open (clearly inside blade).
 * START_CLOSE_PX: if cursor x is > this, start the close timer (clearly outside).
 * Gap between the two prevents rapid cancel/schedule oscillation at the blade edge
 * when the cursor hovers just outside the visual boundary.
 */
const KEEP_OPEN_PX = PANEL_WIDE - 30  // 250 — clearly inside blade
const START_CLOSE_PX = PANEL_WIDE + 60 // 340 — clearly outside blade + window margin

export const PANEL_LEAVE_EVENT = 'panel:leave'
export const PANEL_ENTER_EVENT = 'panel:enter'

export function useEdgeHover(): void {
  const open = useStore((s) => s.open)
  const setOpen = useStore((s) => s.setOpen)
  const settings = useStore((s) => s.settings)
  const dragActive = useStore((s) => s.dragActive)
  const setDragActive = useStore((s) => s.setDragActive)
  const internalDragReq = useStore((s) => s.internalDragReq)

  // All reactive values accessed inside events kept in refs so the
  // event-listener effect never needs to restart (restarting cancels timers).
  const openRef = useRef(open)
  openRef.current = open

  const dragActiveRef = useRef(dragActive)
  dragActiveRef.current = dragActive

  const internalDragRef = useRef(!!internalDragReq)
  internalDragRef.current = !!internalDragReq

  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Hot zone and panel bounds, recomputed on resize to avoid reading DOM at 1000Hz
  const zone = useRef({ top: 0, bottom: 0, midY: 0, panelHalfH: 0 })

  // Last known pointer position (updated on every pointermove). Used to vet
  // `panel:leave` events — Framer Motion layout reflows can fire spurious
  // mouseleave events while the cursor never actually left the blade.
  const lastClient = useRef({ x: -1, y: -1 })

  useEffect(() => {
    const recompute = () => {
      const h = window.innerHeight
      const s = settingsRef.current
      const half = h * s.hotZoneHeight / 2
      const panelHalfH = h * (s.panelHeight || 0.5) / 2
      zone.current = { 
        top: h / 2 - half, 
        bottom: h / 2 + half,
        midY: h / 2,
        panelHalfH
      }
    }
    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Single stable effect — deps never change after mount.
  useEffect(() => {
    let dwellTimer: number | undefined
    let graceTimer: number | undefined

    const closePanel = () => {
      if (!openRef.current) return
      if (dragActiveRef.current && !internalDragRef.current) return
      setOpen(false)
      window.setTimeout(() => edge.setInteractive(false), 220)
    }

    const scheduleClose = (delay = GRACE_MS) => {
      if (dragActiveRef.current && !internalDragRef.current) return
      if (graceTimer !== undefined) return // already closing
      graceTimer = window.setTimeout(closePanel, delay)
    }

    const cancelClose = () => {
      if (graceTimer !== undefined) {
        window.clearTimeout(graceTimer)
        graceTimer = undefined
      }
    }

    const openPanel = () => {
      if (openRef.current) return
      cancelClose()
      if (dwellTimer !== undefined) {
        window.clearTimeout(dwellTimer)
        dwellTimer = undefined
      }
      edge.setInteractive(true)
      setOpen(true)
    }

    // ── panel:leave / panel:enter (from Panel.tsx blade div) ──────────────
    // NOTE: `mouseleave` can fire spuriously when Framer Motion's `layout`
    // reflow repositions an exiting child out from under the cursor (e.g. on
    // expand). So we treat `panel:leave` as a *hint* and only actually close
    // if the last known pointer position is genuinely outside the blade.
    const isInsideBlade = () => {
      const { midY, panelHalfH } = zone.current
      const { x, y } = lastClient.current
      if (x < 0) return true // unknown — be conservative, don't close
      return x <= PANEL_WIDE && y >= midY - panelHalfH && y <= midY + panelHalfH
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

    // ── main-process cursor poll (replaces broken pointermove forwarding) ──
    // The main process polls screen.getCursorScreenPoint() every 16ms and
    // sends window:cursor-edge with raw x/y coords. We check the hot zone
    // here with the renderer's own settings so everything stays in sync.
    const unsubCursorEdge = window.edge.onCursorEdge((data) => {
      lastClient.current = { x: data.x, y: data.y }
      const { top, bottom, midY, panelHalfH } = zone.current
      const inEdge = data.x <= TRIGGER_PX
      const inZone = data.y >= top && data.y <= bottom

      // Edge trigger: only start dwell to OPEN when panel is closed.
      // When panel is already open, cursor at x=0 is treated like any other
      // inside-blade position (falls through to insideX check below).
      if (inEdge && inZone && !openRef.current) {
        cancelClose()
        if (dwellTimer === undefined) {
          dwellTimer = window.setTimeout(() => {
            dwellTimer = undefined
            openPanel()
          }, DWELL_MS)
        }
        return
      }

      if (dwellTimer !== undefined) {
        window.clearTimeout(dwellTimer)
        dwellTimer = undefined
      }

      if (!openRef.current) return

      // Hysteresis-based close detection.
      // Using two separate thresholds prevents the oscillation that occurs when
      // the cursor hovers right at the blade edge (x ≈ 280px): a single threshold
      // causes rapid cancel/schedule cycles every 16ms that prevent the grace
      // timer from ever counting down.
      //
      //  x ≤ KEEP_OPEN_PX (250): cursor clearly inside blade → cancel close
      //  x > START_CLOSE_PX (340): cursor clearly outside window → schedule close
      //  250 < x ≤ 340 (dead band): neither action — let existing timer run
      const insideY = data.y >= midY - panelHalfH && data.y <= midY + panelHalfH

      if (data.x <= KEEP_OPEN_PX && insideY) {
        cancelClose()
        return
      }

      if (data.x > START_CLOSE_PX || !insideY) {
        scheduleClose()
      }
      // else: dead band — do nothing, let existing timer expire naturally
    })

    // ── keyboard ───────────────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openRef.current) scheduleClose(0)
    }

    // ── OS file drag awareness ─────────────────────────────────────────────
    const onDocDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        setDragActive(true)
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
        setDragActive(false)
        if (internalDragRef.current) scheduleClose(0)
      }
    }
    const onDocDrop = (e: DragEvent) => {
      e.preventDefault()
      setDragActive(false)
    }
    const onDocDragEnd = (e: DragEvent) => {
      e.preventDefault()
      setDragActive(false)
    }

    // ── register ───────────────────────────────────────────────────────────
    window.addEventListener('keydown', onKeyDown)
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
      window.removeEventListener(PANEL_LEAVE_EVENT, onPanelLeave)
      window.removeEventListener(PANEL_ENTER_EVENT, onPanelEnter)
      document.removeEventListener('dragenter', onDocDragEnter)
      document.removeEventListener('dragover', onDocDragOver)
      document.removeEventListener('dragleave', onDocDragLeave)
      document.removeEventListener('drop', onDocDrop)
      document.removeEventListener('dragend', onDocDragEnd)
      window.clearTimeout(dwellTimer)
      window.clearTimeout(graceTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setOpen, setDragActive])
}
