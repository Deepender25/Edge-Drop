/**
 * ShelfSearch — the clipboard search box.
 *
 * Typing needs OS keyboard focus, which the shelf normally never takes. So
 * engaging this input temporarily makes the window focusable (and pauses the
 * global toggle hotkey so typing can't yank the shelf), and every exit hands
 * everything back. The main process captured the user's app at open time and
 * again at engage time, so a click on an item still pastes into that app.
 *
 * Engagement starts on pointer-down, NOT on focus: a NOACTIVATE window may
 * never produce a focus event from a plain click, so waiting for onFocus
 * would make the box look dead.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../store/appStore'
import { edge } from '../lib/edge'
import { noteSearchEngaged } from '../lib/searchFocus'
import { useTranslation } from '../i18n'
import { SearchIcon } from './icons'

export function ShelfSearch() {
  const { t } = useTranslation()
  const query = useStore((s) => s.query)
  const setQuery = useStore((s) => s.setQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  const engagedRef = useRef(false)

  const disengage = useCallback(() => {
    if (!engagedRef.current) return
    engagedRef.current = false
    noteSearchEngaged(false)
    try {
      void edge.focusWindow(false)?.catch?.(() => {})
    } catch { /* ignore */ }
    try {
      void edge.pauseHotkey(false)?.catch?.(() => {})
    } catch { /* ignore */ }
  }, [])

  // Engage BEFORE focus can happen: pointer-down always fires, focus may not.
  // Idempotent — the focus-event backup below reuses it safely.
  const engage = useCallback(() => {
    if (engagedRef.current) return
    engagedRef.current = true
    noteSearchEngaged(true)
    try {
      window.focus()
    } catch { /* ignore */ }
    try {
      const p = edge.focusWindow(true) as unknown as Promise<void> | undefined
      if (p && typeof (p as Promise<void>).then === 'function') {
        ;(p as Promise<void>).then(() => {
          try { inputRef.current?.focus() } catch { /* ignore */ }
        }).catch(() => {})
      } else {
        try { inputRef.current?.focus() } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    try {
      void edge.pauseHotkey(true)?.catch?.(() => {})
    } catch { /* ignore */ }
  }, [])

  // Safety: if the input unmounts mid-focus (view switch), restore state.
  useEffect(() => () => {
    disengage()
  }, [disengage])

  return (
    <div className="search">
      <SearchIcon className="search-icon" width={14} height={14} />
      <input
        ref={inputRef}
        type="text"
        placeholder={t('header.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onPointerDown={() => {
          engage()
        }}
        onFocus={() => {
          engage()
        }}
        onBlur={() => {
          disengage()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            // Staged Escape: clear first, blur second — never close the
            // panel while typing (the window handler skips inputs as well).
            e.stopPropagation()
            if (query) {
              setQuery('')
            } else {
              inputRef.current?.blur()
            }
          }
        }}
        spellCheck={false}
      />
    </div>
  )
}
