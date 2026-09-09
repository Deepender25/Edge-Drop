/**
 * Copy confirmation at the stick edge.
 *
 * Apple-like: one purposeful enter, a still hold, a matching exit.
 * No looping bob, no glow bloom. Reduce Motion fades only.
 */
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/appStore'
import { LiquidOctopusLoader } from './LiquidOctopusLoader'

/** System confirmation ease — fast settle, no bounce. */
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]
const ENTER_MS = 0.3
const ICON_FILTER = 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35))'

export function TickIndicatorIcon({
  fillColor = '#ffffff',
  size = 36
}: {
  color?: string
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
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <motion.path
          d="M 5.0 12.5 L 9.5 17.0 L 22.8 2.8"
          stroke={fillColor}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
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
        <motion.rect
          x="2.5"
          y="8.5"
          width="13"
          height="13"
          rx="4.2"
          fill={fillColor}
          mask={`url(#${maskId})`}
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
        />
        <motion.rect
          x="8.5"
          y="2.5"
          width="13"
          height="13"
          rx="4.2"
          fill={fillColor}
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.28, ease: EASE_OUT, delay: 0.04 }}
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
        <motion.path
          d="M 9.5 1.5 C 9.5 5.8 5.8 9.5 1.5 9.5 C 5.8 9.5 9.5 13.2 9.5 17.5 C 9.5 13.2 13.2 9.5 17.5 9.5 C 13.2 9.5 9.5 5.8 9.5 1.5 Z"
          fill={fillColor}
          initial={{ scale: 0.86, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
        />
        <motion.path
          d="M 18.5 12.5 C 18.5 15.2 16.2 17.5 13.5 17.5 C 16.2 17.5 18.5 19.8 18.5 22.5 C 18.5 19.8 20.8 17.5 23.5 17.5 C 20.8 17.5 18.5 15.2 18.5 12.5 Z"
          fill={fillColor}
          initial={{ scale: 0.86, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.28, ease: EASE_OUT, delay: 0.05 }}
        />
      </svg>
    </div>
  )
}

export function CopyIndicatorCurve() {
  const copyFlareActive = useStore((s) => s.copyFlareActive)
  const flareKey = useStore((s) => s.flareKey)
  const open = useStore((s) => s.open)
  const settings = useStore((s) => s.settings)
  const isRight = settings.stickPosition === 'right'
  const isTop = settings.stickPosition === 'top'
  const isBottom = settings.stickPosition === 'bottom'
  const isHorizontal = isTop || isBottom
  const indicatorStyle = settings.copyIndicatorStyle || 'logo'
  const reduceMotion = !!settings.reduceMotion

  const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080
  const bulge = 48
  const hw = settings.hotZoneWidth || 3

  let boxW = 75
  let boxH = 75
  let activePath = ''
  let flatPath = ''

  if (isHorizontal) {
    const W = 297 // 220 * 1.35 (+35% increase, matches trigger bar)
    boxW = W
    boxH = 75
    if (isTop) {
      activePath = `M 0,0 L 0,${hw} C ${W * 0.22},${hw} ${W * 0.28},${bulge} ${W / 2},${bulge} C ${W * 0.72},${bulge} ${W * 0.78},${hw} ${W},${hw} L ${W},0 Z`
      flatPath = `M 0,0 L 0,${hw} C ${W * 0.22},${hw} ${W * 0.28},${hw} ${W / 2},${hw} C ${W * 0.72},${hw} ${W * 0.78},${hw} ${W},${hw} L ${W},0 Z`
    } else {
      activePath = `M 0,${boxH} L 0,${boxH - hw} C ${W * 0.22},${boxH - hw} ${W * 0.28},${boxH - bulge} ${W / 2},${boxH - bulge} C ${W * 0.72},${boxH - bulge} ${W * 0.78},${boxH - hw} ${W},${boxH - hw} L ${W},${boxH} Z`
      flatPath = `M 0,${boxH} L 0,${boxH - hw} C ${W * 0.22},${boxH - hw} ${W * 0.28},${boxH - hw} ${W / 2},${boxH - hw} C ${W * 0.72},${boxH - hw} ${W * 0.78},${boxH - hw} ${W},${boxH - hw} L ${W},${boxH} Z`
    }
  } else {
    const H = screenH * (settings.hotZoneHeight || 0.25)
    boxW = 75
    boxH = H
    const curvePathLeft = `M 0,0 L ${hw},0 C ${hw},${H * 0.22} ${bulge},${H * 0.28} ${bulge},${H / 2} C ${bulge},${H * 0.72} ${hw},${H * 0.78} ${hw},${H} L 0,${H} Z`
    const flatPathLeft = `M 0,0 L ${hw},0 C ${hw},${H * 0.22} ${hw},${H * 0.28} ${hw},${H / 2} C ${hw},${H * 0.72} ${hw},${H * 0.78} ${hw},${H} L 0,${H} Z`

    const curvePathRight = `M ${boxW},0 L ${boxW - hw},0 C ${boxW - hw},${H * 0.22} ${boxW - bulge},${H * 0.28} ${boxW - bulge},${H / 2} C ${boxW - bulge},${H * 0.72} ${boxW - hw},${H * 0.78} ${boxW - hw},${H} L ${boxW},${H} Z`
    const flatPathRight = `M ${boxW},0 L ${boxW - hw},0 C ${boxW - hw},${H * 0.22} ${boxW - hw},${H * 0.28} ${boxW - hw},${H / 2} C ${boxW - hw},${H * 0.72} ${boxW - hw},${H * 0.78} ${boxW - hw},${H} L ${boxW},${H} Z`

    activePath = isRight ? curvePathRight : curvePathLeft
    flatPath = isRight ? flatPathRight : flatPathLeft
  }

  const showCurve = (settings.showCopyIndicator !== false) && copyFlareActive && !open

  const pFrac = settings.panelHeight || 0.6
  const panelH = screenH * pFrac
  const minY = panelH / 2
  const maxY = screenH - panelH / 2
  const vOffset = settings.verticalOffset ?? 0.5
  const midY = minY + vOffset * (maxY - minY)

  const fade = { duration: reduceMotion ? 0.12 : ENTER_MS, ease: reduceMotion ? 'linear' : EASE_OUT }

  return (
    <AnimatePresence>
      {showCurve && (
        <motion.div
          key={`copy-sine-curve-${flareKey}`}
          className={`copy-curve-container ${settings.stickPosition}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
          style={
            isHorizontal
              ? {
                  position: 'absolute',
                  left: '50%',
                  x: '-50%',
                  [isTop ? 'top' : 'bottom']: 0,
                  width: boxW,
                  height: boxH,
                  pointerEvents: 'none',
                  zIndex: 9999
                }
              : {
                  position: 'absolute',
                  top: `${midY}px`,
                  y: '-50%',
                  [isRight ? 'right' : 'left']: 0,
                  width: boxW,
                  height: boxH,
                  pointerEvents: 'none',
                  zIndex: 9999
                }
          }
        >
          <svg
            width={boxW}
            height={boxH}
            viewBox={`0 0 ${boxW} ${boxH}`}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ overflow: 'visible' }}
          >
            <motion.path
              d={activePath}
              fill="#000000"
              stroke="none"
              initial={{ d: reduceMotion ? activePath : flatPath }}
              animate={{ d: activePath }}
              exit={{ d: reduceMotion ? activePath : flatPath }}
              transition={fade}
            />
          </svg>

          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { scale: 0.92, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { scale: 0.92, opacity: 0 }}
            transition={{ ...fade, delay: reduceMotion ? 0 : 0.04 }}
            style={
              isHorizontal
                ? {
                    position: 'absolute',
                    left: '50%',
                    x: '-50%',
                    [isTop ? 'top' : 'bottom']: 2,
                    width: 43.3,
                    height: 43.3,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none'
                  }
                : {
                    position: 'absolute',
                    top: '50%',
                    y: '-50%',
                    [isRight ? 'right' : 'left']: 2,
                    width: 43.3,
                    height: 43.3,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none'
                  }
            }
          >
            {indicatorStyle === 'check' ? (
              <TickIndicatorIcon fillColor="#ffffff" />
            ) : indicatorStyle === 'copy' ? (
              <CopyIndicatorIcon fillColor="#ffffff" />
            ) : indicatorStyle === 'sparkle' ? (
              <SparkleIndicatorIcon fillColor="#ffffff" />
            ) : (
              <LiquidOctopusLoader fillColor="#ffffff" glowColor="transparent" active={false} />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
