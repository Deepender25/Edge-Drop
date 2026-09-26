/**
 * RubberSegment — rubber-band elastic segmented control with momentum gliding and clip-path thumb.
 *
 * Adapted for TypeScript and Framer Motion v11.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue
} from 'framer-motion'

import '../styles/RubberSegment.css'

const EASE_OUT = [0.23, 1, 0.32, 1] as const
const SPRING_UI = { type: 'spring' as const, duration: 0.3, bounce: 0 }
const SPRING_MOMENTUM = { type: 'spring' as const, duration: 0.4, bounce: 0.2 }
const SPRING_RELAX = { type: 'spring' as const, duration: 0.16, bounce: 0 }
const DILATE = 0.19
const HANDOFF = 0.15
const FLICK = 110
const MAX_VELOCITY = 2000
const DEADZONE = 4
const SLOP = 10
const RUBBER = 0.55

const SIZES = {
  sm: { height: 26, font: 12, pad: 0, min: 22 },
  md: { height: 28, font: 13, pad: 0, min: 24 },
  lg: { height: 36, font: 13, pad: 14, min: 44 }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const rubber = (over: number, dim: number) => (over * dim * RUBBER) / (dim + RUBBER * Math.abs(over))
const project = (v: number, glide: number) => {
  const d = 1 - 0.1 * Math.pow(0.05, glide / 100)
  return ((v / 1000) * d) / (1 - d)
}
const velocityOf = (hist: [number, number][], now: number) => {
  const recent = hist.filter(([t]) => now - t <= 100)
  if (recent.length < 2) return 0
  const [t0, x0] = recent[0]
  const [t1, x1] = recent[recent.length - 1]
  return t1 - t0 >= 8 ? ((x1 - x0) / (t1 - t0)) * 1000 : 0
}
const nearestSlot = (slots: { l: number; r: number }[], x: number) => {
  let best = 0
  for (let i = 1; i < slots.length; i++) {
    if (Math.abs((slots[i].l + slots[i].r) / 2 - x) < Math.abs((slots[best].l + slots[best].r) / 2 - x)) best = i
  }
  return best
}

export interface RubberSegmentItem<T extends string = string> {
  value: T
  label: string
  icon?: ReactNode
  title?: string
  disabled?: boolean
}

export interface RubberSegmentProps<T extends string = string> {
  items: (RubberSegmentItem<T> | string)[]
  value?: T
  defaultValue?: T
  onChange?: (value: T, index: number) => void
  onHoverItem?: (value: T) => void
  trackColor?: string
  thumbColor?: string
  textColor?: string
  activeTextColor?: string
  size?: 'sm' | 'md' | 'lg' | 'custom'
  height?: number
  minWidth?: number
  padding?: number
  radius?: number
  inset?: number
  equalSlots?: boolean
  stretch?: number
  squash?: number
  speed?: number
  glide?: number
  draggable?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
  tabIndex?: number
}

interface DragState {
  id: number
  x0: number
  slot: number
  onThumb: boolean
  live: boolean
  offset: number
  w: number
  hist: [number, number][]
}

export default function RubberSegment<T extends string = string>({
  items,
  value,
  defaultValue,
  onChange,
  onHoverItem,
  trackColor = '#141414',
  thumbColor = '#ffffff',
  textColor = 'rgba(255, 255, 255, 0.72)',
  activeTextColor = '#000000',
  size = 'md',
  height,
  minWidth,
  padding,
  radius = 9999,
  inset = 2,
  equalSlots = true,
  stretch = 80,
  squash = 2,
  speed = 1,
  glide = 60,
  draggable = true,
  disabled = false,
  className = '',
  'aria-label': ariaLabel = 'Segmented control',
  tabIndex
}: RubberSegmentProps<T>) {
  const list: RubberSegmentItem<T>[] = items.map((item) =>
    typeof item === 'string' ? { value: item as T, label: item } : item
  )
  const [inner, setInner] = useState<T>(() => (defaultValue ?? list[0]?.value) as T)
  const current = value !== undefined ? value : inner
  const index = Math.max(
    0,
    list.findIndex((item) => item.value === current)
  )
  const reduce = useReducedMotion()

  const trackRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const slots = useRef<{ l: number; r: number }[]>([])
  const box = useRef<DOMRect | null>(null)
  const committed = useRef(index)
  const handoff = useRef<number | null>(null)
  const drag = useRef<DragState | null>(null)
  const gen = useRef(0)

  // edgeL starts far off-canvas so the very first paint renders the thumb
  // fully clipped (invisible) instead of a full-width white flash: measured
  // slot values set in the layout effect only reach the DOM on a later frame
  // (motion values apply asynchronously), and 0/0/0 means zero clipping.
  const edgeL = useMotionValue(10000)
  const edgeR = useMotionValue(0)
  const innerW = useMotionValue(0)
  const thumbRadius = Math.max(0, radius - inset)
  const clipPath = useTransform(
    () => `inset(0px ${Math.max(0, innerW.get() - edgeR.get())}px 0px ${Math.max(0, edgeL.get())}px round ${thumbRadius}px)`
  )

  const t = (seconds: number) => seconds / speed

  const jumpTo = (i: number) => {
    const s = slots.current[i]
    if (!s) return
    if (handoff.current) clearTimeout(handoff.current)
    gen.current += 1
    edgeL.set(s.l)
    edgeR.set(s.r)
  }

  // Returns true when the track had real layout. Also writes the computed
  // clip straight onto the thumb element: motion values reach the DOM
  // asynchronously, so without this the first paint can show a stale clip
  // (full-white flash, or a never-appearing thumb if timing slips). The
  // string matches the motion path exactly, so framer taking over later
  // causes no visual jump.
  const measure = (): boolean => {
    const track = trackRef.current
    if (!track) return false
    const rect = track.getBoundingClientRect()
    box.current = rect
    slots.current = list.map((_, i) => {
      const el = itemRefs.current[i]
      if (!el) return { l: 0, r: 0 }
      const r = el.getBoundingClientRect()
      return { l: r.left - rect.left - inset, r: r.right - rect.left - inset }
    })
    innerW.set(rect.width - inset * 2)
    jumpTo(committed.current)
    try {
      const el = thumbRef.current
      const s = slots.current[committed.current]
      if (el && s) {
        const w = Math.max(0, rect.width - inset * 2)
        el.style.clipPath =
          `inset(0px ${Math.max(0, w - s.r)}px 0px ${Math.max(0, s.l)}px round ${thumbRadius}px)`
      }
    } catch { /* ignore */ }
    return rect.width > 0
  }

  const listKey = list.map((item) => item.value).join('|')
  useLayoutEffect(() => {
    const laidOut = measure()
    // Backstop: if the track had no layout yet (mounted hidden), retry on
    // frames (bounded) until it does, so the thumb can never stick hidden.
    // The ResizeObserver below is the primary path for show events.
    let tries = 0
    let raf = 0
    if (!laidOut) {
      const ensure = () => {
        if (measure()) return
        if (tries++ < 60) raf = requestAnimationFrame(ensure)
      }
      raf = requestAnimationFrame(ensure)
    }
    const observer = new ResizeObserver(() => measure())
    if (trackRef.current) observer.observe(trackRef.current)
    if (typeof document !== 'undefined' && (document as Document).fonts) {
      void (document as Document).fonts.ready.then(() => measure()).catch(() => {})
    }
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, size, inset, equalSlots, height, minWidth])

  useEffect(() => {
    if (!drag.current && committed.current !== index) {
      committed.current = index
      jumpTo(index)
    }
  })

  useEffect(
    () => () => {
      if (handoff.current) clearTimeout(handoff.current)
      edgeL.stop()
      edgeR.stop()
    },
    [edgeL, edgeR]
  )

  const commit = (i: number) => {
    committed.current = i
    if (i === index) return
    if (value === undefined) setInner(list[i].value)
    onChange?.(list[i].value, i)
  }

  const land = (to: number, v: number | null, flick: boolean, withSquash: boolean) => {
    const b = slots.current[to]
    if (!b) return
    const g = ++gen.current
    const dir = Math.sign((b.l + b.r) / 2 - (edgeL.get() + edgeR.get()) / 2) || 1
    const [lead, leadTo, trail, trailTo] = dir > 0 ? [edgeR, b.r, edgeL, b.l] : [edgeL, b.l, edgeR, b.r]
    const velocityFor = (mv: MotionValue<number>) =>
      clamp(v === null ? mv.getVelocity() : v, -MAX_VELOCITY, MAX_VELOCITY)
    animate(lead, leadTo, {
      ...(flick ? SPRING_MOMENTUM : SPRING_UI),
      duration: t(flick ? 0.4 : 0.3),
      velocity: velocityFor(lead)
    })
    const trailVelocity = velocityFor(trail)
    if (!withSquash || squash <= 0) {
      animate(trail, trailTo, { ...SPRING_UI, duration: t(0.3), velocity: trailVelocity })
      return
    }
    void animate(trail, trailTo + dir * squash, {
      ...SPRING_UI,
      duration: t(0.3),
      velocity: trailVelocity
    }).then(() => {
      if (gen.current === g) animate(trail, trailTo, { ...SPRING_RELAX, duration: t(0.16) })
    })
  }

  const travel = (from: number, to: number) => {
    const a = slots.current[from]
    const b = slots.current[to]
    if (!a || !b) return
    if (handoff.current) clearTimeout(handoff.current)
    gen.current += 1
    if (reduce) {
      edgeL.set(b.l)
      edgeR.set(b.r)
      return
    }
    const u = stretch / 100
    const tween = { duration: t(DILATE), ease: EASE_OUT }
    animate(edgeL, b.l + (Math.min(a.l, b.l) - b.l) * u, tween)
    animate(edgeR, b.r + (Math.max(a.r, b.r) - b.r) * u, tween)
    handoff.current = window.setTimeout(() => land(to, null, false, true), t(HANDOFF) * 1000)
  }

  const localX = (e: React.PointerEvent | PointerEvent) =>
    e.clientX - (box.current ? box.current.left : 0) - inset

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>, i: number) => {
    if (disabled || drag.current || e.button !== 0) return
    if (!trackRef.current) return
    box.current = trackRef.current.getBoundingClientRect()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
    const x = localX(e)
    const onThumb = draggable && x >= edgeL.get() && x <= edgeR.get()
    drag.current = {
      id: e.pointerId,
      x0: x,
      slot: i,
      onThumb,
      live: false,
      offset: 0,
      w: 0,
      hist: [[e.timeStamp, x]]
    }
    if (onThumb) {
      if (handoff.current) clearTimeout(handoff.current)
      gen.current += 1
      edgeL.stop()
      edgeR.stop()
    } else if (!reduce) {
      e.currentTarget.dataset.pressed = ''
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id || !d.onThumb) return
    const x = localX(e)
    d.hist.push([e.timeStamp, x])
    if (d.hist.length > 8) d.hist.shift()
    if (!d.live) {
      if (Math.abs(x - d.x0) < DEADZONE) return
      d.live = true
      d.offset = x - edgeL.get()
      d.w = edgeR.get() - edgeL.get()
      if (trackRef.current) trackRef.current.dataset.held = ''
    }
    const width = innerW.get()
    const l = x - d.offset
    const maxL = width - d.w
    if (reduce) {
      const c = clamp(l, 0, maxL)
      edgeL.set(c)
      edgeR.set(c + d.w)
    } else if (l < 0) {
      edgeL.set(0)
      edgeR.set(d.w - rubber(-l, d.w))
    } else if (l > maxL) {
      edgeR.set(width)
      edgeL.set(maxL + rubber(l - maxL, d.w))
    } else {
      edgeL.set(l)
      edgeR.set(l + d.w)
    }
  }

  const release = () => {
    const d = drag.current
    if (!d) return null
    drag.current = null
    if (trackRef.current) delete trackRef.current.dataset.held
    const el = itemRefs.current[d.slot]
    if (el) delete el.dataset.pressed
    return d
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    release()
    const x = localX(e)
    if (!d.live) {
      if (Math.abs(x - d.x0) <= SLOP && d.slot !== committed.current) {
        const from = committed.current
        commit(d.slot)
        travel(from, d.slot)
      }
      return
    }
    const v = velocityOf(d.hist, e.timeStamp)
    const flick = Math.abs(v) > FLICK
    let to = nearestSlot(slots.current, (edgeL.get() + edgeR.get()) / 2 + project(v, glide))
    if (flick && to === committed.current) to = clamp(to + Math.sign(v), 0, list.length - 1)
    commit(to)
    if (reduce) jumpTo(to)
    else land(to, v, flick, flick)
  }

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    release()
    if (!d.live) return
    if (reduce) jumpTo(committed.current)
    else land(committed.current, null, false, false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    const last = list.length - 1
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(last, index + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, index - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    if (next === null) return
    e.preventDefault()
    if (next === index) return
    const from = committed.current
    commit(next)
    travel(from, next)
    itemRefs.current[next]?.focus()
  }

  const preset = size !== 'custom' ? SIZES[size] || SIZES.md : null
  const effH = height ?? preset?.height ?? 28
  const effPad = padding ?? preset?.pad ?? 0
  const effMin = minWidth ?? preset?.min ?? 28

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-equal={equalSlots ? '' : undefined}
      data-draggable={draggable && !disabled ? '' : undefined}
      className={`rubber-segment${className ? ` ${className}` : ''}`}
      style={{
        '--rs-track': trackColor,
        '--rs-thumb': thumbColor,
        '--rs-ink': textColor,
        '--rs-ink-active': activeTextColor,
        '--rs-radius': `${radius}px`,
        '--rs-inset': `${inset}px`,
        '--rs-thumb-radius': `${thumbRadius}px`,
        '--rs-h': `${effH}px`,
        '--rs-font': `${preset?.font ?? 13}px`,
        '--rs-pad': `${effPad}px`,
        '--rs-min': `${effMin}px`
      } as React.CSSProperties}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handlePointerCancel}
    >
      {list.map((item, i) => (
        <button
          key={item.value}
          ref={(el) => {
            itemRefs.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={i === index}
          aria-label={item.label}
          title={item.title || item.label}
          tabIndex={tabIndex !== undefined ? tabIndex : i === index ? 0 : -1}
          disabled={disabled || !!item.disabled}
          className="rubber-segment__item"
          onPointerDown={(e) => handlePointerDown(e, i)}
          onPointerEnter={() => onHoverItem?.(item.value)}
          onKeyDown={handleKeyDown}
        >
          {item.icon}
          {effPad > 0 && item.label ? <span className="rubber-segment__label">{item.label}</span> : null}
        </button>
      ))}
      <motion.div ref={thumbRef} className="rubber-segment__thumb" aria-hidden="true" style={{ clipPath }}>
        {list.map((item) => (
          <span key={item.value} className="rubber-segment__item rubber-segment__copy">
            {item.icon}
            {effPad > 0 && item.label ? <span className="rubber-segment__label">{item.label}</span> : null}
          </span>
        ))}
      </motion.div>
    </div>
  )
}
