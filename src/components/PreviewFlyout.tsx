import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react'
import { useStore } from '../store/appStore'
import { formatBytes, formatImageDisplayName, relativeTime } from '../lib/format'
import { getFileKind, kindBadge } from '../lib/fileType'
import { FileKindIcon, FolderOpenIcon, CopyIcon, CheckIcon, ExternalLinkIcon, CloseIcon, GlobeIcon, TypeIcon, ImageIcon, PaletteIcon, FilesIcon } from './icons'
import { cleanLink, externalHref, parseUrlPreview } from '../lib/urlPreview'
import { localizeLinkInfo } from '../lib/linkLabels'
import { colorFormats, parseColor } from '../lib/colorUtils'
import { fitPreviewImage, type PreviewImageFit } from '../lib/previewImageFit'
import { detectCode } from '../lib/codeDetect'
import { CodeBlock } from './CodeBlock'
import { createPortal } from 'react-dom'
import { useAdaptiveSpring } from '../hooks/useAdaptiveSpring'
import { usePresence } from '../hooks/usePresence'
import { useDragOut } from '../hooks/useDragOut'
import { tryPaste } from '../lib/tryPaste'
import { playButtonClickSound, playToggleSound } from '../lib/soundEffects'
import '../styles/previewFlyout.css'

import { useTranslation, t } from '../i18n'

/**
 * How long the close animation runs (previewFlyout.css, `is-leaving`). The
 * shell stays mounted this long; then the window may leave preview mode.
 */
export const PREVIEW_EXIT_MS = 170
/** Batch bar close animation (previewFlyout.css, `.pf-batch.is-leaving`). */
const BATCH_EXIT_MS = 140

/** Normal flyout width (every kind but large images). */
const FLYOUT_W = 440
/** Blade width (var(--panel-width)) and the flyout's gap to it. */
const PANEL_W = 270
const FLYOUT_GAP = 12
/**
 * Side docks: the window is this wide while previewing (main/window.ts,
 * getStickGeometry), so a flyout may reach this far from the screen edge
 * with a gap to spare.
 */
const PREVIEW_WINDOW_W = 820
const SIDE_FLYOUT_MAX_W = PREVIEW_WINDOW_W - PANEL_W - 2 * FLYOUT_GAP
/** Top dock: widest an image flyout gets (the dock itself is up to 1080). */
const TOP_FLYOUT_MAX_W = 760
/** Header (14 + 30) and body padding (14 + 20) around an image. */
const IMAGE_CHROME_H = 78
const BODY_SIDE_PADDING = 40

/** Rough height of the note above the content (up to 120 characters wrap to ~3 lines). */
function metaHeight(item: any): number {
  const note: string | undefined = item?.note
  if (!note) return 0
  return 14 + 20 * Math.min(3, Math.ceil(note.length / 46))
}

/** Same soft spring as the CSS open, for the slide when the anchor card moves. */
const PF_SPRING = 'linear(0, 0.0172, 0.0616, 0.1238, 0.1968, 0.275, 0.3545, 0.4322, 0.5062, 0.5751, 0.6381, 0.6948, 0.7453, 0.7896, 0.828, 0.8611, 0.8892, 0.9128, 0.9326, 0.9488, 0.9621, 0.9728, 0.9813, 0.988, 0.9932, 0.9971, 1, 1.002, 1.0034, 1.0043, 1.0048, 1.005, 1.005, 1.0048, 1.0045, 1.0042, 1.0038, 1.0034, 1.003, 1.0026, 1)'

export function PreviewFlyout({ isRight }: { isRight: boolean }) {
  const { t } = useTranslation()
  const previewItemId = useStore((s) => s.previewItemId)
  const items = useStore((s) => s.items)
  const settings = useStore((s) => s.settings)
  const adaptiveSpring = useAdaptiveSpring()

  const liveItem = previewItemId ? items.find((i) => i.id === previewItemId) ?? null : null
  // While the close animation plays, keep drawing the item that was open.
  const lastItemRef = useRef(liveItem)
  if (liveItem) lastItemRef.current = liveItem
  const presence = usePresence(!!liveItem, PREVIEW_EXIT_MS, () => {
    if (!useStore.getState().previewItemId) {
      window.edge.setPreviewMode(false)
    }
  })
  const item = liveItem ?? (presence.mounted ? lastItemRef.current : null)
  const leaving = presence.leaving

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
  // Top dock: the window grows to its preview height (min(work area - 20,
  // 720), main/geometry.ts) only after this first render; size for that.
  const availH = typeof window !== 'undefined' && window.screen?.availHeight ? window.screen.availHeight : screenH
  const topWindowH = Math.max(screenH, Math.min(availH - 20, 720))
  const maxFlyoutHeight = isHorizontal ? Math.min(460, Math.max(200, topWindowH - 240)) : Math.max(100, panelH - 24)

  // Images get a flyout sized to them (wider for screenshots, scrolling for
  // long ones, never blown up); everything else is the normal width.
  const imageFit: PreviewImageFit | null = item?.data.kind === 'image'
    ? fitPreviewImage(item.data.width, item.data.height, {
        minFlyoutWidth: FLYOUT_W,
        maxFlyoutWidth: isHorizontal ? Math.max(FLYOUT_W, Math.min(TOP_FLYOUT_MAX_W, dockWidth - 24)) : SIDE_FLYOUT_MAX_W,
        maxImageHeight: maxFlyoutHeight - IMAGE_CHROME_H - metaHeight(item),
        sidePadding: BODY_SIDE_PADDING,
        devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      })
    : null
  const flyoutWidth = imageFit?.flyoutWidth ?? FLYOUT_W

  const dockLeft = Math.round((screenW - dockWidth) / 2)
  // Closing clears the card's rect in the store at once; keep the last one
  // while the exit plays, or the flyout would jump to its fallback spot
  // (the middle of the dock) before it fades.
  const liveItemRect = useStore((s) => s.previewItemRect)
  const lastItemRectRef = useRef(liveItemRect)
  if (liveItem) lastItemRectRef.current = liveItemRect
  const previewItemRect = liveItem ? liveItemRect : lastItemRectRef.current
  const cardCenterXInBlade = previewItemRect?.x !== undefined
    ? (previewItemRect.x + (previewItemRect.width || 210) / 2) - dockLeft
    : dockWidth / 2
  const minLeft = 12
  const maxLeft = Math.max(minLeft, dockWidth - flyoutWidth - 12)
  const flyoutLeft = Math.max(minLeft, Math.min(maxLeft, Math.round(cardCenterXInBlade - flyoutWidth / 2)))

  // Grow out of the card that was previewed: the scale's fixed point sits on
  // the card's side of the flyout, level with (or under) the card.
  const transformOrigin = (() => {
    const r = previewItemRect
    if (isHorizontal) {
      const ox = Math.max(0, Math.min(flyoutWidth, Math.round(cardCenterXInBlade - flyoutLeft)))
      return `${ox}px 0px`
    }
    const oy = r?.y !== undefined
      ? `${Math.max(0, Math.min(panelH, Math.round(r.y + (r.height || 0) / 2 - panelTop)))}px`
      : '50%'
    return `${isRight ? '100%' : '0%'} ${oy}`
  })()

  // Top dock: previewing another card moves the flyout under it. Slide it
  // there (FLIP on `translate`, compositor-run) instead of jumping.
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const prevLeftRef = useRef<number | null>(null)
  useLayoutEffect(() => {
    const prev = prevLeftRef.current
    prevLeftRef.current = item && !leaving ? flyoutLeft : null
    const el = wrapRef.current
    if (!el || prev === null || !isHorizontal || reduceMotion || leaving) return
    const dx = prev - flyoutLeft
    if (Math.abs(dx) < 1 || typeof el.animate !== 'function') return
    el.animate([{ translate: `${dx}px 0` }, { translate: '0 0' }], { duration: 460, easing: PF_SPRING })
  }, [item?.id, flyoutLeft, leaving, isHorizontal, reduceMotion])

  const [dragOver, setDragOver] = useState(false)
  const flyoutRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // liveItem, not item: the hover keep-alive zone goes the moment the
    // preview closes, not after the exit animation.
    if (!liveItem || !flyoutRef.current) {
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
        useStore.getState().setPreviewFlyoutRect({ top, bottom: top + h, reach: PANEL_W + FLYOUT_GAP + flyoutWidth })
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
  }, [liveItem?.id, panelTop, panelH, isHorizontal, isTop, dockLeft, flyoutLeft, flyoutWidth])

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
    if (liveItem && activeDrag && activeDrag.id !== liveItem.id) {
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
    if (liveItem && activeDrag && activeDrag.id !== liveItem.id) {
      await window.edge.mergeItems(activeDrag.id, liveItem.id)
      useStore.getState().setInternalDragReq(null)
    }
  }

  // ── Multi-selection state (Option 1: Tap-to-toggle) ────────────────────────
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  // Reset selection whenever preview item changes or closes
  useEffect(() => {
    setSelectedKeys(new Set())
  }, [liveItem?.id])

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

  // The batch bar plays its own close; keep its last count while it does.
  const batch = usePresence(selectedKeys.size > 0, BATCH_EXIT_MS)
  const lastSelCountRef = useRef(0)
  if (selectedKeys.size > 0) lastSelCountRef.current = selectedKeys.size
  const selCount = selectedKeys.size || lastSelCountRef.current

  const fromClass = isTop ? 'from-top' : isRight ? 'from-right' : 'from-left'
  const wrapClass = `pf-wrap ${reduceMotion ? 'is-reduced' : fromClass}${leaving ? ' is-leaving' : ''}`

  return createPortal(
    item ? (
      <div
        ref={wrapRef}
        className={wrapClass}
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
                transformOrigin,
              }
            : {
                position: 'absolute',
                top: panelTop,
                height: panelH,
                [isRight ? 'right' : 'left']: 'var(--panel-width)',
                marginLeft: isRight ? 0 : FLYOUT_GAP,
                marginRight: isRight ? FLYOUT_GAP : 0,
                width: flyoutWidth,
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none',
                zIndex: 5,
                transformOrigin,
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
            // undefined (not 'none') so the stylesheet's inner rim shows
            boxShadow: dragOver ? '0 0 35px rgba(76, 175, 80, 0.3)' : undefined,
            // a closing flyout no longer takes clicks
            pointerEvents: leaving ? 'none' : 'auto',
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
          {/* Re-keyed per item: switching cards settles the new content in place. */}
          <div key={item.id} className="pf-swap">
            <PreviewContent
              item={item}
              selectedKeys={selectedKeys}
              onToggleSelectKey={toggleSelectKey}
              hasBatch={batch.mounted}
              imageFit={imageFit}
            />
          </div>

          {/* Floating multi-selection batch action bar */}
          {batch.mounted && (
            <div className={`pf-batch${batch.leaving ? ' is-leaving' : ''}`}>
              <div className="pf-batch-group">
                <div className="flyout-chip">
                  {t('count.selected', { count: selCount })}
                </div>
                <button type="button" className="flyout-text-btn" onClick={handleSelectAllToggle}>
                  {selectedKeys.size === allItemKeys.length ? t('flyout.deselectAll') : t('flyout.selectAll')}
                </button>
              </div>

              <div className="pf-batch-group">
                <button
                  type="button"
                  className="flyout-btn"
                  title={t('flyout.copySelected')}
                  onClick={handleBatchCopy}
                >
                  <CopyIcon width={13} height={13} />
                  <span>{t('item.copy')}</span>
                </button>

                <button
                  type="button"
                  className="flyout-btn primary"
                  title={t('flyout.pasteSelected')}
                  onClick={handleBatchPaste}
                >
                  <span>{t('flyout.paste')}</span>
                </button>

                <button
                  type="button"
                  className="act"
                  title={t('flyout.clearSelection')}
                  onClick={() => {
                    playButtonClickSound()
                    setSelectedKeys(new Set())
                  }}
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    ) : null,
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
  onClick
}: {
  title: string
  icon: any
  onClick: () => any
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

  return (
    <button
      type="button"
      className={`act${copied ? ' active' : ''}`}
      title={copied ? t('flyout.copied') : title}
      onClick={handleClick}
    >
      {copied ? <CheckIcon /> : <Icon />}
    </button>
  )
}

function ExplorerButton({
  path,
  title
}: {
  path: string
  title?: string
}) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      className="act"
      title={title || t('flyout.openInExplorer')}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        e.currentTarget.blur()
        window.edge.revealFile(path)
      }}
    >
      <FolderOpenIcon />
    </button>
  )
}

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

/**
 * One header row for every kind: what it is, a detail, when it was copied,
 * and the item's quick actions. It stays put while the body scrolls.
 */
function FlyoutHead({
  icon,
  title,
  detail,
  time,
  children
}: {
  icon: ReactNode
  title: string
  detail?: string
  time: string
  children?: ReactNode
}) {
  return (
    <div className="pf-head">
      <span className="pf-head-icon">{icon}</span>
      <span className="pf-head-title" title={title}>{title}</span>
      {detail ? <span className="pf-head-detail" title={detail}>{detail}</span> : null}
      <span className="pf-head-time">{time}</span>
      <span className="pf-head-spacer" />
      {children ? <div className="act-pill">{children}</div> : null}
    </div>
  )
}

/** The item's whole note, above the content. */
function MetaHead({ item }: { item: any }) {
  if (!item.note) return null
  return (
    <div className="flyout-meta-head">
      <div className="flyout-meta-label">{item.note}</div>
    </div>
  )
}

/** One color format ("RGB  rgb(59, 130, 246)"); a click copies it. */
function ColorFormatRow({ name, value }: { name: string; value: string }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const id = setTimeout(() => setDone(false), 1200)
    return () => clearTimeout(id)
  }, [done])
  return (
    <button
      type="button"
      className={`pf-format${done ? ' is-done' : ''}`}
      title={done ? t('flyout.copied') : t('flyout.copyText')}
      onClick={(e) => {
        e.stopPropagation()
        e.currentTarget.blur()
        // Through main (watcher paused): the copy is not captured as a new card.
        void useStore.getState().copyText(value, { quiet: true }).then((ok) => { if (ok) setDone(true) })
      }}
    >
      <span className="pf-format-name">{name}</span>
      <span className="pf-format-value">{value}</span>
      <span className="pf-format-icon">{done ? <CheckIcon /> : <CopyIcon />}</span>
    </button>
  )
}

function PreviewContent({
  item,
  selectedKeys,
  onToggleSelectKey,
  hasBatch,
  imageFit
}: {
  item: any
  selectedKeys?: Set<string>
  onToggleSelectKey?: (key: string, e?: React.MouseEvent) => void
  hasBatch?: boolean
  imageFit?: PreviewImageFit | null
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

  const time = relativeTime(item.capturedAt)
  /** Header on top, then the scrolling body (label + tags first). */
  const frame = (head: ReactNode, body: ReactNode) => (
    <>
      {head}
      <div className={`pf-scroll${hasBatch ? ' has-batch' : ''}`}>
        <MetaHead item={item} />
        {body}
      </div>
    </>
  )
  const pasteOnClick = (e: React.MouseEvent) => {
    const sel = window.getSelection()?.toString()
    if (sel && sel.trim().length > 0) return
    e.stopPropagation()
    tryPaste(() => useStore.getState().paste(item.id))
  }
  const copyButton = (title: string) => (
    <QuickActionButton
      title={title}
      icon={CopyIcon}
      onClick={() => useStore.getState().copy(item.id)}
    />
  )

  if (item.data.kind === 'text') {
    const activeText = fullText ?? item.data.text
    const text: string = activeText.length > 20000
      ? activeText.slice(0, 20000) + `\n\n${t('flyout.contentTruncated')}`
      : activeText
    const isUrl = item.data.isUrl

    if (isUrl) {
      const info = localizeLinkInfo(parseUrlPreview(activeText))
      // the page title copied with the link, else what the link itself tells
      const linkTitle = (item.data.linkTitle || info.title || '').trim()
      return frame(
        <FlyoutHead icon={<GlobeIcon />} title={info.serviceName} detail={info.domain} time={time}>
          <QuickActionButton
            title={t('flyout.openLink')}
            icon={ExternalLinkIcon}
            onClick={() => window.open(externalHref(activeText), '_blank')}
          />
          <QuickActionButton
            title={t('flyout.copyText')}
            icon={CopyIcon}
            // Through main (watcher paused): the copy is not captured as a new card.
            onClick={() => void useStore.getState().copyText(cleanLink(activeText), { quiet: true })}
          />
        </FlyoutHead>,
        <div
          onClick={pasteOnClick}
          title={t('flyout.clickToPaste')}
          style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer' }}
        >
          {linkTitle && <div className="pf-link-title">{linkTitle}</div>}
          {info.subtitle && <span className="pf-link-sub">{info.subtitle}</span>}
          <div
            onClick={(e) => {
              e.stopPropagation()
              window.open(externalHref(activeText), '_blank')
            }}
            className="flyout-url"
          >
            {info.displayUrl || activeText}
          </div>
        </div>
      )
    }

    const colorInfo = parseColor(activeText)
    if (colorInfo) {
      const formats = colorFormats(activeText)
      return frame(
        <FlyoutHead icon={<PaletteIcon />} title={(formats?.source ?? 'hex').toUpperCase()} time={time}>
          {copyButton(t('flyout.copyText'))}
        </FlyoutHead>,
        <>
          <div
            className="pf-swatch"
            onClick={pasteOnClick}
            title={t('flyout.clickToPaste')}
            style={{ background: colorInfo.cssColor, color: colorInfo.isLight ? '#111827' : '#ffffff' }}
          >
            {colorInfo.displayText}
          </div>
          {formats && (
            <div className="pf-formats">
              <ColorFormatRow name="HEX" value={formats.hex} />
              <ColorFormatRow name="RGB" value={formats.rgb} />
              <ColorFormatRow name="HSL" value={formats.hsl} />
            </div>
          )}
        </>
      )
    }

    const codeInfo = detectCode(activeText)
    if (codeInfo.isCode) {
      return frame(
        <FlyoutHead icon={<TypeIcon />} title={codeInfo.displayName === 'Code' ? t('fileKinds.code') : codeInfo.displayName} time={time}>
          {copyButton(t('flyout.copyText'))}
        </FlyoutHead>,
        <div
          onClick={pasteOnClick}
          title={t('flyout.clickToPaste')}
          style={{ position: 'relative', cursor: 'pointer', width: '100%' }}
        >
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

    return frame(
      <FlyoutHead icon={<TypeIcon />} title={t('filters.text')} time={time}>
        {copyButton(t('flyout.copyText'))}
      </FlyoutHead>,
      <div
        className="pf-text"
        onClick={pasteOnClick}
        title={t('flyout.clickToPaste')}
        style={{ cursor: 'pointer' }}
      >
        {text}
      </div>
    )
  }

  if (item.data.kind === 'image') {
    return frame(
      <FlyoutHead
        icon={<ImageIcon />}
        title={`${item.data.width} × ${item.data.height}`}
        detail={formatBytes(item.data.bytes)}
        time={time}
      >
        {copyButton(t('flyout.copyImage'))}
      </FlyoutHead>,
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
        className="pf-image-box"
      >
        {item.data.imageId && (
          <img
            className="pf-image"
            src={`edgelocal://${item.data.imageId}`}
            alt={t('menu.preview')}
            draggable={false}
            decoding="async"
            // exact size up front: no reflow when it loads, no stretching
            style={imageFit ? { width: imageFit.width, height: imageFit.height } : undefined}
          />
        )}
      </div>
    )
  }

  if (item.data.kind === 'image-collection') {
    return frame(
      <FlyoutHead
        icon={<ImageIcon />}
        title={t('count.images', { count: item.data.images.length })}
        time={time}
      />,
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
      const ext = (entry?.ext || '').toUpperCase()
      return frame(
        <FlyoutHead icon={<ImageIcon />} title={ext || fileName} time={time} />,
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
      return frame(
        <FlyoutHead
          icon={<FileKindIcon path={p} width={14} height={14} isDirectory={entry?.isDirectory} />}
          title={info.label}
          time={time}
        />,
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
                    <FileKindIcon path={p} width={154} height={154} isDirectory={entry?.isDirectory} layered />
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
                  {kindBadge(info.kind)}
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

    return frame(
      <FlyoutHead
        icon={<FilesIcon />}
        title={t('count.files', { count: item.data.paths.length })}
        time={time}
      />,
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
                      <span className="kind-badge">{t('badge.image')}</span>
                      {entry?.size ? <span className="meta-size">{formatBytes(entry.size)}</span> : null}
                    </div>
                  </div>

                  <div className="actions" onClick={(e) => e.stopPropagation()}>
                    <QuickActionButton
                      title={t('flyout.copyFile')}
                      icon={CopyIcon}
                      onClick={() => useStore.getState().copySubitem({ id: item.id, paths: [p] })}
                    />
                    <ExplorerButton
                      path={p}
                      title={t('flyout.openInExplorer')}
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
                        <FileKindIcon path={p} width={120} height={120} isDirectory={entry?.isDirectory} layered />
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
                      {kindBadge(info.kind)}
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
                  />
                  <ExplorerButton
                    path={p}
                    title={t('flyout.openInExplorer')}
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
