/**
 * CopyIndicatorCurve — Fluid Sine-Curve SVG Morph with Liquid Octopus Loader.
 *
 * Morphing SVG sine-wave arc (`sin(θ)`) that extends smoothly out from the screen
 * edge whenever content is copied to the clipboard, displaying the animated GSAP
 * liquid octopus logo inside the curve peak.
 */
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/appStore'
import { LiquidOctopusLoader } from './LiquidOctopusLoader'

export function CopyIndicatorCurve() {
  const copyFlareActive = useStore((s) => s.copyFlareActive)
  const flareKey = useStore((s) => s.flareKey)
  const open = useStore((s) => s.open)
  const settings = useStore((s) => s.settings)
  const isRight = settings.stickPosition === 'right'

  // Spans the full height of the hover bar trigger zone
  const triggerHeightPx = window.innerHeight * (settings.hotZoneHeight || 0.25)
  const H = triggerHeightPx
  const bulge = 48
  const boxW = 75

  const hw = settings.hotZoneWidth || 3

  // Structurally matched Cubic Bezier paths for 100% smooth frame-by-frame interpolation
  // We use L to draw the base width matching the 3px hover bar so the curve emerges seamlessly from its edge.
  const curvePathLeft = `M 0,0 L ${hw},0 C ${hw},${H * 0.22} ${bulge},${H * 0.28} ${bulge},${H / 2} C ${bulge},${H * 0.72} ${hw},${H * 0.78} ${hw},${H} L 0,${H} Z`
  const flatPathLeft = `M 0,0 L ${hw},0 C ${hw},${H * 0.22} ${hw},${H * 0.28} ${hw},${H / 2} C ${hw},${H * 0.72} ${hw},${H * 0.78} ${hw},${H} L 0,${H} Z`

  const curvePathRight = `M ${boxW},0 L ${boxW - hw},0 C ${boxW - hw},${H * 0.22} ${boxW - bulge},${H * 0.28} ${boxW - bulge},${H / 2} C ${boxW - bulge},${H * 0.72} ${boxW - hw},${H * 0.78} ${boxW - hw},${H} L ${boxW},${H} Z`
  const flatPathRight = `M ${boxW},0 L ${boxW - hw},0 C ${boxW - hw},${H * 0.22} ${boxW - hw},${H * 0.28} ${boxW - hw},${H / 2} C ${boxW - hw},${H * 0.72} ${boxW - hw},${H * 0.78} ${boxW - hw},${H} L ${boxW},${H} Z`

  const activePath = isRight ? curvePathRight : curvePathLeft
  const flatPath = isRight ? flatPathRight : flatPathLeft

  const showCurve = copyFlareActive && !open

  let topOffset = '50%'
  let yOffset = '-50%'

  if (settings.bladePosition === 'top') {
    topOffset = '0%'
    yOffset = '0%'
  } else if (settings.bladePosition === 'bottom') {
    topOffset = '100%'
    yOffset = '-100%'
  }

  return (
    <AnimatePresence mode="popLayout">
      {showCurve && (
        <motion.div
          key={`copy-sine-curve-${flareKey}`}
          className={`copy-curve-container ${isRight ? 'right' : 'left'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'absolute',
            top: topOffset,
            y: yOffset,
            [isRight ? 'right' : 'left']: 0,
            width: boxW,
            height: H,
            pointerEvents: 'none',
            zIndex: 9999
          }}
        >
          {/* SVG Sine-Curve Morph with Subpixel Geometric Precision Antialiasing */}
          <svg
            width={boxW}
            height={H}
            viewBox={`0 0 ${boxW} ${H}`}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            shapeRendering="geometricPrecision"
            style={{
              overflow: 'visible',
              shapeRendering: 'geometricPrecision',
              textRendering: 'geometricPrecision'
            }}
          >
            <motion.path
              d={activePath}
              fill="#000000"
              stroke="none"
              strokeWidth="0"
              shapeRendering="geometricPrecision"
              initial={{ d: flatPath }}
              animate={{ d: activePath }}
              exit={{ d: flatPath }}
              transition={{
                duration: 0.38,
                ease: [0.16, 1, 0.3, 1]
              }}
            />
          </svg>

          {/* Liquid Octopus Animated Logo centered inside the Curve Bulge */}
          <motion.div
            initial={{ scale: 0.3, opacity: 0, x: isRight ? 10 : -10 }}
            animate={{ scale: 1, opacity: 1, x: 0 }}
            exit={{ scale: 0.3, opacity: 0, x: isRight ? 10 : -10 }}
            transition={{
              type: 'spring',
              stiffness: 420,
              damping: 24,
              delay: 0.05
            }}
            style={{
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
            }}
          >
            <LiquidOctopusLoader fillColor="#ffffff" glowColor="rgba(255, 255, 255, 0.85)" speed={1.2} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
