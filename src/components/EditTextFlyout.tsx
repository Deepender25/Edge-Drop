import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/appStore'
import { useTranslation } from '../i18n'
import { useAdaptiveSpring } from '../hooks/useAdaptiveSpring'
import { usePresence } from '../hooks/usePresence'
import { acquireKeyboard, releaseKeyboard } from '../lib/keyboardFocus'
import { playButtonClickSound, playToggleSound } from '../lib/soundEffects'
import { EditIcon, CopyIcon, CheckIcon, CloseIcon, ArrowsClockwiseIcon, GlobeIcon, PaletteIcon, CodeIcon } from './icons'
import { detectCode } from '../lib/codeDetect'
import { parseColor } from '../lib/colorUtils'
import { isLinkText } from '../../shared/linkText'
import { PREVIEW_EXIT_MS } from './PreviewFlyout'
import '../styles/editTextFlyout.css'

const FLYOUT_W = 440
const PANEL_W = 270
const FLYOUT_GAP = 12

const PF_SPRING = 'linear(0, 0.0172, 0.0616, 0.1238, 0.1968, 0.275, 0.3545, 0.4322, 0.5062, 0.5751, 0.6381, 0.6948, 0.7453, 0.7896, 0.828, 0.8611, 0.8892, 0.9128, 0.9326, 0.9488, 0.9621, 0.9728, 0.9813, 0.988, 0.9932, 0.9971, 1, 1.002, 1.0034, 1.0043, 1.0048, 1.005, 1.005, 1.0048, 1.0045, 1.0042, 1.0038, 1.0034, 1.003, 1.0026, 1)'

export function EditTextFlyout({ isRight }: { isRight: boolean }) {
  const editTextItemId = useStore((s) => s.editTextItemId)
  const items = useStore((s) => s.items)
  const settings = useStore((s) => s.settings)
  const adaptiveSpring = useAdaptiveSpring()

  const liveItem = editTextItemId ? items.find((i) => i.id === editTextItemId) ?? null : null
  const lastItemRef = useRef(liveItem)
  if (liveItem) lastItemRef.current = liveItem

  const presence = usePresence(!!liveItem, PREVIEW_EXIT_MS, () => {
    const s = useStore.getState()
    if (!s.editTextItemId && !s.previewItemId && !s.styleFlyoutOpen) {
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
  const availH = typeof window !== 'undefined' && window.screen?.availHeight ? window.screen.availHeight : screenH
  const topWindowH = Math.max(screenH, Math.min(availH - 20, 720))
  const maxFlyoutHeight = isHorizontal ? Math.min(460, Math.max(260, topWindowH - 240)) : Math.max(260, panelH - 24)

  const flyoutWidth = FLYOUT_W
  const dockLeft = Math.round((screenW - dockWidth) / 2)

  const liveItemRect = useStore((s) => s.editTextItemRect)
  const lastItemRectRef = useRef(liveItemRect)
  if (liveItem) lastItemRectRef.current = liveItemRect
  const previewItemRect = liveItem ? liveItemRect : lastItemRectRef.current
  const cardCenterXInBlade = previewItemRect?.x !== undefined
    ? (previewItemRect.x + (previewItemRect.width || 210) / 2) - dockLeft
    : dockWidth / 2
  const minLeft = 12
  const maxLeft = Math.max(minLeft, dockWidth - flyoutWidth - 12)
  const flyoutLeft = Math.max(minLeft, Math.min(maxLeft, Math.round(cardCenterXInBlade - flyoutWidth / 2)))

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

  const flyoutRef = useRef<HTMLDivElement | null>(null)

  // Hover keep-alive zone
  useEffect(() => {
    if (!liveItem || !flyoutRef.current) {
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
  }, [liveItem?.id, panelTop, panelH, isHorizontal, dockLeft, flyoutLeft, flyoutWidth])

  // Dismiss when clicking outside in the shelf
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const isDirtyRef = useRef(false)

  useEffect(() => {
    if (!editTextItemId) {
      setShowDiscardConfirm(false)
      return
    }

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (!target || typeof target.closest !== 'function') return

      if (target.closest('[data-edit-text-flyout], .edit-text-flyout')) {
        return
      }

      if (target.closest('.item-main, .item-card')) {
        return
      }

      const inClipboard = Boolean(target.closest('.blade') || target.closest('.root'))
      if (inClipboard) {
        if (isDirtyRef.current) {
          setShowDiscardConfirm(true)
        } else {
          useStore.getState().setEditTextItemId(null)
        }
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [editTextItemId])

  const fromClass = isTop ? 'from-top' : isRight ? 'from-right' : 'from-left'
  const wrapClass = `et-wrap ${reduceMotion ? 'is-reduced' : fromClass}${leaving ? ' is-leaving' : ''}`

  return createPortal(
    item && item.data.kind === 'text' ? (
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
                zIndex: 6,
                transformOrigin
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
                zIndex: 6,
                transformOrigin
              }
        }
      >
        <div
          ref={flyoutRef}
          className="edit-text-flyout"
          data-edit-text-flyout="true"
          style={{
            maxHeight: maxFlyoutHeight,
            pointerEvents: leaving ? 'none' : 'auto'
          }}
        >
          <div key={item.id} className="et-swap">
            <EditTextEditor
              item={item}
              onDirtyChange={(dirty) => {
                isDirtyRef.current = dirty
              }}
              showDiscardConfirm={showDiscardConfirm}
              setShowDiscardConfirm={setShowDiscardConfirm}
            />
          </div>
        </div>
      </div>
    ) : null,
    document.body
  )
}

function EditTextEditor({
  item,
  onDirtyChange,
  showDiscardConfirm,
  setShowDiscardConfirm
}: {
  item: import('../../shared/types').ClipboardItemDto
  onDirtyChange: (dirty: boolean) => void
  showDiscardConfirm: boolean
  setShowDiscardConfirm: (show: boolean) => void
}) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [initialText, setInitialText] = useState('')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Fetch full text on mount if needed
  useEffect(() => {
    let alive = true
    if (item.data.kind === 'text') {
      if (item.data.hasFullPayload) {
        setLoading(true)
        window.edge
          .getFullText(item.id)
          .then((full) => {
            if (!alive) return
            setInitialText(full)
            setText(full)
            setLoading(false)
          })
          .catch(() => {
            if (!alive) return
            const fallback = item.data.kind === 'text' ? item.data.text : ''
            setInitialText(fallback)
            setText(fallback)
            setLoading(false)
          })
      } else {
        const current = item.data.text
        setInitialText(current)
        setText(current)
        setLoading(false)
      }
    }
    return () => {
      alive = false
    }
  }, [item.id])

  const isDirty = text !== initialText
  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  // Acquire keyboard focus
  useEffect(() => {
    let alive = true
    void acquireKeyboard('edit-text').then(() => {
      if (!alive) return
      if (textareaRef.current) {
        textareaRef.current.focus()
        // Put caret at end
        const len = textareaRef.current.value.length
        textareaRef.current.setSelectionRange(len, len)
      }
    })
    return () => {
      alive = false
      releaseKeyboard('edit-text')
    }
  }, [loading])

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    playButtonClickSound()
    setSaving(true)
    try {
      if (isDirty) {
        const ok = await useStore.getState().updateItemText(item.id, text)
        if (!ok) return
      }
      // Also update the system clipboard so the user can immediately paste their edit
      await useStore.getState().copyText(text, { quiet: true })
      useStore.getState().pushToast({
        id: `edit-success-${Date.now()}`,
        message: t('flyout.textUpdated') || 'Text updated',
        tone: 'info'
      })
      useStore.getState().setEditTextItemId(null)
    } catch (err) {
      console.error('[EditTextFlyout] Failed to save:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true)
    } else {
      playButtonClickSound()
      useStore.getState().setEditTextItemId(null)
    }
  }

  const handleCopy = async () => {
    playButtonClickSound()
    await useStore.getState().copyText(text, { quiet: true })
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const gutterRef = useRef<HTMLPreElement | null>(null)

  const isLink = (item.data.kind === 'text' && item.data.isUrl) || isLinkText(text.trim())
  const isColor = (item.data.kind === 'text' && !!item.data.isColor) || parseColor(text.trim()) !== null
  const codeInfo = !isLink && !isColor ? detectCode(text) : null
  const isCode = !!codeInfo?.isCode

  const lineCount = Math.max(1, text.split('\n').length)
  const lineNumbersText = useMemo(() => Array.from({ length: lineCount }, (_, i) => i + 1).join('\n'), [lineCount])

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop
    }
  }

  const handleRevert = () => {
    playToggleSound(false)
    setText(initialText)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleClose()
    } else if (e.key === 'Tab' && isCode) {
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const next = text.substring(0, start) + '  ' + text.substring(end)
      setText(next)
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2
        }
      }, 0)
    }
  }

  const formatTitle = isLink
    ? t('flyout.editLink') || 'Edit link'
    : isColor
      ? t('flyout.editColor') || 'Edit color'
      : isCode
        ? (codeInfo?.language ? `Edit ${codeInfo.language.toUpperCase()}` : (t('flyout.editCode') || 'Edit code'))
        : t('flyout.editText') || 'Edit text'

  const formatIcon = isLink ? <GlobeIcon /> : isColor ? <PaletteIcon /> : isCode ? <CodeIcon /> : <EditIcon />

  const placeholder = isLink
    ? 'Enter link or URL…'
    : isColor
      ? 'e.g. #3b82f6, rgb(59, 130, 246)…'
      : isCode
        ? 'Enter code snippet…'
        : 'Type or paste text here…'

  const charCount = text.length
  const lineLabel = isCode ? `${lineCount} ${lineCount === 1 ? 'line' : 'lines'} · ` : ''
  const charLabel = `${lineLabel}${charCount.toLocaleString()} ${charCount === 1 ? 'char' : 'chars'}`

  return (
    <>
      {/* Header */}
      <div className="et-head">
        <span className="et-head-icon">
          {formatIcon}
        </span>
        <span className="et-head-title">{formatTitle}</span>
        <span className="et-head-detail" title={charLabel}>
          {charLabel}
        </span>
        {isDirty && <span className="et-dirty-dot" title={t('flyout.unsavedChanges') || 'Unsaved changes'} />}
        <span className="et-head-spacer" />
        <div className="act-pill">
          {isDirty && (
            <button
              type="button"
              className="act"
              title={t('menu.cancel') || 'Revert'}
              onClick={handleRevert}
              disabled={saving}
            >
              <ArrowsClockwiseIcon />
            </button>
          )}
          <button
            type="button"
            className={`act${copied ? ' active' : ''}`}
            title={copied ? t('flyout.copied') || 'Copied' : t('flyout.copyText') || 'Copy text'}
            onClick={handleCopy}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
          <button
            type="button"
            className="act"
            title={t('header.close') || 'Close'}
            onClick={handleClose}
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Body */}
      <form onSubmit={handleSave} className="et-body">
        <div className="et-textarea-wrap">
          {loading ? (
            <div className="et-loading">
              <div className="et-spinner" />
              <span>Loading text…</span>
            </div>
          ) : isCode ? (
            <div className="et-code-wrap">
              <pre ref={gutterRef} className="et-code-gutter" aria-hidden="true">
                {lineNumbersText}
              </pre>
              <textarea
                ref={textareaRef}
                className="et-textarea is-code"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onScroll={handleScroll}
                onKeyDown={handleKeyDown}
                disabled={saving}
                placeholder={placeholder}
                aria-label={formatTitle}
                spellCheck={false}
              />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              className="et-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={saving}
              placeholder={placeholder}
              aria-label={formatTitle}
              spellCheck={false}
            />
          )}

          {/* Unsaved changes confirmation overlay */}
          {showDiscardConfirm && (
            <div className="et-confirm-overlay">
              <div className="et-confirm-title">{t('flyout.discardChanges') || 'Discard changes?'}</div>
              <div className="et-confirm-desc">
                {t('flyout.discardPrompt') || 'You have unsaved changes. Discard them?'}
              </div>
              <div className="et-confirm-buttons">
                <button
                  type="button"
                  className="flyout-btn"
                  onClick={() => setShowDiscardConfirm(false)}
                >
                  {t('menu.cancel') || 'Cancel'}
                </button>
                <button
                  type="button"
                  className="flyout-btn primary"
                  style={{ background: '#ef4444' }}
                  onClick={() => {
                    playButtonClickSound()
                    setShowDiscardConfirm(false)
                    useStore.getState().setEditTextItemId(null)
                  }}
                >
                  {t('flyout.discardChanges') || 'Discard'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="et-footer">
          <span className="et-hint">
            {t('flyout.shortcutHint') || 'Ctrl + Enter to save · Esc to cancel'}
          </span>
          <div className="et-actions">
            <button
              type="button"
              className="flyout-text-btn"
              onClick={handleClose}
              disabled={saving}
            >
              {t('menu.cancel') || 'Cancel'}
            </button>
            <button
              type="submit"
              className="flyout-btn primary"
              disabled={saving}
            >
              {saving ? (
                <div className="et-spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
              ) : (
                <CheckIcon width={13} height={13} />
              )}
              <span>{saving ? 'Saving…' : (t('menu.save') || 'Save')}</span>
            </button>
          </div>
        </div>
      </form>
    </>
  )
}
