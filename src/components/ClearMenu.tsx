import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { TrashIcon } from './icons'
import { playButtonClickSound } from '../lib/soundEffects'
import { useTranslation } from '../i18n'
import type { ClipboardItemDto } from '../../shared/types'

interface ClearMenuProps {
  /** Full item list (pinned + recent) to compute time-window ids from. */
  items: ClipboardItemDto[]
  disabled: boolean
  /** Panel's own open/closed state — closes this menu whenever the panel closes. */
  panelOpen: boolean
  /** Clear a specific set of ids (used for the time-window options via deleteBatch). */
  onClear: (ids: string[]) => void
  /** Clear all unpinned history. */
  onClearAll: () => void
}

const WINDOWS: { key: '1h' | '6h' | '24h'; hours: number }[] = [
  { key: '1h', hours: 1 },
  { key: '6h', hours: 6 },
  { key: '24h', hours: 24 }
]

const menuItemStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  padding: '7px 10px',
  borderRadius: 7,
  background: 'transparent',
  color: 'rgba(255, 255, 255, 0.85)',
  fontSize: 12,
  fontWeight: 400,
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background 0.12s ease'
}

export function ClearMenu({ items, disabled, panelOpen, onClear, onClearAll }: ClearMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Force-close menu when panel slides closed
  useEffect(() => {
    if (!panelOpen) {
      setOpen(false)
      setConfirmAll(false)
    }
  }, [panelOpen])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Re-arm "Clear all" confirmation whenever menu closes
  useEffect(() => {
    if (!open) setConfirmAll(false)
  }, [open])

  const clearWindow = (hours: number) => {
    const cutoff = Date.now() - hours * 3600 * 1000
    // Pinned items are never included in a bulk clear
    const ids = items.filter((it) => !it.pinned && it.capturedAt >= cutoff).map((it) => it.id)
    playButtonClickSound()
    setOpen(false)
    if (ids.length > 0) onClear(ids)
  }

  const handleAllClick = () => {
    if (!confirmAll) {
      playButtonClickSound()
      setConfirmAll(true)
      return
    }
    playButtonClickSound()
    setOpen(false)
    onClearAll()
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="text-btn danger"
        onClick={() => {
          if (disabled) return
          playButtonClickSound()
          setOpen((v) => !v)
        }}
        disabled={disabled}
        title={t('item.clear')}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <TrashIcon width={14} height={14} />
        <span>{t('item.clear')}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              right: 0,
              minWidth: 190,
              background: '#141414',
              border: 'none',
              borderRadius: 16,
              padding: 4,
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
              zIndex: 100
            }}
          >
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => clearWindow(w.hours)}
                style={menuItemStyle}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                {t(`item.clearLast${w.key}` as any)}
              </button>
            ))}

            <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.1)', margin: '4px 2px' }} />

            <button
              type="button"
              onClick={handleAllClick}
              style={{
                ...menuItemStyle,
                color: confirmAll ? '#ff5252' : 'rgba(255, 255, 255, 0.85)',
                fontWeight: confirmAll ? 600 : 400
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              {confirmAll ? t('item.clearAllConfirm') : t('item.clearAll')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
