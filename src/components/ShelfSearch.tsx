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
import { acquireKeyboard, releaseKeyboard } from '../lib/keyboardFocus'
import { useTranslation } from '../i18n'
import { CloseIcon, SearchIcon } from './icons'

export function ShelfSearch() {
  const { t } = useTranslation()
  const query = useStore((s) => s.query)
  const setQuery = useStore((s) => s.setQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  const engagedRef = useRef(false)

  const disengage = useCallback(() => {
    if (!engagedRef.current) return
    engagedRef.current = false
    releaseKeyboard('search')
  }, [])

  // Engage BEFORE focus can happen: pointer-down always fires, focus may not.
  // Idempotent — the focus-event backup below reuses it safely.
  const engage = useCallback(() => {
    if (engagedRef.current) return
    engagedRef.current = true
    void acquireKeyboard('search').then(() => {
      try { inputRef.current?.focus() } catch { /* ignore */ }
    })
  }, [])

  // Safety: if the input unmounts mid-focus (view switch), restore state.
  useEffect(() => () => {
    disengage()
  }, [disengage])

  return (
    <div className={`search${query ? ' has-query' : ''}`}>
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
      {/* Clear (macOS search-field style). It must never touch focus: the
          OS-focus handover above is driven purely by the input's own
          focus/blur. So the button can't take focus (mousedown/pointerdown
          cancelled, out of the tab order; Escape clears from the keyboard)
          and it never calls focus() — after an app switch the page still
          remembers the input as focused, and refocusing it from here could
          pull OS focus back from the user's app. If the user was typing,
          the input simply keeps focus. Always mounted so it can fade. */}
      <button
        type="button"
        className="search-clear"
        aria-label={t('item.clear')}
        title={t('item.clear')}
        tabIndex={-1}
        aria-hidden={!query}
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setQuery('')}
      >
        <CloseIcon width={10} height={10} weight="bold" />
      </button>
    </div>
  )
}
