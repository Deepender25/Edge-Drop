/**
 * IndicatorStyleFlyout — Side Flyout Preview Panel for Copy Indicator Styles.
 *
 * Compact 2-column grid flyout layout for style selection:
 *   - Logo, Tick, Copy preview cards
 *   - No heavy text descriptions
 *   - Clean spring exit/entry matching PreviewFlyout
 */
import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/appStore'
import {
  LogoIndicatorIcon,
  TickIndicatorIcon,
  CopyIndicatorIcon,
  SparkleIndicatorIcon
} from './CopyIndicatorCurve'
import { CloseIcon } from './icons'
import { playButtonClickSound } from '../lib/soundEffects'
import { createPortal } from 'react-dom'
import { useAdaptiveSpring } from '../hooks/useAdaptiveSpring'
import { useTranslation } from '../i18n'

/** Fast start, soft landing — matching PreviewFlyout */
const flyoutEaseOpen = [0.16, 1, 0.3, 1] as const
const flyoutEaseClose = [0.3, 0, 0.2, 1] as const

const flyoutVariants = {
  hidden: (dir: 'left' | 'right' | 'top') => ({
    opacity: 0,
    x: dir === 'right' ? 14 : dir === 'left' ? -14 : 0,
    y: dir === 'top' ? -14 : 0,
    scale: 0.97,
  }),
  shown: {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    transition: {
      x: { duration: 0.26, ease: flyoutEaseOpen },
      y: { duration: 0.26, ease: flyoutEaseOpen },
      scale: { duration: 0.26, ease: flyoutEaseOpen },
      opacity: { duration: 0.18, ease: 'easeOut' as const },
    },
  },
  exit: (dir: 'left' | 'right' | 'top') => ({
    opacity: 0,
    x: dir === 'right' ? 10 : dir === 'left' ? -10 : 0,
    y: dir === 'top' ? -10 : 0,
    scale: 0.98,
    transition: {
      x: { duration: 0.18, ease: flyoutEaseClose },
      y: { duration: 0.18, ease: flyoutEaseClose },
      scale: { duration: 0.18, ease: flyoutEaseClose },
      opacity: { duration: 0.14, ease: 'easeIn' as const },
    },
  }),
  reducedHidden: { opacity: 0 },
  reducedShown: { opacity: 1 },
}

export function IndicatorStyleFlyout({ isRight }: { isRight: boolean }) {
  const { t } = useTranslation()
  const styleFlyoutOpen = useStore((s) => s.styleFlyoutOpen)
  const setStyleFlyoutOpen = useStore((s) => s.setStyleFlyoutOpen)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const open = useStore((s) => s.open)
  const settings = useStore((s) => s.settings)
  const patch = useStore((s) => s.patchSettings)
  const adaptiveSpring = useAdaptiveSpring()

  const stickPosition = (settings.stickPosition || (isRight ? 'right' : 'left')) as 'left' | 'right' | 'top'
  const isHorizontal = stickPosition === 'top'
  const isTop = stickPosition === 'top'

  const isVisible = styleFlyoutOpen && settingsOpen && open
  const reduceMotion = settings.reduceMotion || adaptiveSpring.type === 'tween'

  const flyoutRef = useRef<HTMLDivElement | null>(null)

  const screenW = typeof window !== 'undefined' ? window.innerWidth : 1200
  const screenH = typeof window !== 'undefined' ? window.innerHeight : 800
  const pFrac = settings.panelHeight || 0.6
  const panelH = screenH * pFrac
  const minY = panelH / 2
  const maxY = screenH - panelH / 2
  const vOffset = settings.verticalOffset ?? 0.5
  const midY = Math.round(minY + vOffset * (maxY - minY))
  const panelTop = midY - panelH / 2

  const styleFlyoutAnchorRect = useStore((s) => s.styleFlyoutAnchorRect)

  const dockWidth = Math.min(screenW - 60, 1080)
  const flyoutWidth = isHorizontal ? 320 : 280
  const dockLeft = Math.round((screenW - dockWidth) / 2)
  const anchorCenterX = isHorizontal && styleFlyoutAnchorRect?.x !== undefined
    ? (styleFlyoutAnchorRect.x + (styleFlyoutAnchorRect.width || 32) / 2) - dockLeft
    : dockWidth / 2
  const minLeft = 12
  const maxLeft = Math.max(minLeft, dockWidth - flyoutWidth - 12)
  const flyoutLeft = Math.max(minLeft, Math.min(maxLeft, Math.round(anchorCenterX - flyoutWidth / 2)))

  const maxFlyoutHeight = isHorizontal ? 260 : Math.max(100, panelH - 24)

  const originX = isHorizontal
    ? Math.max(0.08, Math.min(0.92, (anchorCenterX - flyoutLeft) / flyoutWidth))
    : (isRight ? 1 : 0)
  const originY = isHorizontal ? 0 : 0.5

  useEffect(() => {
    if (!isVisible || !flyoutRef.current) {
      useStore.getState().setPreviewFlyoutRect(null)
      return
    }

    const updateRect = () => {
      if (!flyoutRef.current) return
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
        useStore.getState().setPreviewFlyoutRect({ top, bottom: top + h })
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
  }, [isVisible, isHorizontal, isTop, screenH, flyoutLeft, flyoutWidth, panelTop, panelH])

  // Dismiss flyout when clicking outside
  useEffect(() => {
    if (!isVisible) return

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (!target || typeof target.closest !== 'function') return

      if (target.closest('[data-preview-flyout], .preview-flyout, .style-preview-toggle-btn')) {
        return
      }

      const inBlade = Boolean(target.closest('.blade') || target.closest('.root') || target.closest('.settings-horizontal-shelf'))
      if (inBlade) {
        useStore.getState().setStyleFlyoutOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [isVisible])

  return createPortal(
    <AnimatePresence onExitComplete={() => {
      const s = useStore.getState()
      const isHoriz = s.settings.stickPosition === 'top'
      if (!isHoriz && !s.styleFlyoutOpen && !s.previewItemId) {
        window.edge.setPreviewMode(false)
      }
    }}>
      {isVisible && (
        <motion.div
          key="indicator-style-flyout"
          custom={stickPosition}
          variants={flyoutVariants}
          initial={reduceMotion ? 'reducedHidden' : 'hidden'}
          animate={reduceMotion ? 'reducedShown' : 'shown'}
          exit={reduceMotion ? 'reducedHidden' : 'exit'}
          transition={reduceMotion ? { duration: 0.12, ease: 'linear' } : undefined}
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
                  zIndex: 10,
                  originX,
                  originY,
                  willChange: 'transform, opacity',
                  backfaceVisibility: 'hidden',
                }
              : {
                  position: 'absolute',
                  top: panelTop,
                  height: panelH,
                  [isRight ? 'right' : 'left']: 'var(--panel-width)',
                  marginLeft: isRight ? 0 : 12,
                  marginRight: isRight ? 12 : 0,
                  width: 280,
                  display: 'flex',
                  alignItems: 'center',
                  pointerEvents: 'none',
                  zIndex: 5,
                  originX: isRight ? 1 : 0,
                  originY: 0.5,
                  willChange: 'transform, opacity',
                  backfaceVisibility: 'hidden',
                }
          }
        >
          <div
            ref={flyoutRef}
            className="preview-flyout"
            data-preview-flyout="true"
            style={{
              width: '100%',
              maxHeight: maxFlyoutHeight,
              background: '#141414',
              borderRadius: 20,
              border: 'none',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'none',
              pointerEvents: 'auto',
              position: 'relative',
              padding: 12
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff', letterSpacing: '-0.01em' }}>
                {t('flyout.copyBeaconStyleTitle')}
              </div>
              <button
                type="button"
                className="icon-btn"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.06)',
                  border: 'none',
                  color: 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 0.15s ease, color 0.15s ease'
                }}
                onClick={() => {
                  playButtonClickSound()
                  setStyleFlyoutOpen(false)
                }}
                title={t('header.close')}
              >
                <CloseIcon width={11} height={11} />
              </button>
            </div>

            {/* 2-Column Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, overflowY: 'visible', padding: 1 }}>
              {/* Card 1: Logo */}
              <StyleCard
                active={(settings.copyIndicatorStyle || 'logo') === 'logo'}
                onClick={() => {
                  playButtonClickSound()
                  patch({ copyIndicatorStyle: 'logo' })
                  useStore.getState().triggerCopyFlare()
                }}
                preview={<LogoIndicatorIcon fillColor="#ffffff" size={30} />}
                title={t('appearance.logoStyle')}
              />

              {/* Card 2: Tick */}
              <StyleCard
                active={(settings.copyIndicatorStyle || 'logo') === 'check'}
                onClick={() => {
                  playButtonClickSound()
                  patch({ copyIndicatorStyle: 'check' })
                  useStore.getState().triggerCopyFlare()
                }}
                preview={<TickIndicatorIcon fillColor="#ffffff" size={30} />}
                title={t('appearance.tickStyle')}
              />

              {/* Card 3: Copy */}
              <StyleCard
                active={(settings.copyIndicatorStyle || 'logo') === 'copy'}
                onClick={() => {
                  playButtonClickSound()
                  patch({ copyIndicatorStyle: 'copy' })
                  useStore.getState().triggerCopyFlare()
                }}
                preview={<CopyIndicatorIcon fillColor="#ffffff" size={30} />}
                title={t('appearance.copyStyle')}
              />

              {/* Card 4: Sparkle */}
              <StyleCard
                active={(settings.copyIndicatorStyle || 'logo') === 'sparkle'}
                onClick={() => {
                  playButtonClickSound()
                  patch({ copyIndicatorStyle: 'sparkle' })
                  useStore.getState().triggerCopyFlare()
                }}
                preview={<SparkleIndicatorIcon fillColor="#ffffff" size={30} />}
                title={t('appearance.sparkleStyle')}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

function StyleCard({
  active,
  onClick,
  preview,
  title,
  style
}: {
  active: boolean
  onClick: () => void
  preview: React.ReactNode
  title: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={`indicator-card ${active ? 'active' : ''}`}
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '10px 8px 8px',
        background: '#141414',
        border: active ? '2px solid #ffffff' : '2px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        userSelect: 'none',
        overflow: 'hidden',
        outline: 'none',
        boxShadow: active ? '0 4px 16px rgba(0, 0, 0, 0.5), 0 0 14px rgba(255, 255, 255, 0.12)' : 'none',
        boxSizing: 'border-box',
        ...style
      }}
    >
      {active && (
        <div className="indicator-card-badge" style={{ top: 5, right: 5 }}>
          ✓
        </div>
      )}
      <div
        className="indicator-card-stage"
        style={{
          width: '100%',
          height: 48,
          background: '#000000',
          borderRadius: 8,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          border: 'none'
        }}
      >
        {preview}
      </div>
      <div
        style={{
          fontSize: 11.5,
          fontWeight: active ? 600 : 500,
          color: active ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
          textAlign: 'center',
          letterSpacing: '-0.01em'
        }}
      >
        {title}
      </div>
    </div>
  )
}
