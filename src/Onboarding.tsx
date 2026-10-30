/**
 * Onboarding — the first-run tour, played by the real app.
 *
 * Sequence: "edgedrop" is written in glass over the out-of-focus welcome
 * screen, then a focus pull lands on it. The welcome shows the cloud wallpaper
 * across the whole window with a laptop frame laid over it; "Take the tour"
 * flies the frame out past the window edges, and each step then plays the
 * real shelf (Panel, cards, stacks, edge light, preview) on example items.
 * The last step brings the frame back: the real shelf plays on each edge of
 * the laptop, then the user picks theirs (and the few settings that matter).
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
import { ONBOARDING_VERSION } from '../shared/onboarding'
import { PEN_PATH, PEN_TRANSFORM, PEN_WIDTH, GLASS_BOX, SHADOW_BOX, BLUR_BOX, penProgress } from './onboarding/lettering'
import { CHOICE_VIEW, DEMOS, PREVIEW_PAN, Run, STOP, demoEdges, itemsFor, playLooped, resetDemoState, showEdge, watchActivity, type Stage } from './onboarding/tour'
import { realScreenTransform, realSidePanel, tourBar, shelfTransform, topBarLength, SHELF_SCALE, TOUR_SCREEN_TOP } from './onboarding/edgeBar'
import { otherFiles, pageLines, pageTitle, stackFiles } from './onboarding/demoItems'
import { Autoplay, readingMs } from './onboarding/autoplay'
import { fileIconUrl, fileKindOf } from './lib/fileKind'
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
const HOLD_MS = 600

/** The demo taskbar's clock: a fixed moment, written the way the language writes it (24-hour, as it fits). */
const taskbarClock = (lang: string): [string, string] => {
  if (lang === 'en') return ['12:01', '27-10-2026']
  const at = new Date(2026, 9, 27, 12, 1)
  return [at.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), at.toLocaleDateString(lang)]
}

/** A Windows 11 window's caption buttons: minimize, maximize, close. */
const Caption = () => (
  <svg width="76" height="10" viewBox="0 0 76 10" fill="none" stroke="currentColor" strokeWidth="1">
    <path d="M2 5.5h9" />
    <rect x="33.5" y="1.5" width="8" height="8" rx="1.5" />
    <path d="M65 1.5l7 7M72 1.5l-7 7" />
  </svg>
)

export function Onboarding() {
  const { t, resolvedLang } = useTranslation()
  const steps: Step[] = [
    { key: 'welcome', view: 'frame', open: false, title: t('onboarding.welcomeTitle'), body: t('onboarding.welcomeDesc') },
    { key: 'collect', view: 'full', open: false, title: t('onboarding.collectTitle'), body: t('onboarding.collectDesc') },
    { key: 'dropin', view: 'full', open: false, title: t('onboarding.dropInTitle'), body: t('onboarding.dropInDesc') },
    { key: 'drag', view: 'full', open: true, title: t('onboarding.dragTitle'), body: t('onboarding.dragDesc') },
    { key: 'stacks', view: 'full', open: true, title: t('onboarding.stacksTitle'), body: t('onboarding.stacksDesc') },
    { key: 'preview', view: 'full', open: true, title: t('onboarding.previewTitle'), body: t('onboarding.previewDesc') },
    { key: 'find', view: 'full', open: true, title: t('onboarding.findTitle'), body: t('onboarding.findDesc') },
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
  /** The last step: the shelf has shown every edge, and the choice is up. */
  const [asking, setAsking] = useState(false)
  const [real, setReal] = useState<Settings | null>(null)
  /** Autoplay: on unless the user asked for reduced motion; the button by the progress dots toggles it. */
  const [playing, setPlaying] = useState(true)

  const stageRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const keysRef = useRef<HTMLDivElement>(null)
  const keysLabelRef = useRef<HTMLSpanElement>(null)
  const notesRef = useRef<HTMLDivElement>(null)
  const notesImageRef = useRef<HTMLDivElement>(null)
  const browserRef = useRef<HTMLDivElement>(null)
  const explorerRef = useRef<HTMLDivElement>(null)
  const lensRef = useRef<HTMLDivElement>(null)
  const penRef = useRef<SVGPathElement>(null)
  const lettersRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<SVGImageElement>(null)
  const runRef = useRef<Run | null>(null)
  /** The last step: the shelf showing the edge just picked. */
  const pickRunRef = useRef<Run | null>(null)
  /** The user's settings, for the demos (which outlive a render). */
  const realRef = useRef<Settings | null>(null)
  const timers = useRef<number[]>([])

  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))

  // Autoplay moves on from whichever step is up, with the latest go (see below).
  const atRef = useRef(0)
  const goRef = useRef<(i: number) => void>(() => {})
  const autoplay = useRef<Autoplay | null>(null)
  if (!autoplay.current) {
    autoplay.current = new Autoplay(() => {
      const i = atRef.current
      // it never ends the tour: the last step (the user's own choices) waits for Get Started
      if (i < last) goRef.current(i + 1)
    }, true)
  }
  const attachFill = useCallback((el: HTMLElement | null) => autoplay.current!.attach(el), [])
  useEffect(() => autoplay.current!.setPlaying(playing), [playing])
  useEffect(() => {
    const vis = () => autoplay.current!.setHidden(document.visibilityState === 'hidden')
    vis()
    document.addEventListener('visibilitychange', vis)
    return () => {
      document.removeEventListener('visibilitychange', vis)
      // held, not torn down: in development React runs this and then the effect again on the same
      // elements (the step's fill is attached once, by its ref), and autoplay must carry on from there
      autoplay.current!.setHidden(true)
    }
  }, [])

  const stage = (): Stage => ({
    root: stageRef.current!,
    cursor: cursorRef.current!,
    keys: keysRef.current!,
    keysLabel: keysLabelRef.current!,
    notes: notesRef.current!,
    notesImage: notesImageRef.current!,
    browser: browserRef.current!,
    explorer: explorerRef.current!,
    lens: lensRef.current!,
    showShelf: (on) => {
      setShelf(on)
      setBarShown(!on)
    }
  })

  /** Plays step i's demo after `delay` ms, again and again while the step is up. */
  const play = (run: Run, i: number, delay: number) => {
    const s = steps[i]
    if (s.key === 'settings') {
      // once: every edge, then the choice stays up
      run.sleep(delay)
        .then(() => demoEdges(run, stage(), realRef.current?.stickPosition ?? 'left'))
        .then(() => { if (!run.dead) setAsking(true) })
        .catch((e) => { if (e !== STOP) console.error(e) })
      return
    }
    const demo = DEMOS[s.key]
    if (!demo) return
    run.sleep(delay)
      .then(() => playLooped(run, stage(), s.key, s.open, demo, () => autoplay.current!.played(), () => autoplay.current!.advancing))
      .catch((e) => { if (e !== STOP) console.error(e) })
  }

  // The tour's own store: the user's settings (motion, accent) in the device's own
  // language, the shelf docked at the top for the demo, and no items of the user's.
  // The language is the tour's alone: the user's saved choice is never changed by it.
  useEffect(() => {
    let cancelled = false
    // Marks the page for shelf parts portaled outside the tour's scaled layer (see .ob-tour).
    document.body.classList.add('ob-tour')
    const unwatch = watchActivity()
    document.body.style.setProperty('--ob-shelf-scale', String(SHELF_SCALE))
    document.body.style.setProperty('--ob-shelf-top', `${TOUR_SCREEN_TOP}px`)
    document.body.style.setProperty('--ob-preview-pan', `${-PREVIEW_PAN}px`)
    document.body.style.setProperty('--ob-choice-zoom', String(CHOICE_VIEW.k))
    document.body.style.setProperty('--ob-choice-move', `translate(${CHOICE_VIEW.x / CHOICE_VIEW.k}px, ${CHOICE_VIEW.y / CHOICE_VIEW.k}px)`)
    void edge.loadState().then(async ({ settings }) => {
      if (cancelled) return
      setReal(settings)
      useStore.setState({
        settings: {
          ...settings,
          language: 'system',
          stickPosition: 'top',
          triggerAlignment: 'center',
          horizontalOffset: DEFAULT_SETTINGS.horizontalOffset,
          hotZoneHeight: DEFAULT_SETTINGS.hotZoneHeight,
          showEdgeLocationHint: false,
          showCopyIndicator: true
        },
        items: [],
        hydrated: true,
        open: false,
        demo: true
      })
      applyReduceMotion(settings.reduceMotion)
      if (settings.reduceMotion) setPlaying(false)
      // Start once every image is decoded, so the first frame is already the blurred scene.
      const decode = (src: string) => { const im = new Image(); im.src = src; return im.decode().catch(() => {}) }
      await Promise.all([skyUrl, glassUrl, glassShadowUrl, glassBlurUrl, fogHeavyUrl, fogMidUrl].map(decode))
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
      unwatch()
      document.body.classList.remove('ob-tour')
      document.body.style.removeProperty('--ob-shelf-scale')
      document.body.style.removeProperty('--ob-shelf-top')
      document.body.style.removeProperty('--ob-preview-pan')
      document.body.style.removeProperty('--ob-menu-scale')
      document.body.style.removeProperty('--ob-choice-zoom')
      document.body.style.removeProperty('--ob-choice-move')
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
      // The welcome's demo follows the focus pull without a pause.
      const run = new Run()
      runRef.current = run
      play(run, 0, 1200)
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
    pickRunRef.current?.cancel()
    resetDemoState(stage(), s.key)
    const run = new Run()
    runRef.current = run
    setAt(i)
    setAsking(false)
    const flying = prev.view !== s.view

    if (s.view === 'full' && prev.view === 'frame') {
      // Into the screen: the camera pushes in on the laptop's top edge with the
      // bar attached to it (the wallpaper stays still); once there, the real
      // shelf's closed bar is exactly where the drawn one is and takes over.
      // (Back from the last step: the shelf, laid out on the monitor there, gives
      // way to the drawn bar first and is docked at the top again out of sight.)
      if (prev.key === 'settings') {
        setShelf(false)
        setBarShown(true)
        useStore.setState({
          settings: {
            ...useStore.getState().settings,
            stickPosition: 'top',
            hotZoneHeight: DEFAULT_SETTINGS.hotZoneHeight,
            hotZoneWidth: realRef.current?.hotZoneWidth ?? DEFAULT_SETTINGS.hotZoneWidth
          }
        })
      }
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
        // out of sight now: a search empties (resetDemoState leaves it while the shelf folds), and the
        // cards the last step's shelf shows (the welcome's demo sets its own)
        if (!run.dead) useStore.setState({ query: '', items: itemsFor(s.key) })
      })
    } else if (s.view === 'full') {
      useStore.setState({ items: itemsFor(s.key), open: s.open })
    }
    // The next demo starts as the camera lands, or straight away: each step's cards are where the last one left them.
    play(run, i, flying ? 700 : 250)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, steps.length])

  const finish = async () => {
    runRef.current?.cancel()
    await edge.updateSettings({ tutorialCompleted: true, onboardingVersion: ONBOARDING_VERSION })
    window.close()
  }

  atRef.current = at
  goRef.current = go

  // Autoplay's clock for a step starts when its text is up: after the intro, then on each step change.
  useEffect(() => {
    if (intro !== 'done') return
    autoplay.current!.shown(steps[at].key, readingMs(steps[at].title, steps[at].body))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, intro])

  const next = () => (at < last ? go(at + 1) : void finish())

  // Settings the user picks on the last step are saved for real.
  const pick = async (patch: Partial<Settings>) => {
    setReal((r) => (r ? { ...r, ...patch } : r))
    const saved = await edge.updateSettings(patch)
    setReal(saved)
  }

  /** The user's edge: saved, and the shelf on the laptop goes there and opens once to show it. */
  const choose = (pos: StickPosition) => {
    void pick({ stickPosition: pos })
    pickRunRef.current?.cancel()
    const run = new Run()
    pickRunRef.current = run
    showEdge(run, stage(), pos).catch((e) => { if (e !== STOP) console.error(e) })
  }

  const s = steps[at]
  const barPos: StickPosition = real?.stickPosition ?? 'left'
  const locked = intro !== 'done'
  // The tour's shelf: docked at the top, except on the last step, where it plays every edge of the laptop.
  const demo = useStore((st) => st.settings)
  const shelfOpen = useStore((st) => st.open)
  const dock: StickPosition = demo.stickPosition ?? 'top'
  // The last step lays the shelf out on a real monitor drawn on the laptop (edgeBar REAL_SCREEN).
  const onMonitor = at === last && cam === 'frame'
  const side = realSidePanel(demo.panelHeight || 0.6, demo.verticalOffset ?? 0.5)
  const barStyle = tourBar(demo)
  realRef.current = real
  const primary = (
    <button type="button" className="ob-primary" onClick={next}>
      {at === last ? t('onboarding.getStarted') : t('onboarding.next')}
    </button>
  )

  return (
    <div className={`ob${intro === 'writing' ? '' : ' ob-focus'}${intro === 'done' ? ' ob-done' : ''}${asking ? ' ob-choosing' : ''}`}>
      <div className="ob-stage" ref={stageRef}>
        <div className="ob-scene">
          {/* The cloud wallpaper: one pixel per 2px dither cell, drawn crisp (it never moves, not even with the camera). */}
          <img className="ob-sky" src={skyUrl} alt="" />

          {/* The camera: the laptop, what is on its screen and the pointer, pushed in on the action (lens.ts). */}
          <div className="ob-lens" ref={lensRef}>

            {/* A web page, for the copy demo: a sentence and the photo get copied. */}
            <div className="ob-win ob-browser" ref={browserRef}>
              <div className="ob-win-bar">
                <span className="ob-tab"><i>W</i>{pageTitle()} - Wikipedia</span>
                <Caption />
              </div>
              <div className="ob-address">
                {/* the site's icon: links are dragged out of the address bar by it */}
                <svg className="ob-site" width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                  <path d="M1.5 3.5h5M8.5 3.5h1M1.5 7.5h1M4.5 7.5h5" />
                  <circle cx="7.5" cy="3.5" r="1.2" />
                  <circle cx="3.5" cy="7.5" r="1.2" />
                </svg>
                <span className="ob-url">en.wikipedia.org/wiki/Sea_of_clouds</span>
              </div>
              <div className="ob-page">
                <div className="ob-article">
                  <b>{pageTitle()}</b>
                  {pageLines().map((line, i) => <span key={i} className="ob-line"><i className="ob-hl" />{line}</span>)}
                  <span className="ob-rest">{t('tour.pageMore')}</span>
                </div>
                <div className="ob-photo" />
              </div>
              <div className="ob-menu">
                <span>{t('tour.menuOpenTab')}</span>
                <span>{t('tour.menuSaveImage')}</span>
                <span className="is-copy">{t('tour.menuCopyImage')}</span>
                <span>{t('tour.menuCopyLink')}</span>
              </div>
            </div>

            {/* File Explorer, for the drag-in demo. */}
            <div className="ob-win ob-explorer" ref={explorerRef}>
              <div className="ob-win-bar">
                <span className="ob-notes-title"><i className="ob-folder" />{t('tour.folder')}</span>
                <Caption />
              </div>
              <div className="ob-files">
                <div className="ob-files-head"><span>{t('tour.colName')}</span><span>{t('tour.colSize')}</span></div>
                <i className="ob-band" />
                {/* the rest of the folder, then the three files it selects and drags in */}
                {[...otherFiles(), ...stackFiles()].map(([name, size], i) => (
                  <div key={i} className={`ob-file${i >= 3 ? ' is-pick' : ''}`}>
                    <img src={fileIconUrl(fileKindOf(name))} alt="" />
                    <span>{name}</span>
                    <em>{t('units.kb', { n: Math.round(size / 1024).toLocaleString(resolvedLang) })}</em>
                  </div>
                ))}
              </div>
            </div>

            {/* Another app, for the drag demo. */}
            <div className="ob-notes" ref={notesRef}>
              <div className="ob-notes-bar">
                <span className="ob-notes-title"><i />{t('tour.notesApp')}</span>
                <Caption />
              </div>
              <div className="ob-notes-body">
                <b>{t('tour.notesHeading')}</b>
                <p>{t('tour.notesLine1')}</p>
                <p>{t('tour.notesLine2')}</p>
                <div className="ob-notes-image" ref={notesImageRef} />
              </div>
            </div>

            {/* The real shelf, inert: the tour drives it. */}
            {ready && (
              <div
                className={`ob-shelf${shelf ? '' : ' is-hidden'}${shelfOpen ? ' is-open' : ''}${onMonitor ? ' is-real' : ''}`}
                style={{
                  transform: onMonitor ? realScreenTransform(dock) : shelfTransform(cam),
                  // the last step moves it between edges while it is out of sight: at once, not gliding
                  transition: onMonitor ? 'none' : undefined,
                  '--ob-bar-w': `${topBarLength(demo.hotZoneHeight)}px`,
                  '--ob-real-h': `${side.height}px`,
                  '--ob-real-mid': `${side.middle}px`
                } as React.CSSProperties}
                aria-hidden
              >
                <Panel />
              </div>
            )}

            {/* The welcome and settings frames dim only below the laptop, so its screen stays the lit object. */}
            <div className={`ob-below${cam === 'frame' ? '' : ' is-off'}`} aria-hidden />

            {/* The camera on the laptop: the whole laptop, or the tour's push-in on its top edge. The bar is
                inside, so it stays attached to the screen edge. */}
            <div className={`ob-cam${cam === 'tour' ? ' is-tour' : ''}`} aria-hidden>
              <div className="ob-laptop">
                <div className="ob-bezel" />
                <div className="ob-base" />
                {/* The screen's taskbar: up whenever the whole laptop is in view (welcome, settings). */}
                <div className={`ob-taskbar${cam === 'frame' ? ' is-on' : ''}`}>
                  <div className="ob-task-apps">
                    {/* Start: the Windows 11 logo, four tiles under one gradient (a vector, crisp at any zoom) */}
                    <svg className="ob-start" width="12" height="12" viewBox="0 0 24 24">
                      <defs>
                        <linearGradient id="ob-start-blue" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                          <stop offset="0" stopColor="#7dd6ff" />
                          <stop offset="0.5" stopColor="#2f9bff" />
                          <stop offset="1" stopColor="#0b5fd8" />
                        </linearGradient>
                      </defs>
                      <g fill="url(#ob-start-blue)">
                        <rect x="0" y="0" width="11.2" height="11.2" rx="1.2" />
                        <rect x="12.8" y="0" width="11.2" height="11.2" rx="1.2" />
                        <rect x="0" y="12.8" width="11.2" height="11.2" rx="1.2" />
                        <rect x="12.8" y="12.8" width="11.2" height="11.2" rx="1.2" />
                      </g>
                    </svg>
                    <i className="ob-search" /><i /><i /><i />
                  </div>
                  <div className="ob-task-tray">
                    <svg width="9" height="7" viewBox="0 0 9 7"><path d="M.5 2.6a5.6 5.6 0 0 1 8 0M2 4.1a3.4 3.4 0 0 1 5 0M3.5 5.6a1.3 1.3 0 0 1 2 0" fill="none" stroke="#fff" strokeWidth=".9" strokeLinecap="round" /></svg>
                    <svg width="11" height="6" viewBox="0 0 11 6"><rect x=".5" y=".5" width="9" height="5" rx="1.2" fill="none" stroke="#fff" strokeWidth=".8" /><rect x="1.6" y="1.6" width="6" height="2.8" rx=".5" fill="#fff" /><rect x="9.8" y="2" width=".8" height="2" rx=".3" fill="#fff" /></svg>
                    <span>{taskbarClock(resolvedLang).map((s, i) => <b key={i}>{s}</b>)}</span>
                  </div>
                </div>
              </div>
              <div className={`ob-bar${barShown ? '' : ' is-hidden'}`} style={barStyle} />
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
          </div>

          {/* Ctrl+C, outside the camera: placed beside a window as it is framed on screen (tour.ts keys). */}
          <div className="ob-keys" ref={keysRef} aria-hidden>
            <div><kbd>{t('tour.ctrl')}</kbd><b>+</b><kbd>C</kbd></div>
            <span ref={keysLabelRef} />
          </div>

          <div className={`ob-ui${locked ? ' is-locked' : ''}${s.key === 'settings' ? ' is-low' : ''}`}>
            <div className="ob-progress">
              {/* The active dash fills as the step plays and rests (autoplay); the last one is simply full. */}
              <div className="ob-dots">
                {steps.map((st, i) => (
                  <i key={st.key} className={i === at ? 'on' : ''}>
                    {i === at && <b ref={i === last ? undefined : attachFill} className={i === last ? 'is-full' : ''} />}
                  </i>
                ))}
              </div>
              {at < last && (
                <button
                  type="button"
                  className="ob-play"
                  aria-pressed={playing}
                  aria-label={playing ? t('onboarding.pause') : t('onboarding.play')}
                  onClick={() => setPlaying((p) => !p)}
                >
                  {playing ? (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><rect x="1" y="0.5" width="2.2" height="7" rx="0.6" /><rect x="4.8" y="0.5" width="2.2" height="7" rx="0.6" /></svg>
                  ) : (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1.6 1.1v5.8c0 .5.5.8.9.5l4.4-2.9c.4-.2.4-.8 0-1L2.5.6c-.4-.3-.9 0-.9.5z" /></svg>
                  )}
                </button>
              )}
            </div>
            <div className="ob-copy" key={s.key}>
              {s.key === 'settings' ? (
                <>
                  <h1>{s.title}</h1>
                  <p>{s.body}</p>
                </>
              ) : (
                // Every step's text in the same place, only this step's shown: the box is as tall as the
                // longest in this language, so the button under it stays put from step to step. (This
                // step's first, for anything that reads the heading.)
                <div className="ob-text">
                  {[s, ...steps.slice(0, last).filter((st) => st.key !== s.key)].map((st) => (
                    <div key={st.key} className={st.key === s.key ? undefined : 'is-ghost'} aria-hidden={st.key === s.key ? undefined : true}>
                      <h1>{st.title}</h1>
                      <p>{st.body}</p>
                    </div>
                  ))}
                </div>
              )}
              {/* The last step: once the shelf has shown every edge, the choice opens out under the text (the
                  camera pulls back to make room): the three edges, each a small screen with its bar, then
                  the two settings that matter and Get Started. */}
              {s.key === 'settings' && real ? (
                <div className={`ob-choose${asking ? ' is-up' : ''}`} aria-hidden={!asking}>
                  <div>
                    <div className="ob-edges" role="radiogroup" aria-label={s.title}>
                      {(['left', 'top', 'right'] as const).map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          role="radio"
                          aria-checked={barPos === pos}
                          tabIndex={asking ? 0 : -1}
                          className="ob-edge"
                          onClick={() => choose(pos)}
                        >
                          <span className={`ob-edge-screen is-${pos}`}><i /></span>
                          {t(`position.${pos}`)}
                        </button>
                      ))}
                    </div>
                    <div className="ob-controls">
                      <button type="button" className="ob-toggle" tabIndex={asking ? 0 : -1} aria-pressed={real.soundEffects !== false} onClick={() => void pick({ soundEffects: real.soundEffects === false })}>
                        <i />{t('behaviour.soundEffectsTitle')}
                      </button>
                      <button type="button" className="ob-toggle" tabIndex={asking ? 0 : -1} aria-pressed={real.launchAtLogin} onClick={() => void pick({ launchAtLogin: !real.launchAtLogin })}>
                        <i />{t('behaviour.launchAtLoginTitle')}
                      </button>
                      {primary}
                    </div>
                  </div>
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
