/**
 * SegmentedControl — icon segmented control used by the shelf filter bar and
 * the emoji category bar.
 *
 * Geometry is pure CSS: every slot has the same fixed width, so the thumb's
 * position is just `--i × slot`. Nothing is measured, so it can never drift
 * out of line with the icons.
 *
 * The thumb is a white pill that clips a second, black copy of the icons.
 * The thumb slides by +i slots and the copy inside it by −i slots, both with
 * the same spring, so the copy stays still and an icon reads black exactly
 * where the thumb covers it. Both are CSS translate transitions, so the
 * browser's compositor runs them with no per-frame JS.
 *
 * Pointer: the thumb follows the pointer from the moment it goes down (and
 * slides along if you drag across the slots); the choice commits on release,
 * so a press can still be cancelled by dragging back.
 */
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

import '../styles/SegmentedControl.css'

export interface SegmentedItem<T extends string> {
  value: T
  label: string
  icon: ReactNode
}

export interface SegmentedControlProps<T extends string> {
  items: SegmentedItem<T>[]
  /** Selected value; `null` (or a value not in `items`) shows no thumb. */
  value: T | null
  onChange: (value: T) => void
  /** Pointer entered a slot (used to warm data before a click). */
  onHoverItem?: (value: T) => void
  ariaLabel: string
  /** Snap instead of sliding (the app's Reduce motion setting). */
  reduceMotion?: boolean
  /** -1 removes every slot from the tab order (control hidden). */
  tabIndex?: number
  className?: string
}

export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  onHoverItem,
  ariaLabel,
  reduceMotion = false,
  tabIndex,
  className = ''
}: SegmentedControlProps<T>) {
  const selected = items.findIndex((item) => item.value === value)
  const [preview, setPreview] = useState<number | null>(null)

  // With nothing selected the thumb fades out where it last was, so it
  // slides from there (rather than from slot 0) when a slot is chosen again.
  const lastShown = useRef(Math.max(0, selected))
  const shown = preview ?? (selected >= 0 ? selected : lastShown.current)
  lastShown.current = shown
  const thumbHidden = preview === null && selected < 0

  const trackRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  // The live press lives in a ref (not state) so the release handler always
  // sees the latest slot, even if React has not re-rendered since the move.
  const press = useRef<{ id: number; slots: { l: number; r: number }[]; at: number } | null>(null)

  const commit = (i: number) => {
    const item = items[i]
    if (item && i !== selected) onChange(item.value)
  }

  const slotAt = (clientX: number): number => {
    const slots = press.current?.slots ?? []
    for (let i = 0; i < slots.length; i++) if (clientX < slots[i].r) return i
    return slots.length - 1
  }

  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>, i: number) => {
    if (e.button !== 0 || press.current) return
    const track = trackRef.current
    if (!track) return
    press.current = {
      id: e.pointerId,
      slots: itemRefs.current.map((el) => {
        const r = el?.getBoundingClientRect()
        return { l: r?.left ?? 0, r: r?.right ?? 0 }
      }),
      at: i
    }
    try { track.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    setPreview(i)
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!press.current || e.pointerId !== press.current.id) return
    const i = slotAt(e.clientX)
    if (i !== press.current.at) {
      press.current.at = i
      setPreview(i)
    }
  }

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!press.current || e.pointerId !== press.current.id) return
    const target = press.current.at
    press.current = null
    setPreview(null)
    commit(target)
  }

  // Lost capture or cancel before release: drop the preview, keep the value.
  const handlePointerAbort = (e: PointerEvent<HTMLDivElement>) => {
    if (!press.current || e.pointerId !== press.current.id) return
    press.current = null
    setPreview(null)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = items.length - 1
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(last, i + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, i - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    if (next === null) return
    e.preventDefault()
    commit(next)
    itemRefs.current[next]?.focus()
  }

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className={`seg${reduceMotion ? ' seg--instant' : ''}${className ? ` ${className}` : ''}`}
      data-empty={thumbHidden ? '' : undefined}
      data-held={preview !== null ? '' : undefined}
      style={{ '--i': shown } as CSSProperties}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerAbort}
      onLostPointerCapture={handlePointerAbort}
    >
      {items.map((item, i) => (
        <button
          key={item.value}
          ref={(el) => { itemRefs.current[i] = el }}
          type="button"
          role="radio"
          aria-checked={i === selected}
          aria-label={item.label}
          title={item.label}
          tabIndex={tabIndex ?? (i === (selected >= 0 ? selected : 0) ? 0 : -1)}
          className="seg__item"
          onPointerDown={(e) => handlePointerDown(e, i)}
          onPointerEnter={onHoverItem ? () => onHoverItem(item.value) : undefined}
          // Keyboard activation (Enter/Space) arrives as a click with detail 0;
          // pointer clicks are already handled on release above.
          onClick={(e) => { if (e.detail === 0) commit(i) }}
          onKeyDown={(e) => handleKeyDown(e, i)}
        >
          {item.icon}
        </button>
      ))}
      <div className="seg__thumb" aria-hidden="true">
        <div className="seg__ink">
          {items.map((item) => (
            <span key={item.value} className="seg__slot">{item.icon}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default SegmentedControl
