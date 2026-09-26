/**
 * LanguageFlyout — Obsidian Flyout Selection Panel for Display Language in Horizontal Layout.
 *
 * Provides an elegant, clean single-column list of all application languages
 * with native scripts, English subnames, and smooth spring entry/exit animations.
 */
import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/appStore'
import { CloseIcon } from './icons'
import { playButtonClickSound } from '../lib/soundEffects'
import { createPortal } from 'react-dom'
import { useAdaptiveSpring } from '../hooks/useAdaptiveSpring'
import { useTranslation } from '../i18n'

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

export function LanguageFlyout({ isRight }: { isRight: boolean }) {
  const { t, language, languages } = useTranslation()
  const languageFlyoutOpen = useStore((s) => s.languageFlyoutOpen)
  const setLanguageFlyoutOpen = useStore((s) => s.setLanguageFlyoutOpen)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const open = useStore((s) => s.open)
  const settings = useStore((s) => s.settings)
  const patch = useStore((s) => s.patchSettings)
  const adaptiveSpring = useAdaptiveSpring()

  const stickPosition = (settings.stickPosition || (isRight ? 'right' : 'left')) as 'left' | 'right' | 'top'
  const isHorizontal = stickPosition === 'top'
  const isTop = stickPosition === 'top'

  const isVisible = languageFlyoutOpen && settingsOpen && open
  const reduceMotion = settings.reduceMotion || adaptiveSpring.type === 'tween'

  const flyoutRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const screenW = typeof window !== 'undefined' ? window.innerWidth : 1200
  const screenH = typeof window !== 'undefined' ? window.innerHeight : 800
  const pFrac = settings.panelHeight || 0.6
  const panelH = screenH * pFrac
  const minY = panelH / 2
  const maxY = screenH - panelH / 2
  const vOffset = settings.verticalOffset ?? 0.5
  const midY = Math.round(minY + vOffset * (maxY - minY))
  const panelTop = midY - panelH / 2

  const languageFlyoutAnchorRect = useStore((s) => s.languageFlyoutAnchorRect)

  const dockWidth = Math.min(screenW - 60, 1080)
  const flyoutWidth = isHorizontal ? 270 : 280
  const dockLeft = Math.round((screenW - dockWidth) / 2)
  const anchorCenterX = isHorizontal && languageFlyoutAnchorRect?.x !== undefined
    ? (languageFlyoutAnchorRect.x + (languageFlyoutAnchorRect.width || 32) / 2) - dockLeft
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

  // Auto-scroll to active language on open
  useEffect(() => {
    if (isVisible && listRef.current) {
      const activeBtn = listRef.current.querySelector<HTMLButtonElement>('[data-active="true"]')
      if (activeBtn) {
        if ((language || 'system') === 'system') {
          listRef.current.scrollTop = 0
        } else {
          listRef.current.scrollTop = Math.max(0, activeBtn.offsetTop - 36)
        }
      }
    }
  }, [isVisible, language])

  // Dismiss flyout when clicking outside
  useEffect(() => {
    if (!isVisible) return

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (!target || typeof target.closest !== 'function') return

      if (target.closest('[data-language-flyout], .language-flyout, .language-toggle-btn')) {
        return
      }

      const inBlade = Boolean(target.closest('.blade') || target.closest('.root') || target.closest('.settings-horizontal-shelf'))
      if (inBlade) {
        useStore.getState().setLanguageFlyoutOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [isVisible])

  return createPortal(
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="language-flyout-wrapper"
          custom={stickPosition}
          variants={reduceMotion ? { hidden: flyoutVariants.reducedHidden, shown: flyoutVariants.reducedShown, exit: flyoutVariants.reducedHidden } : flyoutVariants}
          initial="hidden"
          animate="shown"
          exit="exit"
          style={
            isHorizontal
              ? {
                  position: 'absolute',
                  top: 222,
                  left: dockLeft + flyoutLeft,
                  width: flyoutWidth,
                  pointerEvents: 'none',
                  zIndex: 9999,
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
            className="preview-flyout language-flyout"
            data-language-flyout="true"
            style={{
              width: '100%',
              maxHeight: maxFlyoutHeight,
              background: '#141414',
              borderRadius: 18,
              border: 'none',
              outline: 'none',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'none',
              pointerEvents: 'auto',
              position: 'relative',
              padding: '12px 10px 10px 10px',
              boxSizing: 'border-box'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 8px 4px', borderBottom: 'none' }}>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.42)', marginBottom: 2 }}>
                  LANGUAGE
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff', letterSpacing: '-0.01em' }}>
                  {t('behaviour.languageTitle')}
                </div>
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
                  setLanguageFlyoutOpen(false)
                }}
                title={t('header.close')}
              >
                <CloseIcon width={11} height={11} />
              </button>
            </div>

            {/* Clean Single-Column List (No Horizontal Scroll) */}
            <div
              ref={listRef}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                overflowY: 'auto',
                overflowX: 'hidden',
                paddingTop: 6,
                paddingRight: 2,
                maxHeight: 190,
                scrollbarWidth: 'none',
                boxSizing: 'border-box'
              }}
            >
              {languages.map((lang) => {
                const active = lang.code === (language || 'system')
                return (
                  <button
                    key={lang.code}
                    type="button"
                    data-active={active ? 'true' : 'false'}
                    onClick={() => {
                      playButtonClickSound()
                      patch({ language: lang.code })
                      setLanguageFlyoutOpen(false)
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: 8,
                      background: active ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                      border: active ? '1px solid rgba(255, 255, 255, 0.18)' : '1px solid transparent',
                      color: active ? '#ffffff' : 'rgba(255, 255, 255, 0.8)',
                      fontSize: 12,
                      fontWeight: active ? 600 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.12s ease, border-color 0.12s ease',
                      flexShrink: 0,
                      boxSizing: 'border-box'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                      <span style={{ fontWeight: active ? 600 : 500, color: active ? '#ffffff' : 'rgba(255, 255, 255, 0.9)', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {lang.nativeName}
                      </span>
                      {lang.code !== 'system' && !lang.nativeName.includes('(') && lang.nativeName !== lang.name && (
                        <span style={{ fontSize: 10.5, color: 'rgba(255, 255, 255, 0.42)', fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          ({lang.name})
                        </span>
                      )}
                    </div>
                    {active && (
                      <span style={{ color: '#ffffff', fontSize: 12, fontWeight: 700, marginLeft: 6, flexShrink: 0 }}>
                        ✓
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
