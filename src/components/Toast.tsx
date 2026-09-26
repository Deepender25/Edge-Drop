/**
 * Toast — transient user-facing notices pinned to the bottom of the blade.
 *
 * Fed by the `ui:toast` IPC channel (e.g. "Collection is full (10 max)" from a
 * rejected merge, or "Split into N stacks" from a chunked drop). Each toast
 * auto-dismisses on a timer (see appStore.pushToast) and can also be swiped
 * away by clicking it.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../store/appStore'

import { useTranslation } from '../i18n'

export function ToastStack() {
  const { t } = useTranslation()
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)

  return (
    <div className="toast-stack">
      <AnimatePresence>
        {toasts.map((toastMsg) => (
          <motion.button
            key={toastMsg.id}
            className={`toast ${toastMsg.tone === 'error' ? 'toast-error' : 'toast-info'}`}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.5, restDelta: 0.001, restSpeed: 0.001 }}
            onClick={() => dismiss(toastMsg.id)}
            title={t('header.close')}
          >
            {toastMsg.tone === 'error' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
            <span>{t(toastMsg.message, toastMsg.params)}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  )
}
