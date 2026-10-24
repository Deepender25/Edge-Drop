/**
 * Unicode emoji library. Glyphs are Twemoji; paste is the character itself.
 * No text field — categories + click — so the shelf never takes OS focus.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  entriesForCategory,
  hasSkinTones,
  pushRecent,
  skinChoices,
  unifiedToNative,
  type EmojiCatalog,
  type EmojiEntry
} from '../lib/emoji/catalog'
import { glyphSrc, glyphsVersion, loadGlyphs, setScreenGlyphCount, subscribeGlyphs } from '../lib/emoji/glyphCache'
import { loadEmojiCatalog, peekEmojiCatalog } from '../lib/emoji/load'
import { loadRecents, saveRecents } from '../lib/emoji/prefs'
import { useStore } from '../store/appStore'
import { playButtonClickSound } from '../lib/soundEffects'
import { useTranslation } from '../i18n'
import { EmojiCategoryBar } from './EmojiCategoryBar'
import { TrashIcon } from './icons'

const COLS = 7
const ROW_H = 36
const PASTE_GAP_MS = 180
const TONE_POP_W = 216
const TONE_POP_H = 44

/**
 * The grid's last measured size. The picker is unmounted once the shelf has
 * closed (Panel) and mounts again on the next open; starting from the last
 * size (and the already-loaded catalog) makes that first frame identical to
 * re-showing a kept picker: no skeleton flash, no wrong column count.
 */
const lastView = { w: 0, h: 320 }

interface TonePopup {
  entry: EmojiEntry
  left: number
  top: number
  place: 'above' | 'below'
}

function Glyph({ file, size = 22 }: { file: string; size?: number }) {
  // Loaded a screen at a time (glyphCache); no src until its batch lands.
  // Once shown, a glyph keeps its image even if the cache later drops it.
  const shown = useRef<{ file: string; src?: string }>({ file })
  if (shown.current.file !== file) shown.current = { file }
  const src = glyphSrc(file) ?? shown.current.src
  shown.current.src = src
  return (
    <img
      className="emoji-glyph"
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      decoding="async"
      loading="lazy"
      style={{ width: size, height: size }}
    />
  )
}

export function EmojiPicker({
  active = true,
  isHorizontal = false
}: {
  active?: boolean
  isHorizontal?: boolean
}) {
  const { t } = useTranslation()
  const pasteEmoji = useStore((s) => s.pasteEmoji)
  const category = useStore((s) => s.emojiCategory)
  const setCategory = useStore((s) => s.setEmojiCategory)
  const [catalog, setCatalog] = useState<EmojiCatalog | null>(peekEmojiCatalog)
  const [roomy, setRoomy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [recents, setRecents] = useState<string[]>(loadRecents)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewW, setViewW] = useState(lastView.w)
  const [viewH, setViewH] = useState(lastView.h)
  const [tonePop, setTonePop] = useState<TonePopup | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const lastPasteAt = useRef(0)
  // Scroll position is consumed one frame at a time: rapid scroll events
  // only record the latest offset and schedule a single rAF commit, so the
  // virtualized grid recomputes at most once per frame instead of once per
  // raw scroll event. Same scroll position, less CPU while scrolling.
  const scrollRaf = useRef<number | null>(null)
  const pendingScrollTop = useRef(0)

  // Measured: fetch + parse + build totals ~15ms — small enough to start on
  // mount without starving the filter animation. The expensive part was
  // always the image mount burst, which the row budget below spreads out.
  useEffect(() => {
    let alive = true
    loadEmojiCatalog()
      .then((c) => {
        if (!alive) return
        setCatalog(c)
        if (loadRecents().length > 0 && category === 'smileys') {
          setCategory('recents')
        }
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    setTonePop(null)
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0
  }, [category])

  // Reopen always lands on the first page: reset view state whenever the
  // picker becomes active (store already lands the category itself).
  const wasActive = useRef(active)
  useEffect(() => {
    const justOpened = active && !wasActive.current
    wasActive.current = active
    if (!justOpened) return
    setTonePop(null)
    setScrollTop(0)
    setRowBudget(3)
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0
  }, [active])

  useEffect(() => {
    return () => {
      if (scrollRaf.current !== null) {
        try { cancelAnimationFrame(scrollRaf.current) } catch { /* ignore */ }
        scrollRaf.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!catalog) return
    const id = requestAnimationFrame(() => setRoomy(true))
    return () => cancelAnimationFrame(id)
  }, [catalog])

  useEffect(() => {
    if (!active || !catalog) return
    const el = scrollerRef.current
    if (!el) return
    const apply = () => {
      const h = el.clientHeight
      const w = el.clientWidth
      if (h > 0) {
        lastView.h = h
        setViewH(h)
      }
      if (w > 0) {
        lastView.w = w
        setViewW(w)
      }
    }
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    apply()
    return () => ro.disconnect()
  }, [catalog, active])

  const items = useMemo(() => {
    return entriesForCategory(catalog, category, recents)
  }, [catalog, category, recents])

  const cols = useMemo(() => {
    if (!isHorizontal) return COLS
    if (viewW <= 0) return 24
    return Math.max(8, Math.floor((viewW - 16) / 36))
  }, [isHorizontal, viewW])

  const rowH = isHorizontal ? 32 : ROW_H
  const glyphSize = isHorizontal ? 22 : 26

  // Tell the category bar's hover warm-up how many glyphs fill one screen.
  useEffect(() => {
    setScreenGlyphCount(cols * Math.ceil(viewH / rowH))
  }, [cols, viewH, rowH])

  // Re-render when a batch of glyphs lands.
  useSyncExternalStore(subscribeGlyphs, glyphsVersion)

  const rows = Math.ceil(items.length / cols)
  // First paint mounts a tight window (fewer images fighting for decode),
  // then widens to full overscan on the next frame for scroll smoothness.
  const overscan = roomy ? 3 : 1
  const startRow = Math.max(0, Math.floor(scrollTop / rowH) - overscan)
  const visibleRows = Math.ceil(viewH / rowH) + overscan * 2
  const endRow = Math.min(rows, startRow + visibleRows)
  // Fetch budget: <img> tags start their file requests on DOM insert, which
  // content-visibility cannot prevent — so cap how many rows mount per frame
  // and ramp up over frames. Landing frame mounts ~3 rows (~21 requests, not
  // ~100); spacers keep total height exact so nothing jumps, and the window
  // fills over ~5 frames (~80ms), which reads as instant instead of a
  // stampede.
  // Small steps (~21 images each) so no single frame carries a decode
  // stampede; the full window fills over ~5 frames (~80ms).
  const [rowBudget, setRowBudget] = useState(3)
  // Derived-state reset (render phase, before commit): a category switch
  // must commit its FIRST frame already budgeted at the top. Resetting in an
  // effect instead mounts one full wide-grid frame first (all-new images at
  // once) and only then tears most of it down — that double-mount hitch is
  // the in-tab switch lag. setState-during-render re-renders pre-commit, so
  // no extra paint happens.
  const seenCategory = useRef(category)
  if (seenCategory.current !== category) {
    seenCategory.current = category
    setRowBudget(3)
    setScrollTop(0)
  }
  const windowRows = endRow - startRow
  useEffect(() => {
    if (!catalog) return
    if (windowRows <= rowBudget) return
    const id = requestAnimationFrame(() => {
      setRowBudget((b) => b + 3)
    })
    return () => cancelAnimationFrame(id)
  }, [catalog, windowRows, rowBudget])
  const effEndRow = Math.min(endRow, startRow + rowBudget)

  // The whole window's glyphs in one call, as soon as the window is known
  // (not row by row with the mount ramp above).
  useEffect(() => {
    if (!catalog || !active) return
    loadGlyphs(items.slice(startRow * cols, endRow * cols).map((item) => item.file))
  }, [catalog, active, items, startRow, endRow, cols])

  useEffect(() => {
    if (tonePop) loadGlyphs(skinChoices(tonePop.entry).map((choice) => choice.file))
  }, [tonePop])

  const onPaste = useCallback(
    (unified: string) => {
      const now = Date.now()
      if (now - lastPasteAt.current < PASTE_GAP_MS) return
      lastPasteAt.current = now
      playButtonClickSound()
      void pasteEmoji(unifiedToNative(unified))
      const next = pushRecent(recents, unified)
      setRecents(next)
      saveRecents(next)
      setTonePop(null)
    },
    [pasteEmoji, recents]
  )

  const openTonePop = (entry: EmojiEntry, cell: HTMLElement) => {
    const picker = pickerRef.current
    if (!picker) return
    const pr = picker.getBoundingClientRect()
    const cr = cell.getBoundingClientRect()
    const center = cr.left - pr.left + cr.width / 2
    const left = Math.min(pr.width - TONE_POP_W / 2 - 8, Math.max(TONE_POP_W / 2 + 8, center))
    const spaceAbove = cr.top - pr.top
    const place: 'above' | 'below' = spaceAbove >= TONE_POP_H + 10 ? 'above' : 'below'
    const top = place === 'above' ? cr.top - pr.top : cr.bottom - pr.top
    setTonePop({ entry, left, top, place })
  }

  return (
    <div
      className={`emoji-picker${isHorizontal ? ' horizontal' : ''}`}
      ref={pickerRef}
      onPointerDown={(e) => {
        const t = e.target as HTMLElement
        if (!t.closest('[data-tone-popup], [data-has-skins]')) setTonePop(null)
      }}
    >
      {!isHorizontal && <EmojiCategoryBar isHorizontal={false} />}

      {failed ? (
        <div className="emoji-status">{t('emoji.loadFailed')}</div>
      ) : !catalog ? (
        <div
          className="emoji-skel"
          style={isHorizontal ? { gridTemplateColumns: `repeat(${cols}, 1fr)` } : undefined}
          aria-hidden
        >
          {Array.from({ length: isHorizontal ? cols * 4 : 28 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="emoji-empty">{t('emoji.emptyRecents')}</div>
      ) : (
        <div
          ref={scrollerRef}
          className="emoji-grid"
          onScroll={(e) => {
            pendingScrollTop.current = (e.currentTarget as HTMLDivElement).scrollTop
            if (scrollRaf.current !== null) return
            scrollRaf.current = requestAnimationFrame(() => {
              scrollRaf.current = null
              setScrollTop(pendingScrollTop.current)
              setTonePop(null)
            })
          }}
        >
          <div style={{ height: startRow * rowH }} />
          {Array.from({ length: effEndRow - startRow }, (_, i) => {
            const row = startRow + i
            const slice = items.slice(row * cols, row * cols + cols)
            return (
              <div
                key={row}
                className="emoji-row"
                style={isHorizontal ? { gridTemplateColumns: `repeat(${cols}, 1fr)`, height: rowH } : undefined}
              >
                {slice.map((item) => {
                  const skinnable = hasSkinTones(item.entry)
                  return (
                    <button
                      key={item.key}
                      type="button"
                      tabIndex={-1}
                      className="emoji-cell"
                      data-has-skins={skinnable ? '' : undefined}
                      title={unifiedToNative(item.key)}
                      onClick={(e) => {
                        e.currentTarget.blur()
                        if (skinnable) {
                          if (tonePop?.entry.unified === item.entry.unified) {
                            setTonePop(null)
                            return
                          }
                          playButtonClickSound()
                          openTonePop(item.entry, e.currentTarget)
                          return
                        }
                        onPaste(item.key)
                      }}
                    >
                      <Glyph file={item.file} size={glyphSize} />
                    </button>
                  )
                })}
              </div>
            )
          })}
          <div style={{ height: Math.max(0, (rows - effEndRow) * rowH) }} />
        </div>
      )}

      {category === 'recents' && recents.length > 0 && (
        <div className="emoji-recents-footer">
          <button
            type="button"
            className="emoji-recents-clear-btn"
            title={t('emoji.clearRecents') || 'Clear'}
            onClick={() => {
              playButtonClickSound()
              setRecents([])
              saveRecents([])
              setCategory('smileys')
            }}
          >
            <TrashIcon width={12} height={12} />
            <span>{t('emoji.clearRecents') || 'Clear'}</span>
          </button>
        </div>
      )}

      {tonePop && (
        <div
          data-tone-popup
          className={`emoji-tone-pop emoji-tone-pop-${tonePop.place}`}
          role="listbox"
          aria-label={t('emoji.skinTone')}
          style={{ left: tonePop.left, top: tonePop.top }}
        >
          {skinChoices(tonePop.entry).map((choice) => (
            <button
              key={choice.unified}
              type="button"
              tabIndex={-1}
              className="emoji-tone-choice"
              aria-label={choice.unified}
              onClick={(e) => {
                e.currentTarget.blur()
                onPaste(choice.unified)
              }}
            >
              <Glyph file={choice.file} size={24} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default EmojiPicker
