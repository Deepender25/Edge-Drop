/**
 * Copy confirmation at the stick edge.
 *
 * A small liquid tab grows out of the edge bar with a soft spring, the icon
 * pops in just behind it, holds, then the icon goes first and the tab draws
 * back into the bar. Same shape and motion in every dock.
 *
 * All motion is CSS transform/opacity transitions (see `.copy-ind` in
 * panel.css), so the compositor runs it with no per-frame JS. The element
 * stays mounted and is hidden at rest, so a copy during the exit simply
 * reverses the motion instead of restarting it.
 */
import { useMemo, type CSSProperties } from 'react'
import { useStore } from '../store/appStore'
import { OCTO_PATH } from './LiquidOctopusLoader'
import { COPY_TAB_BEHIND_EDGE, COPY_TAB_DEPTH, copyTabPath, edgeBarCenter } from '../lib/copyIndicatorShape'

const ICON_FILTER = 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35))'

export function LogoIndicatorIcon({
  fillColor = '#ffffff',
  size = 36
}: {
  fillColor?: string
  glowColor?: string
  size?: number
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: ICON_FILTER
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="140 10 320 310"
        fill="none"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <path
          d={OCTO_PATH}
          fill={fillColor}
          fillRule="evenodd"
        />
      </svg>
    </div>
  )
}

export function TickIndicatorIcon({
  fillColor = '#ffffff',
  size = 36,
  draw = false
}: {
  color?: string
  fillColor?: string
  glowColor?: string
  size?: number
  /** Let the copy indicator draw the stroke in (CSS, `.copy-ind .tick-draw`). */
  draw?: boolean
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: ICON_FILTER
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <path
          d="M 5.0 12.5 L 9.5 17.0 L 22.8 2.8"
          stroke={fillColor}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...(draw ? { className: 'tick-draw', pathLength: 1 } : {})}
        />
      </svg>
    </div>
  )
}

export function CopyIndicatorIcon({
  fillColor = '#ffffff',
  size = 36
}: {
  fillColor?: string
  glowColor?: string
  size?: number
}) {
  const maskId = 'copy-icon-gap-mask'

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: ICON_FILTER
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="24" height="24" fill="#ffffff" />
            <rect x="6.8" y="0.8" width="16.4" height="16.4" rx="5.8" fill="#000000" />
          </mask>
        </defs>
        <rect
          x="2.5"
          y="8.5"
          width="13"
          height="13"
          rx="4.2"
          fill={fillColor}
          mask={`url(#${maskId})`}
        />
        <rect
          x="8.5"
          y="2.5"
          width="13"
          height="13"
          rx="4.2"
          fill={fillColor}
        />
      </svg>
    </div>
  )
}

export function SparkleIndicatorIcon({
  fillColor = '#ffffff',
  size = 36
}: {
  fillColor?: string
  glowColor?: string
  size?: number
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: ICON_FILTER
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <path
          d="M 9.5 1.5 C 9.5 5.8 5.8 9.5 1.5 9.5 C 5.8 9.5 9.5 13.2 9.5 17.5 C 9.5 13.2 13.2 9.5 17.5 9.5 C 13.2 9.5 9.5 5.8 9.5 1.5 Z"
          fill={fillColor}
        />
        <path
          d="M 18.5 12.5 C 18.5 15.2 16.2 17.5 13.5 17.5 C 16.2 17.5 18.5 19.8 18.5 22.5 C 18.5 19.8 20.8 17.5 23.5 17.5 C 20.8 17.5 18.5 15.2 18.5 12.5 Z"
          fill={fillColor}
        />
      </svg>
    </div>
  )
}

export function CopyIndicatorCurve() {
  const copyFlareActive = useStore((s) => s.copyFlareActive)
  const open = useStore((s) => s.open)
  const settings = useStore((s) => s.settings)
  const dock = settings.stickPosition === 'right' ? 'right' : settings.stickPosition === 'top' ? 'top' : 'left'
  const indicatorStyle = settings.copyIndicatorStyle || 'logo'
  const barWidth = settings.hotZoneWidth || 3

  const shape = useMemo(() => copyTabPath(barWidth), [barWidth])

  if (settings.showCopyIndicator === false) return null

  const on = copyFlareActive && !open
  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const along = edgeBarCenter(settings, viewport)

  // Anchor: a zero-size point on the screen edge at the middle of the bar.
  const anchor: CSSProperties =
    dock === 'top'
      ? { top: 0, left: along }
      : { top: along, [dock]: 0 }

  const svgW = COPY_TAB_BEHIND_EDGE + COPY_TAB_DEPTH + 8
  const svgH = shape.halfLength * 2

  let className = `copy-ind copy-ind--${dock}`
  if (on) className += ' is-on'
  if (settings.reduceMotion) className += ' is-reduced'

  return (
    <div
      className={className}
      aria-hidden="true"
      style={{ ...anchor, '--copy-tab-start': `${barWidth / COPY_TAB_DEPTH}` } as CSSProperties}
    >
      <div className="copy-ind__orient">
        <svg
          className="copy-ind__shape"
          width={svgW}
          height={svgH}
          viewBox={`${-COPY_TAB_BEHIND_EDGE} ${-shape.halfLength} ${svgW} ${svgH}`}
          style={{
            left: -COPY_TAB_BEHIND_EDGE,
            top: -shape.halfLength,
            transformOrigin: `${COPY_TAB_BEHIND_EDGE}px ${shape.halfLength}px`
          }}
        >
          <path d={shape.d} fill="#000000" />
        </svg>
      </div>
      <div className="copy-ind__icon">
        {indicatorStyle === 'check' ? (
          <TickIndicatorIcon fillColor="#ffffff" size={26} draw />
        ) : indicatorStyle === 'copy' ? (
          <CopyIndicatorIcon fillColor="#ffffff" size={24} />
        ) : indicatorStyle === 'sparkle' ? (
          <SparkleIndicatorIcon fillColor="#ffffff" size={26} />
        ) : (
          <LogoIndicatorIcon fillColor="#ffffff" size={30} />
        )}
      </div>
    </div>
  )
}
