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
import { LiquidOctopusLoader } from './LiquidOctopusLoader'
import { TickIndicatorIcon, CopyIndicatorIcon, SparkleIndicatorIcon } from './CopyIndicatorCurve'
import { CloseIcon } from './icons'
import { createPortal } from 'react-dom'
import { useAdaptiveSpring } from '../hooks/useAdaptiveSpring'

export function IndicatorStyleFlyout({ isRight }: { isRight: boolean }) {
  const styleFlyoutOpen = useStore((s) => s.styleFlyoutOpen)
  const setStyleFlyoutOpen = useStore((s) => s.setStyleFlyoutOpen)
  const settings = useStore((s) => s.settings)
  const patch = useStore((s) => s.patchSettings)
  const adaptiveSpring = useAdaptiveSpring()

  const flyoutRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!styleFlyoutOpen || !flyoutRef.current) {
      useStore.getState().setPreviewFlyoutRect(null)
      return
    }

    const updateRect = () => {
      if (flyoutRef.current) {
        const r = flyoutRef.current.getBoundingClientRect()
        useStore.getState().setPreviewFlyoutRect({ top: r.top, bottom: r.bottom })
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
  }, [styleFlyoutOpen])

  const maxFlyoutHeight = `calc(${(settings.panelHeight || 0.6) * 100}vh - 24px)`

  return createPortal(
    <div style={{
      position: 'absolute',
      top: 0,
      bottom: 0,
      [isRight ? 'right' : 'left']: 'var(--panel-width)',
      marginLeft: isRight ? 0 : 12,
      marginRight: isRight ? 12 : 0,
      width: 280,
      display: 'flex',
      alignItems: 'center',
      pointerEvents: 'none',
      zIndex: 5,
    }}>
      <AnimatePresence mode="wait" onExitComplete={() => {
        const s = useStore.getState()
        if (!s.styleFlyoutOpen && !s.previewItemId) {
          window.edge.setPreviewMode(false)
        }
      }}>
        {styleFlyoutOpen && (
          <motion.div
            ref={flyoutRef}
            key="indicator-style-flyout"
            className="preview-flyout"
            data-preview-flyout="true"
            initial={{ opacity: 0, scale: 0.88, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 8 }}
            transition={{
              ...adaptiveSpring,
              opacity: { type: 'tween', duration: 0.16, ease: 'easeOut' },
              y: { type: 'spring', stiffness: 420, damping: 36, mass: 0.65, restDelta: 0.001 }
            }}
            style={{
              width: '100%',
              maxHeight: maxFlyoutHeight,
              background: '#000000',
              borderRadius: 16,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
              pointerEvents: 'auto',
              transformOrigin: `${isRight ? '100%' : '0%'} 50%`,
              willChange: 'transform, opacity',
              transition: 'background 0.2s ease, border 0.2s ease, box-shadow 0.2s ease',
              position: 'relative',
              padding: 14
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#ffffff', letterSpacing: '-0.01em' }}>
                Indicator Style
              </div>
              <button
                type="button"
                className="icon-btn"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 0.15s ease, color 0.15s ease'
                }}
                onClick={() => setStyleFlyoutOpen(false)}
                title="Close Style Panel"
              >
                <CloseIcon width={12} height={12} />
              </button>
            </div>

            {/* 2-Column Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, overflowY: 'auto' }}>
              {/* Card 1: Logo */}
              <StyleCard
                active={(settings.copyIndicatorStyle || 'logo') === 'logo'}
                onClick={() => {
                  patch({ copyIndicatorStyle: 'logo' })
                  useStore.getState().triggerCopyFlare()
                }}
                preview={<LiquidOctopusLoader fillColor="#ffffff" glowColor="rgba(255, 255, 255, 0.85)" speed={1.2} />}
                title="Logo"
              />

              {/* Card 2: Tick */}
              <StyleCard
                active={(settings.copyIndicatorStyle || 'logo') === 'check'}
                onClick={() => {
                  patch({ copyIndicatorStyle: 'check' })
                  useStore.getState().triggerCopyFlare()
                }}
                preview={<TickIndicatorIcon fillColor="#ffffff" glowColor="rgba(255, 255, 255, 0.85)" size={32} />}
                title="Tick"
              />

              {/* Card 3: Copy */}
              <StyleCard
                active={(settings.copyIndicatorStyle || 'logo') === 'copy'}
                onClick={() => {
                  patch({ copyIndicatorStyle: 'copy' })
                  useStore.getState().triggerCopyFlare()
                }}
                preview={<CopyIndicatorIcon fillColor="#ffffff" glowColor="rgba(255, 255, 255, 0.85)" size={32} />}
                title="Copy"
              />

              {/* Card 4: Sparkle */}
              <StyleCard
                active={(settings.copyIndicatorStyle || 'logo') === 'sparkle'}
                onClick={() => {
                  patch({ copyIndicatorStyle: 'sparkle' })
                  useStore.getState().triggerCopyFlare()
                }}
                preview={<SparkleIndicatorIcon fillColor="#ffffff" glowColor="rgba(255, 255, 255, 0.85)" size={32} />}
                title="Sparkle"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
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
        gap: 8,
        padding: '12px 10px 10px',
        background: active ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)',
        border: `1px solid ${active ? '#ffffff' : 'rgba(255, 255, 255, 0.08)'}`,
        borderRadius: 12,
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        userSelect: 'none',
        overflow: 'hidden',
        boxShadow: active ? '0 4px 16px rgba(0, 0, 0, 0.5), 0 0 14px rgba(255, 255, 255, 0.12)' : 'none',
        ...style
      }}
    >
      {active && (
        <div className="indicator-card-badge" style={{ top: 6, right: 6 }}>
          ✓
        </div>
      )}
      <div
        className="indicator-card-stage"
        style={{
          width: '100%',
          height: 60,
          background: '#000000',
          borderRadius: 8,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.06)'
        }}
      >
        {preview}
      </div>
      <div
        style={{
          fontSize: 12,
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
