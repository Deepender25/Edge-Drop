/**
 * CardMenu — the right-click menu of an item card, and the note editor it
 * turns into.
 *
 * One instance for the whole shelf (mounted next to the other flyouts),
 * rendered only while open, so it costs nothing the rest of the time. It is
 * portaled to <body> because the blade clips its children; the store keeps
 * its on-screen box (cardMenuRect) so the hover-close logic treats it as part
 * of the shelf.
 *
 * Placement: at the pointer, like a normal context menu, opening toward the
 * middle of the screen (right of the pointer in the left / top dock, left of
 * it in the right dock), flipped and clamped to stay inside the window. It
 * may extend past the blade into the (already interactive) window area; the
 * hover-close logic treats its box as part of the shelf.
 *
 * Closing: picking an action, a click or wheel outside (a click outside only
 * dismisses, like a Windows menu, so it can never paste the card under it),
 * Escape, the window changing size, the item disappearing, or the shelf
 * closing (setOpen(false) clears it). While editing, clicking outside or
 * switching to another app saves, Escape cancels. After the menu closes the
 * shelf waits a moment before hover-closing (cardMenuStayUntil), so a
 * pointer left outside the blade by the menu has time to come back.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ClipboardItemDto } from '../../shared/types'
import { NOTE_MAX, normalizeNote } from '../../shared/itemMeta'
import { registerCardEditorCommit, useStore } from '../store/appStore'
import { useTranslation } from '../i18n'
import { edge } from '../lib/edge'
import { tryPaste } from '../lib/tryPaste'
import { colorFormats, type ColorFormat } from '../lib/colorUtils'
import { cleanLink, externalHref } from '../lib/urlPreview'
import { acquireKeyboard, releaseKeyboard } from '../lib/keyboardFocus'
import { playCardExpandSound, playDeleteSound, playToggleSound } from '../lib/soundEffects'
import {
  CopyIcon,
  DownloadIcon,
  ExpandIcon,
  ContractIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  LinkIcon,
  PaletteIcon,
  PasteIcon,
  PinFillIcon,
  NoteIcon,
  PinIcon,
  TrashIcon,
  TypeIcon
} from './icons'
import '../styles/cardMenu.css'

/** Keyboard-focus holder name for the note editor. */
const EDITOR_FOCUS_OWNER = 'card-meta'
/** Space kept between the menu and the edge of its allowed area. */
const EDGE_GAP = 8
/** Gap between the pointer and the menu corner. */
const POINTER_GAP = 2
/** How long the shelf must stay unfocused before the editor treats it as an app switch. */
const EDITOR_BLUR_GRACE_MS = 250

export interface MenuRegion {
  left: number
  top: number
  right: number
  bottom: number
}

export interface MenuPlacement {
  left: number
  top: number
  /** Corner the menu grows from (it opens away from the pointer). */
  origin: 'top left' | 'top right' | 'bottom left' | 'bottom right'
}

/**
 * Put a menu of `size` next to the pointer, below it and on the `prefer`
 * side; flipped to the other side when it would cross the region, then
 * clamped inside.
 */
export function placeMenu(
  anchor: { x: number; y: number },
  size: { w: number; h: number },
  region: MenuRegion,
  prefer: 'right' | 'left' = 'right'
): MenuPlacement {
  const rightOf = anchor.x + POINTER_GAP
  const leftOf = anchor.x - size.w - POINTER_GAP
  const fitsRight = rightOf + size.w <= region.right
  const fitsLeft = leftOf >= region.left
  const flipX = prefer === 'right' ? !fitsRight && fitsLeft : !(!fitsLeft && fitsRight)
  let left = flipX ? leftOf : rightOf
  // Neither side fits: keep the preferred side as close as the area allows.
  if (!fitsRight && !fitsLeft) left = prefer === 'right' ? rightOf : leftOf
  left = Math.min(Math.max(left, region.left), Math.max(region.left, region.right - size.w))

  let top = anchor.y + POINTER_GAP
  let flipY = false
  if (top + size.h > region.bottom) {
    top = anchor.y - size.h - POINTER_GAP
    flipY = true
  }
  top = Math.min(Math.max(top, region.top), Math.max(region.top, region.bottom - size.h))

  return {
    left: Math.round(left),
    top: Math.round(top),
    origin: `${flipY ? 'bottom' : 'top'} ${flipX ? 'right' : 'left'}` as MenuPlacement['origin']
  }
}

/**
 * Where the menu may go: the whole window (side docks: the blade plus the
 * transparent strip beside it). Top dock: the blade's width (the window has
 * 30px gutters for the corner flares) and the full window height.
 */
function menuRegion(isHorizontal: boolean): MenuRegion {
  const win = { left: EDGE_GAP, top: EDGE_GAP, right: window.innerWidth - EDGE_GAP, bottom: window.innerHeight - EDGE_GAP }
  if (!isHorizontal) return win
  const blade = document.querySelector('.blade')?.getBoundingClientRect()
  if (!blade || blade.width <= 0) return win
  return {
    left: Math.max(win.left, blade.left + EDGE_GAP),
    right: Math.min(win.right, blade.right - EDGE_GAP),
    top: win.top,
    bottom: win.bottom
  }
}

/**
 * Arm a one-shot click blocker: the click that follows a pointer-down used to
 * dismiss the menu must not reach the card under it (that would paste). Lives
 * outside the component because the menu unmounts before the click arrives.
 */
function swallowNextOutsideClick(): void {
  const until = Date.now() + 700
  const onClick = (e: MouseEvent) => {
    document.removeEventListener('click', onClick, true)
    if (Date.now() > until) return
    const target = e.target as Element | null
    if (target?.closest?.('.card-menu')) return
    e.preventDefault()
    e.stopPropagation()
  }
  document.addEventListener('click', onClick, true)
  window.setTimeout(() => document.removeEventListener('click', onClick, true), 750)
}

function revealRect(itemId: string) {
  const el = document.querySelector(`.item-main[data-id="${CSS.escape(itemId)}"]`)
  const r = el?.getBoundingClientRect()
  return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : undefined
}

/** Full text of a text item (cards only hold the first 300 characters). */
async function fullTextOf(item: ClipboardItemDto): Promise<string> {
  if (item.data.kind !== 'text') return ''
  if (!item.data.hasFullPayload) return item.data.text
  try {
    const full = await edge.getFullText(item.id)
    return full || item.data.text
  } catch {
    return item.data.text
  }
}

export function CardMenu() {
  const menu = useStore((s) => s.cardMenu)
  const item = useStore((s) => (s.cardMenu ? s.items.find((it) => it.id === s.cardMenu!.itemId) : undefined))
  const stick = useStore((s) => s.settings.stickPosition)
  const isHorizontal = stick === 'top'
  // Open toward the middle of the screen.
  const prefer: 'right' | 'left' = stick === 'right' ? 'left' : 'right'
  const closeCardMenu = useStore((s) => s.closeCardMenu)
  const boxRef = useRef<HTMLDivElement>(null)
  const commitRef = useRef<(() => void) | null>(null)
  // The shelf closing while the editor is open saves it (see setOpen).
  useEffect(() => {
    registerCardEditorCommit(() => commitRef.current?.())
    return () => registerCardEditorCommit(null)
  }, [])
  const [placement, setPlacement] = useState<MenuPlacement | null>(null)

  // The item was deleted / merged away (auto-delete, another window).
  useEffect(() => {
    if (menu && !item) closeCardMenu()
  }, [menu, item, closeCardMenu])

  // The editor's keyboard hold ends with edit mode (or a pointer-down on
  // "Add note" that never became a click).
  const editing = menu?.mode === 'edit'
  useEffect(() => {
    if (!editing) releaseKeyboard(EDITOR_FOCUS_OWNER)
  }, [editing, menu])

  /** Close; while editing, `save` keeps what was typed (outside click, app switch). */
  const dismiss = useCallback((save: boolean) => {
    const s = useStore.getState()
    if (!s.cardMenu) return
    if (save && s.cardMenu.mode === 'edit') commitRef.current?.()
    useStore.getState().closeCardMenu()
  }, [])

  // Measure, place, and publish the box for hover-close. Re-runs when the
  // content changes size (menu -> editor, chips wrapping).
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!menu || !el) {
      setPlacement(null)
      return
    }
    const place = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      const p = placeMenu({ x: menu.x, y: menu.y }, { w, h }, menuRegion(isHorizontal), prefer)
      setPlacement((prev) => (prev && prev.left === p.left && prev.top === p.top && prev.origin === p.origin ? prev : p))
      const r = { left: p.left, top: p.top, right: p.left + w, bottom: p.top + h }
      const cur = useStore.getState().cardMenuRect
      if (!cur || cur.left !== r.left || cur.top !== r.top || cur.right !== r.right || cur.bottom !== r.bottom) {
        useStore.getState().setCardMenuRect(r)
      }
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    return () => ro.disconnect()
  }, [menu, isHorizontal, prefer])

  // Outside interactions.
  useEffect(() => {
    if (!menu) return
    const inside = (t: EventTarget | null) => t instanceof Element && !!t.closest('.card-menu')
    const onPointerDown = (e: PointerEvent) => {
      if (inside(e.target)) return
      if (e.button === 0) swallowNextOutsideClick()
      dismiss(true)
    }
    const onWheel = (e: WheelEvent) => {
      if (!inside(e.target)) dismiss(true)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Owns Escape while open: cancel the menu / editor, never the panel.
      e.preventDefault()
      e.stopPropagation()
      dismiss(false)
    }
    // Only a real size change (dock switch, display change) closes the
    // menu; Windows can fire resize for style-only updates when the shelf
    // takes or returns keyboard focus.
    const openSize = { w: window.innerWidth, h: window.innerHeight }
    const onResize = () => {
      if (window.innerWidth !== openSize.w || window.innerHeight !== openSize.h) dismiss(true)
    }
    // Switching to another app while typing keeps what was typed. Only a
    // blur that lasts counts: a momentary focus blip during the keyboard
    // hand-over must not close the editor.
    let blurTimer: number | undefined
    const onBlur = () => {
      if (useStore.getState().cardMenu?.mode !== 'edit' || useStore.getState().demo) return
      window.clearTimeout(blurTimer)
      blurTimer = window.setTimeout(() => {
        if (!document.hasFocus() && useStore.getState().cardMenu?.mode === 'edit') dismiss(true)
      }, EDITOR_BLUR_GRACE_MS)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('wheel', onWheel, { capture: true, passive: true })
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('blur', onBlur)
      window.clearTimeout(blurTimer)
    }
  }, [menu, dismiss])

  if (!menu || !item) return null

  return createPortal(
    <div
      ref={boxRef}
      className={`card-menu${editing ? ' is-editing' : ''}${placement ? ' is-placed' : ''}`}
      role={editing ? 'dialog' : 'menu'}
      style={{
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        transformOrigin: placement?.origin ?? 'top left'
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {editing ? (
        <MetaEditor
          key={item.id}
          item={item}
          commitRef={commitRef}
          onDone={() => useStore.getState().closeCardMenu()}
        />
      ) : (
        <MenuList item={item} />
      )}
    </div>,
    document.body
  )
}

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

function MenuRow({
  icon,
  label,
  onSelect,
  onPress,
  danger
}: {
  icon: ReactNode
  label: string
  onSelect: () => void
  onPress?: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`card-menu-row${danger ? ' is-danger' : ''}`}
      // Never take focus from a field the user may be typing in.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.button === 0) onPress?.()
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      <span className="card-menu-icon" aria-hidden="true">{icon}</span>
      <span className="card-menu-label">{label}</span>
    </button>
  )
}

function Separator() {
  return <div className="card-menu-sep" role="separator" />
}

const FORMAT_LABEL: Record<ColorFormat, string> = { hex: 'HEX', rgb: 'RGB', hsl: 'HSL' }

function MenuList({ item }: { item: ClipboardItemDto }) {
  const { t } = useTranslation()
  const isPreviewing = useStore((s) => s.previewItemId === item.id)
  const close = () => useStore.getState().closeCardMenu()
  const store = () => useStore.getState()

  const d = item.data
  const isText = d.kind === 'text'
  const text = isText ? d.text : ''
  const isLink = isText && d.isUrl
  const colors = isText && !d.isUrl ? colorFormats(text) : null
  const canPastePlain = isText && !colors && (!!d.hasHtml || text.includes('\t'))
  // the real destination of a redirect link, tracking removed, stray punctuation dropped
  const canCleanLink = isLink && (!!d.hasFullPayload || cleanLink(text) !== text.trim())
  const isImage = d.kind === 'image' || d.kind === 'image-collection'
  const filePaths = d.kind === 'files' ? d.paths : []

  const copyText = (value: string) => {
    void store().copyText(value)
    close()
  }

  const typeRows: ReactNode[] = []
  if (isLink) {
    typeRows.push(
      <MenuRow
        key="open"
        icon={<ExternalLinkIcon />}
        label={t('menu.openLink')}
        onSelect={() => {
          close()
          void fullTextOf(item).then((full) => window.open(externalHref(full), '_blank'))
        }}
      />
    )
    if (canCleanLink) {
      typeRows.push(
        <MenuRow
          key="clean"
          icon={<LinkIcon />}
          label={t('menu.copyCleanLink')}
          onSelect={() => {
            close()
            void fullTextOf(item).then((full) => store().copyText(cleanLink(full)))
          }}
        />
      )
    }
  }
  if (colors) {
    const others = (['hex', 'rgb', 'hsl'] as const).filter((f) => f !== colors.source)
    typeRows.push(
      <div key="colors" className="card-menu-row card-menu-colors" role="group" aria-label={t('menu.copyAs')}>
        <span className="card-menu-icon" aria-hidden="true"><PaletteIcon /></span>
        <span className="card-menu-label">{t('menu.copyAs')}</span>
        <span className="card-menu-chips">
          {others.map((f) => (
            <button
              key={f}
              type="button"
              role="menuitem"
              className="card-menu-chip"
              title={colors[f]}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation()
                copyText(colors[f])
              }}
            >
              {FORMAT_LABEL[f]}
            </button>
          ))}
        </span>
      </div>
    )
  }
  if (filePaths.length > 0) {
    typeRows.push(
      <MenuRow
        key="reveal"
        icon={<FolderOpenIcon />}
        label={t('menu.showInFolder')}
        onSelect={() => {
          close()
          void edge.revealFile(filePaths[0]).then((ok) => {
            if (!ok) store().pushToast({ id: `reveal-${Date.now()}`, message: t('toast.fileUnavailable'), tone: 'error' })
          })
        }}
      />,
      <MenuRow
        key="path"
        icon={<CopyIcon />}
        label={filePaths.length > 1 ? t('menu.copyPaths') : t('menu.copyPath')}
        onSelect={() => copyText(filePaths.join('\r\n'))}
      />
    )
  }
  if (isImage) {
    typeRows.push(
      <MenuRow
        key="save"
        icon={<DownloadIcon />}
        label={t('menu.saveToDownloads')}
        onSelect={() => {
          close()
          void store().saveImages(item.id)
        }}
      />
    )
  }

  return (
    <div className="card-menu-list" aria-label={t('menu.title')}>
      <MenuRow
        icon={<PasteIcon />}
        label={t('menu.paste')}
        onSelect={() => {
          close()
          tryPaste(() => void store().paste(item.id))
        }}
      />
      {canPastePlain && (
        <MenuRow
          icon={<TypeIcon />}
          label={t('menu.pastePlain')}
          onSelect={() => {
            close()
            tryPaste(() => void store().paste(item.id, { plain: true }))
          }}
        />
      )}
      <MenuRow
        icon={<CopyIcon />}
        label={t('item.copy')}
        onSelect={() => {
          close()
          void store().copy(item.id).then((ok) => {
            if (ok) store().pushToast({ id: `copied-${Date.now()}`, message: t('toast.copiedToClipboard'), tone: 'info' })
          })
        }}
      />
      <Separator />
      <MenuRow
        icon={<NoteIcon />}
        label={item.note ? t('menu.editNote') : t('menu.addNote')}
        // Borrow the keyboard on pointer-down: the shelf window may never
        // see a focus event from a plain click (NOACTIVATE).
        onPress={() => void acquireKeyboard(EDITOR_FOCUS_OWNER)}
        onSelect={() => store().editCardMeta()}
      />
      <MenuRow
        icon={item.pinned ? <PinFillIcon /> : <PinIcon />}
        label={item.pinned ? t('item.unpin') : t('item.pin')}
        onSelect={() => {
          close()
          playToggleSound(!item.pinned)
          void store().togglePin(item.id, !item.pinned)
        }}
      />
      {typeRows.length > 0 && <Separator />}
      {typeRows}
      <Separator />
      <MenuRow
        icon={isPreviewing ? <ContractIcon /> : <ExpandIcon />}
        label={isPreviewing ? t('menu.closePreview') : t('menu.preview')}
        onSelect={() => {
          close()
          playCardExpandSound(!isPreviewing)
          store().setPreviewItemId(isPreviewing ? null : item.id, isPreviewing ? undefined : revealRect(item.id))
        }}
      />
      <MenuRow
        icon={<TrashIcon />}
        label={t('item.delete')}
        danger
        onSelect={() => {
          close()
          playDeleteSound()
          void store().remove(item.id)
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Note editor                                                         */
/* ------------------------------------------------------------------ */

function MetaEditor({
  item,
  commitRef,
  onDone
}: {
  item: ClipboardItemDto
  commitRef: React.MutableRefObject<(() => void) | null>
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [note, setNote] = useState(item.note ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  // Hold the keyboard while the editor is open (acquired on the menu row's
  // pointer-down already; this is a no-op then) and put the caret in.
  useEffect(() => {
    // The onboarding tour plays the editor: the caret goes in, the keyboard is never borrowed.
    if (useStore.getState().demo) {
      inputRef.current?.focus({ preventScroll: true })
      inputRef.current?.select()
      return
    }
    let alive = true
    void acquireKeyboard(EDITOR_FOCUS_OWNER).then(() => {
      if (!alive) return
      try {
        inputRef.current?.focus()
        inputRef.current?.select()
      } catch { /* ignore */ }
    })
    return () => {
      alive = false
      releaseKeyboard(EDITOR_FOCUS_OWNER)
    }
  }, [])

  const save = useCallback(() => {
    const next = normalizeNote(note)
    if ((next ?? '') !== (item.note ?? '')) void useStore.getState().setItemMeta(item.id, { note: next ?? null })
    onDone()
  }, [note, item, onDone])
  commitRef.current = save

  const remove = () => {
    void useStore.getState().setItemMeta(item.id, { note: null })
    onDone()
  }

  return (
    <form
      className="card-meta-editor"
      aria-label={item.note ? t('menu.editNote') : t('menu.addNote')}
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <label className="card-meta-field">
        <span className="card-meta-caption">{t('menu.note')}</span>
        <input
          ref={inputRef}
          className="card-meta-input"
          value={note}
          maxLength={NOTE_MAX}
          placeholder={t('menu.notePlaceholder')}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setNote(e.target.value)}
        />
        <span className="card-meta-hint">{t('menu.noteHint')}</span>
      </label>

      <div className="card-meta-actions">
        {item.note && (
          <button
            type="button"
            className="card-meta-btn is-quiet"
            onMouseDown={(e) => e.preventDefault()}
            onClick={remove}
          >
            {t('menu.removeNote')}
          </button>
        )}
        <span className="card-meta-spacer" />
        <button
          type="button"
          className="card-meta-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDone}
        >
          {t('menu.cancel')}
        </button>
        <button type="submit" className="card-meta-btn is-primary" onMouseDown={(e) => e.preventDefault()}>
          {t('menu.save')}
        </button>
      </div>
    </form>
  )
}
