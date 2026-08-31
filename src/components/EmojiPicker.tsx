/**
 * Unicode emoji library. Glyphs are Twemoji; paste is the character itself.
 * No text field — categories + click — so the shelf never takes OS focus.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CATEGORY_ORDER,
  emojiGlyphUrl,
  hasSkinTones,
  pushRecent,
  resolveGlyph,
  skinChoices,
  unifiedToNative,
  type EmojiCatalog,
  type EmojiCategoryId,
  type EmojiEntry
} from '../lib/emoji/catalog'
import { loadEmojiCatalog } from '../lib/emoji/load'
import { loadRecents, saveRecents } from '../lib/emoji/prefs'
import { useStore } from '../store/appStore'
import { playButtonClickSound } from '../lib/soundEffects'
import { useTranslation } from '../i18n'
import {
  TrashIcon,
  EmojiSmileIcon,
  EmojiClockIcon,
  EmojiPawIcon,
  EmojiFoodIcon,
  EmojiPlaneIcon,
  EmojiTrophyIcon,
  EmojiBulbIcon,
  EmojiShapesIcon
} from './icons'
import type { SVGProps } from 'react'

type IconCmp = (p: SVGProps<SVGSVGElement>) => JSX.Element

const CATEGORY_ICONS: Record<EmojiCategoryId, IconCmp> = {
  recents: EmojiClockIcon,
  smileys: EmojiSmileIcon,
  animals: EmojiPawIcon,
  food: EmojiFoodIcon,
  travel: EmojiPlaneIcon,
  activities: EmojiTrophyIcon,
  objects: EmojiBulbIcon,
  symbols: EmojiShapesIcon
}

const COLS = 7
const ROW_H = 36
const PASTE_GAP_MS = 180
const TONE_POP_W = 216
const TONE_POP_H = 44

interface TonePopup {
  entry: EmojiEntry
  left: number
  top: number
  place: 'above' | 'below'
}

function Glyph({ file, size = 22 }: { file: string; size?: number }) {
  return (
    <img
      className="emoji-glyph"
      src={emojiGlyphUrl(file)}
      alt=""
      width={size}
      height={size}
      draggable={false}
      decoding="async"
      style={{ width: size, height: size }}
    />
  )
}

export function EmojiPicker() {
  const { t } = useTranslation()
  const pasteEmoji = useStore((s) => s.pasteEmoji)
  const category = useStore((s) => s.emojiCategory)
  const setCategory = useStore((s) => s.setEmojiCategory)
  const [catalog, setCatalog] = useState<EmojiCatalog | null>(null)
  const [failed, setFailed] = useState(false)
  const [recents, setRecents] = useState<string[]>(loadRecents)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(320)
  const [tonePop, setTonePop] = useState<TonePopup | null>(null)
  const [hoveredCat, setHoveredCat] = useState<{
    label: string
    left: number
  } | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const lastPasteAt = useRef(0)

  const shownCats = useMemo(() => {
    return CATEGORY_ORDER.filter((c) => c.id !== 'recents' || recents.length > 0)
  }, [recents])

  const selectCategory = useCallback((id: EmojiCategoryId) => {
    playButtonClickSound()
    setTonePop(null)
    setHoveredCat(null)
    setCategory(id)
    setScrollTop(0)
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0
  }, [setCategory])

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
    setHoveredCat(null)
    setScrollTop(0)
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0
  }, [category])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewH(el.clientHeight))
    ro.observe(el)
    setViewH(el.clientHeight)
    return () => ro.disconnect()
  }, [catalog])

  const items = useMemo(() => {
    if (!catalog) return [] as Array<{ key: string; file: string; entry: EmojiEntry }>
    if (category === 'recents') {
      const out: Array<{ key: string; file: string; entry: EmojiEntry }> = []
      for (const u of recents) {
        const g = resolveGlyph(catalog, u)
        if (g) out.push({ key: g.unified, file: g.file, entry: g.entry })
      }
      return out
    }
    const spec = CATEGORY_ORDER.find((c) => c.id === category)
    if (!spec || !spec.sources || spec.sources.length === 0) return []
    const out: Array<{ key: string; file: string; entry: EmojiEntry }> = []
    for (const src of spec.sources) {
      const list = catalog.byCategory[src] ?? []
      for (const entry of list) {
        out.push({ key: entry.unified, file: entry.file, entry })
      }
    }
    return out
  }, [catalog, category, recents])

  const rows = Math.ceil(items.length / COLS)
  const overscan = 3
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_H) - overscan)
  const visibleRows = Math.ceil(viewH / ROW_H) + overscan * 2
  const endRow = Math.min(rows, startRow + visibleRows)

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
    setHoveredCat(null)
  }

  return (
    <div
      className="emoji-picker"
      ref={pickerRef}
      onPointerDown={(e) => {
        const t = e.target as HTMLElement
        if (!t.closest('[data-tone-popup], [data-has-skins]')) setTonePop(null)
      }}
    >
      <div className="emoji-cat-bar" role="tablist" aria-label={t('emoji.categories')}>
        {shownCats.map((c) => {
          const Icon = CATEGORY_ICONS[c.id]
          const active = category === c.id
          const label = t(c.labelKey)
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              data-cat={c.id}
              aria-selected={active}
              aria-label={label}
              tabIndex={-1}
              className={`emoji-cat-btn${active ? ' active' : ''}`}
              onPointerEnter={(e) => {
                const picker = pickerRef.current
                if (!picker) return
                const pr = picker.getBoundingClientRect()
                const cr = e.currentTarget.getBoundingClientRect()
                const center = cr.left - pr.left + cr.width / 2
                setHoveredCat({
                  label,
                  left: center
                })
              }}
              onPointerLeave={() => setHoveredCat(null)}
              onClick={(e) => {
                e.currentTarget.blur()
                setHoveredCat(null)
                selectCategory(c.id)
              }}
            >
              <Icon width={16} height={16} />
            </button>
          )
        })}
      </div>

      {hoveredCat && (
        <div
          className="emoji-cat-tooltip"
          style={{ left: hoveredCat.left }}
          aria-hidden
        >
          {hoveredCat.label}
        </div>
      )}

      {failed ? (
        <div className="emoji-status">{t('emoji.loadFailed')}</div>
      ) : !catalog ? (
        <div className="emoji-skel" aria-hidden>
          {Array.from({ length: 28 }, (_, i) => (
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
            setScrollTop((e.currentTarget as HTMLDivElement).scrollTop)
            setTonePop(null)
            setHoveredCat(null)
          }}
        >
          <div style={{ height: startRow * ROW_H }} />
          {Array.from({ length: endRow - startRow }, (_, i) => {
            const row = startRow + i
            const slice = items.slice(row * COLS, row * COLS + COLS)
            return (
              <div key={row} className="emoji-row">
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
                      <Glyph file={item.file} size={26} />
                    </button>
                  )
                })}
              </div>
            )
          })}
          <div style={{ height: Math.max(0, (rows - endRow) * ROW_H) }} />
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
