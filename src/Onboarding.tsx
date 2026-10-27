/**
 * Onboarding — the first-run tour, played by the real app.
 *
 * Sequence: "edgedrop" is written in glass over the out-of-focus welcome
 * screen, then a focus pull lands on it. The welcome shows the cloud wallpaper
 * across the whole window with a laptop frame laid over it; "Take the tour"
 * flies the frame out past the window edges, and each step then plays the
 * real shelf (Panel, cards, stacks, edge light, preview) on example items.
 * The last step brings the frame back for the few settings that matter.
 *
 * The example items live only in this window's store. The user's history is
 * never loaded here, and the shelf is inert (no clicks reach it), so nothing
 * in the tour can paste, copy, merge or delete anything real. Only the
 * settings step writes, and only the settings the user picks.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Panel } from './components/Panel'
import { useStore } from './store/appStore'
import { edge } from './lib/edge'
import { applyReduceMotion } from './lib/theme'
import { useTranslation } from './i18n'
import { DEFAULT_SETTINGS, type Settings, type StickPosition } from '../shared/types'
import { PEN_PATH, PEN_TRANSFORM, PEN_WIDTH, GLASS_BOX, SHADOW_BOX, BLUR_BOX, penProgress } from './onboarding/lettering'
import { DEMOS, Run, STOP, itemsFor, resetDemoState, type Stage } from './onboarding/tour'
import { laptopBar, tourBar, SHELF_SCALE, TOUR_SCREEN_TOP } from './onboarding/edgeBar'
import skyUrl from './assets/onboarding/sky.png'
import glassUrl from './assets/onboarding/glass.png'
import glassShadowUrl from './assets/onboarding/glass-shadow.png'
import glassBlurUrl from './assets/onboarding/glass-blur.png'
import fogHeavyUrl from './assets/onboarding/welcome-blur-heavy.png'
import fogMidUrl from './assets/onboarding/welcome-blur-mid.png'
import './styles/onboarding.css'

interface Step {
  key: string
  /** 'frame': the whole laptop; 'full': the camera pushed in on its top edge, the real shelf plays. */
  view: 'frame' | 'full'
  open: boolean
  title: string
  body: string
}

// The intro's timing: the pen touches down, writes, the word holds, then the focus pull.
const TOUCH_MS = 450
const WRITE_MS = 3200
const HOLD_MS = 1200

export function Onboarding() {
  const { t } = useTranslation()
  const steps: Step[] = [
    { key: 'welcome', view: 'frame', open: false, title: t('onboarding.welcomeTitle'), body: t('onboarding.welcomeDesc') },
    { key: 'collect', view: 'full', open: false, title: t('onboarding.collectTitle'), body: t('onboarding.collectDesc') },
    { key: 'drag', view: 'full', open: true, title: t('onboarding.dragTitle'), body: t('onboarding.dragDesc') },
    { key: 'stacks', view: 'full', open: true, title: t('onboarding.stacksTitle'), body: t('onboarding.stacksDesc') },
    { key: 'ungroup', view: 'full', open: true, title: t('onboarding.ungroupTitle'), body: t('onboarding.ungroupDesc') },
    { key: 'merge', view: 'full', open: true, title: t('onboarding.mergeTitle'), body: t('onboarding.mergeDesc') },
    { key: 'preview', view: 'full', open: true, title: t('onboarding.previewTitle'), body: t('onboarding.previewDesc') },
    { key: 'settings', view: 'frame', open: false, title: t('onboarding.configTitle'), body: t('onboarding.configDesc') }
  ]
  const last = steps.length - 1

  const [ready, setReady] = useState(false)
  const [at, setAt] = useState(0)
  const [intro, setIntro] = useState<'writing' | 'focus' | 'done'>('writing')
  /** The camera: the whole laptop ('frame'), or pushed in on its top edge for the tour ('tour'). */
  const [cam, setCam] = useState<'frame' | 'tour'>('frame')
  /** The real shelf shows only in the tour (it stays mounted, so it is warm and its launch intro is done). */
  const [shelf, setShelf] = useState(false)
  /** The drawn edge bar on the laptop's top edge; hidden while the real shelf's bar is in its place. */
  const [barShown, setBarShown] = useState(true)
  /** Settings frame: the bar moves to the user's real edge once the frame is back in place. */
  const [realEdge, setRealEdge] = useState(false)
  /** Settings frame: the camera moves in on the screen (with its taskbar), as on the user's own desktop. */
  const [closeUp, setCloseUp] = useState(false)
  const [real, setReal] = useState<Settings | null>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const keysRef = useRef<HTMLDivElement>(null)
  const keysLabelRef = useRef<HTMLSpanElement>(null)
  const notesRef = useRef<HTMLDivElement>(null)
  const notesImageRef = useRef<HTMLDivElement>(null)
  const penRef = useRef<SVGPathElement>(null)
  const lettersRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<SVGImageElement>(null)
  const runRef = useRef<Run | null>(null)
  const timers = useRef<number[]>([])

  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))

  const stage = (): Stage => ({
    root: stageRef.current!,
    cursor: cursorRef.current!,
    keys: keysRef.current!,
    keysLabel: keysLabelRef.current!,
    notes: notesRef.current!,
    notesImage: notesImageRef.current!
  })

  // The tour's own store: the user's settings (language, motion, accent), the
  // shelf docked at the top for the demo, and no items of the user's.
  useEffect(() => {
    let cancelled = false
    // Marks the page for shelf parts portaled outside the tour's scaled layer (see .ob-tour).
    document.body.classList.add('ob-tour')
    document.body.style.setProperty('--ob-shelf-scale', String(SHELF_SCALE))
    document.body.style.setProperty('--ob-shelf-top', `${TOUR_SCREEN_TOP}px`)
    void edge.loadState().then(async ({ settings }) => {
      if (cancelled) return
      setReal(settings)
      useStore.setState({
        settings: {
          ...settings,
          stickPosition: 'top',
          triggerAlignment: 'center',
          horizontalOffset: DEFAULT_SETTINGS.horizontalOffset,
          hotZoneHeight: DEFAULT_SETTINGS.hotZoneHeight,
          showEdgeLocationHint: false,
          showCopyIndicator: true
        },
        items: [],
        hydrated: true,
        open: false
      })
      applyReduceMotion(settings.reduceMotion)
      // Start once every image is decoded, so the first frame is already the blurred scene.
      const decode = (src: string) => { const im = new Image(); im.src = src; return im.decode().catch(() => {}) }
      await Promise.all([skyUrl, glassUrl, glassShadowUrl, glassBlurUrl, fogHeavyUrl, fogMidUrl].map(decode))
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
      document.body.classList.remove('ob-tour')
      document.body.style.removeProperty('--ob-shelf-scale')
      document.body.style.removeProperty('--ob-shelf-top')
      runRef.current?.cancel()
      timers.current.forEach(clearTimeout)
    }
  }, [])

  // ---------- the intro: pen touch-down, writing, hold, focus pull ----------
  useEffect(() => {
    if (!ready) return
    const pen = penRef.current!
    const letters = lettersRef.current!
    const draw = (f: number) => {
      pen.style.strokeDashoffset = String(1 - f)
      shadowRef.current?.setAttribute('opacity', f >= 1 ? '1' : '0')
    }
    let raf = 0
    const focus = () => {
      setIntro('focus')
      later(900, () => setIntro('done'))
    }
    if (useStore.getState().settings.reduceMotion) {
      draw(1)
      letters.style.opacity = '1'
      later(700, focus)
      return
    }
    later(300, () => {
      draw(0.0005)
      letters.style.transition = 'opacity .18s ease-out'
      letters.style.opacity = '1'
      const t0 = performance.now() + TOUCH_MS
      const step = (now: number) => {
        const k = Math.max(0, (now - t0) / WRITE_MS)
        draw(Math.max(0.0005, penProgress(k)))
        if (k < 1) raf = requestAnimationFrame(step)
        else later(HOLD_MS, focus)
      }
      raf = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(raf)
  }, [ready])

  // ---------- moving between steps ----------
  const go = useCallback((i: number) => {
    const s = steps[i]
    const prev = steps[at]
    runRef.current?.cancel()
    resetDemoState(stage())
    const run = new Run()
    runRef.current = run
    setAt(i)
    setRealEdge(false)
    setCloseUp(false)
    const flying = prev.view !== s.view

    if (s.view === 'full' && prev.view === 'frame') {
      // Into the screen: the camera pushes in on the laptop's top edge with the
      // bar attached to it (the wallpaper stays still); once there, the real
      // shelf's closed bar is exactly where the drawn one is and takes over.
      setCam('tour')
      useStore.setState({ items: itemsFor(s.key), open: false })
      later(900, () => { setShelf(true); setBarShown(false) })
      later(1150, () => { if (!run.dead) useStore.setState({ open: s.open }) })
    } else if (s.view === 'frame' && prev.view === 'full') {
      // Back out: the shelf folds into its bar, the drawn bar takes over in the
      // same spot, and the camera pulls back with it attached to the edge.
      useStore.setState({ open: false })
      later(320, () => {
        setBarShown(true)
        setShelf(false)
        setCam('frame')
      })
      if (s.key === 'settings') later(1250, () => { if (!run.dead) { setCloseUp(true); setRealEdge(true) } })
    } else if (s.view === 'full') {
      useStore.setState({ items: itemsFor(s.key), open: s.open })
    }
    const demo = DEMOS[s.key]
    if (demo) {
      run.sleep(flying ? 1200 : 650).then(() => demo(run, stage())).catch((e) => { if (e !== STOP) console.error(e) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, steps.length])

  const finish = async () => {
    runRef.current?.cancel()
    await edge.updateSettings({ tutorialCompleted: true })
    window.close()
  }

  const next = () => (at < last ? go(at + 1) : void finish())

  // Settings the user picks on the last step are saved for real.
  const pick = async (patch: Partial<Settings>) => {
    setReal((r) => (r ? { ...r, ...patch } : r))
    const saved = await edge.updateSettings(patch)
    setReal(saved)
  }

  const s = steps[at]
  const barPos: StickPosition = real?.stickPosition ?? 'left'
  const locked = intro !== 'done'
  // The tour's shelf is docked at the top; the settings frame shows the user's real choice.
  const demo = useStore((st) => st.settings)
  const showReal = at === last && realEdge && !!real
  const edgeNow: StickPosition = showReal ? barPos : 'top'
  const barStyle = showReal && real ? laptopBar(edgeNow, real) : tourBar(demo)
  const primary = (
    <button type="button" className="ob-primary" onClick={next}>
      {at === last ? t('onboarding.getStarted') : t('onboarding.next')}
    </button>
  )

  return (
    <div className={`ob${intro === 'writing' ? '' : ' ob-focus'}${intro === 'done' ? ' ob-done' : ''}`}>
      <div className="ob-stage" ref={stageRef}>
        <div className="ob-scene">
          {/* The cloud wallpaper: one pixel per 2px dither cell, drawn crisp (it never moves). */}
          <img className="ob-sky" src={skyUrl} alt="" />

          {/* Another app, for the drag demo. */}
          <div className="ob-notes" ref={notesRef}>
            <div className="ob-notes-bar">
              <span className="ob-notes-title"><i />Trip plan</span>
              {/* Windows caption buttons: minimize, maximize, close */}
              <svg width="76" height="10" viewBox="0 0 76 10" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M2 5.5h9" />
                <rect x="33.5" y="1.5" width="8" height="8" rx="1.5" />
                <path d="M65 1.5l7 7M72 1.5l-7 7" />
              </svg>
            </div>
            <div className="ob-notes-body">
              <b>Weekend at the summit</b>
              <p>Sat · Trailhead 6:30, top by noon</p>
              <p>Sun · Ridge walk above the clouds</p>
              <div className="ob-notes-image" ref={notesImageRef} />
            </div>
          </div>

          {/* The real shelf, inert: the tour drives it. */}
          {ready && (
            <div
              className={`ob-shelf${shelf ? '' : ' is-hidden'}`}
              style={{ transform: `translateY(${TOUR_SCREEN_TOP}px) scale(${SHELF_SCALE})` }}
              aria-hidden
            >
              <Panel />
            </div>
          )}

          {/* The welcome and settings frames dim only below the laptop, so its screen stays the lit object. */}
          <div className={`ob-below${cam === 'frame' ? '' : ' is-off'}`} aria-hidden />

          {/* The camera on the laptop: the whole laptop; the tour's push-in on its top edge; or (settings) a
              close-up framed on the user's edge. The bar is inside, so it stays attached to the screen edge. */}
          <div className={`ob-cam${cam === 'tour' ? ' is-tour' : ''}${closeUp ? ` is-close is-${edgeNow}` : ''}`} aria-hidden>
            <div className="ob-laptop">
              <div className="ob-bezel" />
              <div className="ob-base" />
              <div className={`ob-taskbar${closeUp ? ' is-on' : ''}`}>
                <div className="ob-task-apps"><i className="ob-start" /><i className="ob-search" /><i /><i /><i /></div>
                <div className="ob-task-tray">
                  <svg width="9" height="7" viewBox="0 0 9 7"><path d="M.5 2.6a5.6 5.6 0 0 1 8 0M2 4.1a3.4 3.4 0 0 1 5 0M3.5 5.6a1.3 1.3 0 0 1 2 0" fill="none" stroke="#fff" strokeWidth=".9" strokeLinecap="round" /></svg>
                  <svg width="11" height="6" viewBox="0 0 11 6"><rect x=".5" y=".5" width="9" height="5" rx="1.2" fill="none" stroke="#fff" strokeWidth=".8" /><rect x="1.6" y="1.6" width="6" height="2.8" rx=".5" fill="#fff" /><rect x="9.8" y="2" width=".8" height="2" rx=".3" fill="#fff" /></svg>
                  <span><b>12:01</b><b>27-10-2026</b></span>
                </div>
              </div>
            </div>
            {/* Keyed by edge: moving to another edge fades in there instead of morphing across the screen. */}
            <div key={edgeNow} className={`ob-bar${barShown ? '' : ' is-hidden'}`} style={barStyle} />
          </div>

          <div className="ob-keys" ref={keysRef} aria-hidden>
            <div><kbd>Ctrl</kbd><b>+</b><kbd>C</kbd></div>
            <span ref={keysLabelRef} />
          </div>
          <div className="ob-cursor" ref={cursorRef} aria-hidden>
            {/* Dark-mode pointer: a black arrowhead (no stem, softly rounded) with a hairline light edge. */}
            <svg width="16" height="18" viewBox="0 0 16 18">
              <path
                d="M2.9 2.1C2.3 1.6 1.7 1.9 1.7 2.7v11.6c0 .9.9 1.3 1.6.7l2.9-2.7c.3-.3.7-.4 1.1-.4l4.4-.1c.9 0 1.3-1.1.6-1.7z"
                fill="#000"
                stroke="#fff"
                strokeWidth="0.6"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className={`ob-ui${locked ? ' is-locked' : ''}${s.key === 'preview' ? ' is-side' : ''}${s.key === 'settings' ? ' is-low' : ''}`}>
            <div className="ob-dots">{steps.map((st, i) => <i key={st.key} className={i === at ? 'on' : ''} />)}</div>
            <div className="ob-copy" key={s.key}>
              <h1>{s.title}</h1>
              <p>{s.body}</p>
              {/* Settings carries the options too: its button sits at the end of their row, so the step
                  stays short enough to clear the laptop above it. */}
              {s.key === 'settings' && real ? (
                <div className="ob-controls">
                  <div className="ob-seg" role="group" aria-label={t('onboarding.configTitle')}>
                    {(['left', 'top', 'right'] as const).map((pos) => (
                      <button key={pos} type="button" aria-pressed={barPos === pos} onClick={() => void pick({ stickPosition: pos })}>
                        {t(`position.${pos}`)}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="ob-toggle" aria-pressed={real.soundEffects !== false} onClick={() => void pick({ soundEffects: real.soundEffects === false })}>
                    <i />{t('behaviour.soundEffectsTitle')}
                  </button>
                  <button type="button" className="ob-toggle" aria-pressed={real.launchAtLogin} onClick={() => void pick({ launchAtLogin: !real.launchAtLogin })}>
                    <i />{t('behaviour.launchAtLoginTitle')}
                  </button>
                  {primary}
                </div>
              ) : primary}
              {at === 0 && <button type="button" className="ob-skip" onClick={() => void finish()}>{t('onboarding.skip')}</button>}
            </div>
          </div>

          <img className="ob-fog ob-fog-mid" src={fogMidUrl} alt="" />
          <img className="ob-fog ob-fog-heavy" src={fogHeavyUrl} alt="" />
        </div>

        {at > 0 && (
          <button type="button" className="ob-back" aria-label={t('onboarding.back')} onClick={() => go(at - 1)}>
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M7.5 2 3.5 6l4 4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
        <button type="button" className="ob-close" aria-label={t('onboarding.skip')} onClick={() => void finish()}>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>

        <div className="ob-letters" ref={lettersRef} aria-label="edgedrop">
          <svg viewBox="0 0 800 640" width="800" height="640">
            <defs>
              <mask id="ob-pen" maskUnits="userSpaceOnUse" x="0" y="0" width="800" height="640">
                <g transform={PEN_TRANSFORM}>
                  <path ref={penRef} d={PEN_PATH} pathLength={1} fill="none" stroke="#fff" strokeWidth={PEN_WIDTH}
                    strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 2" strokeDashoffset="1" />
                </g>
              </mask>
            </defs>
            <image ref={shadowRef} href={glassShadowUrl} {...SHADOW_BOX} opacity="0" style={{ transition: 'opacity .6s ease-out' }} />
            <image href={glassUrl} {...GLASS_BOX} mask="url(#ob-pen)" />
          </svg>
        </div>
        <img className="ob-letters-blur" src={glassBlurUrl} alt="" style={BLUR_BOX} />
      </div>
    </div>
  )
}
