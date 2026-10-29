import { useEffect, useState, useRef, useLayoutEffect, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/appStore'
import type { DisplayInfo, UpdateMode } from '../../shared/types'
import {
  resolveUpdateMode,
  normalizeHoverOpenDelay,
  HOVER_OPEN_DELAY_MIN,
  HOVER_OPEN_DELAY_MAX,
  HOVER_OPEN_DELAY_STEP
} from '../../shared/types'
import {
  LogoIndicatorIcon,
  TickIndicatorIcon,
  CopyIndicatorIcon,
  SparkleIndicatorIcon
} from './CopyIndicatorCurve'
import {
  ArrowsClockwiseIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  GithubOctocatLogo,
  GlobeIcon,
  HeartIcon,
  InfoIcon,
  LogOutIcon,
  MicrosoftStoreLogo
} from './icons'
import { HotkeyRecorder } from './HotkeyRecorder'
import { SlideCommit } from './SlideCommit'
import { WakeSlider } from './WakeSlider'
import { playDialTickSound, playToggleSound, playButtonClickSound } from '../lib/soundEffects'
import { languageLabel, useTranslation } from '../i18n'
import '../styles/settings.css'

/** Widest a top-dock settings column grows to (settings.css .set-col max-width). */
const SET_COL_MAX = 420

/** Text cut short: an ellipsis, or lines past its clamp. */
function isCut(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
}

/** Each column at the narrowest width (in 8px steps) at which nothing in it is cut, up to SET_COL_MAX. */
function fitSettingsColumns(track: HTMLElement): void {
  const cols = [...track.querySelectorAll<HTMLElement>('.set-col')]
  // a width that transitions would still read as the old one while it is measured
  for (const col of cols) {
    col.style.transition = 'none'
    col.style.width = ''
  }
  const parts = (col: HTMLElement) => [...col.querySelectorAll<HTMLElement>('.set-row-title, .set-row-desc, .setting-pills .pill')]
  // measure every column once, then widen only the ones that need it
  const cut = cols.filter((col) => parts(col).some(isCut))
  for (const col of cut) {
    const fits = (w: number) => {
      col.style.width = `${w}px`
      return !parts(col).some(isCut)
    }
    let lo = col.offsetWidth
    let hi = SET_COL_MAX
    if (!fits(hi)) continue
    while (hi - lo > 8) {
      const mid = Math.round((lo + hi) / 2)
      if (fits(mid)) hi = mid
      else lo = mid
    }
    col.style.width = `${hi}px`
  }
  for (const col of cols) col.style.transition = ''
}

type SettingsTab = 'behaviour' | 'position' | 'appearance'

export function Settings({
  inlineIndicatorStyle,
  isHorizontal: propIsHorizontal
}: {
  inlineIndicatorStyle?: boolean
  isHorizontal?: boolean
}) {
  const { t, language, languages, resolvedLang } = useTranslation()
  const settings = useStore((s) => s.settings)
  const isHorizontal = propIsHorizontal ?? (settings.stickPosition === 'top')

  const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'behaviour',  label: t('tabs.behaviour') },
    { id: 'position',   label: t('tabs.position') },
    { id: 'appearance', label: t('tabs.appearance') },
  ]
  const patch = useStore((s) => s.patchSettings)
  const pushToast = useStore((s) => s.pushToast)
  const updateInfo = useStore((s) => s.updateInfo)
  const isStoreBuild = useStore((s) => s.isStoreBuild)
  const currentVersion = useStore((s) => s.currentVersion)
  const styleFlyoutOpen = useStore((s) => s.styleFlyoutOpen)
  const setStyleFlyoutOpen = useStore((s) => s.setStyleFlyoutOpen)
  const languageFlyoutOpen = useStore((s) => s.languageFlyoutOpen)
  const setLanguageFlyoutOpen = useStore((s) => s.setLanguageFlyoutOpen)
  const setSliderActive = useStore((s) => s.setSliderActive)
  const edgeTransition = useStore((s) => s.edgeTransition)
  const startEdgeTransition = useStore((s) => s.startEdgeTransition)

  const getLangLabel = (l: { code: string; name: string; nativeName: string }) => languageLabel(l, resolvedLang)
  const selectedLang = languages.find((l) => l.code === (language || 'system')) || languages[0]

  const horizontalTab = useStore((s) => s.settingsTab)
  const shelfTrackRef = useRef<HTMLDivElement>(null)
  const horizontalTabScrollPositions = useRef<Record<SettingsTab, number>>({
    behaviour: 0,
    position: 0,
    appearance: 0
  })
  const isSwitchingTabRef = useRef(false)

  // Reset horizontal tab to 'behaviour' and scroll positions to 0 on mount,
  // but preserve 'position' if already on it or actively transitioning edges.
  useEffect(() => {
    if (isHorizontal) {
      const currentTab = useStore.getState().settingsTab
      const isTransitioning = !!useStore.getState().edgeTransition?.active
      if (currentTab !== 'position' && !isTransitioning) {
        useStore.getState().setSettingsTab('behaviour')
      }
      horizontalTabScrollPositions.current = {
        behaviour: 0,
        position: 0,
        appearance: 0
      }
    }
  }, [isHorizontal])

  // Top dock: a column whose title, description or choices would be cut grows until they show
  // whole (long translations need the room; the track scrolls, so width is free). Before paint,
  // and again once the UI font is in, since it changes the measure.
  useLayoutEffect(() => {
    const track = shelfTrackRef.current
    if (!isHorizontal || !track) return
    fitSettingsColumns(track)
    let alive = true
    void document.fonts?.ready.then(() => { if (alive) fitSettingsColumns(track) })
    return () => { alive = false }
  }, [isHorizontal, horizontalTab, resolvedLang, settings.fontSizeScale])

  // Restore target section's independent horizontal scroll position when tab changes
  useLayoutEffect(() => {
    if (!isHorizontal) return
    isSwitchingTabRef.current = true
    if (shelfTrackRef.current) {
      const targetPos = horizontalTabScrollPositions.current[horizontalTab] ?? 0
      shelfTrackRef.current.scrollLeft = targetPos
    }
    const id = requestAnimationFrame(() => {
      isSwitchingTabRef.current = false
    })
    return () => cancelAnimationFrame(id)
  }, [isHorizontal, horizontalTab])

  // The slider plays its own detent ticks while dragging; presets tick on click.
  const handleSliderInput = (rawVal: number) => {
    const clamped = Math.min(1.0, Math.max(0.0, rawVal))
    useStore.setState((s) => ({
      settings: { ...s.settings, verticalOffset: clamped }
    }))
  }

  const handleSliderRelease = (rawVal: number) => {
    const clamped = Math.min(1.0, Math.max(0.0, Math.round(rawVal * 100) / 100))
    patch({ verticalOffset: clamped })
  }

  const handleThicknessInput = (rawVal: number) => {
    const clamped = Math.min(7, Math.max(1, Math.round(rawVal)))
    if (clamped !== (settings.hotZoneWidth ?? 3)) {
      useStore.setState((s) => ({
        settings: { ...s.settings, hotZoneWidth: clamped }
      }))
    }
  }

  const handleThicknessRelease = (rawVal: number) => {
    const clamped = Math.min(7, Math.max(1, Math.round(rawVal)))
    setSliderActive(false)
    patch({ hotZoneWidth: clamped })
  }

  // ── Hover open delay (shared by both layouts) ──────────────────────────
  const hoverOn = settings.hoverActivation ?? true
  const hoverDelay = normalizeHoverOpenDelay(settings.hoverOpenDelay)
  const formatHoverDelay = (ms: number) =>
    ms === 0 ? (t('behaviour.hoverDelayInstant') || 'Instant') : t('units.ms', { n: ms.toLocaleString(resolvedLang, { useGrouping: false }) })

  const handleHoverDelayInput = (rawVal: number) => {
    const next = normalizeHoverOpenDelay(rawVal)
    if (next !== normalizeHoverOpenDelay(useStore.getState().settings.hoverOpenDelay)) {
      useStore.setState((s) => ({
        settings: { ...s.settings, hoverOpenDelay: next }
      }))
    }
  }

  const handleHoverDelayRelease = (rawVal: number) => {
    setSliderActive(false)
    patch({ hoverOpenDelay: normalizeHoverOpenDelay(rawVal) })
  }

  /** Open delay: the wave slider plus Instant / 500 ms / 1000 ms presets. */
  const renderHoverDelayControl = () => (
    <div className="setting-slider-wrap">
      <WakeSlider
        ariaLabel={t('behaviour.hoverDelayTitle') || 'Open Delay'}
        min={HOVER_OPEN_DELAY_MIN}
        max={HOVER_OPEN_DELAY_MAX}
        step={HOVER_OPEN_DELAY_STEP}
        bars={28}
        height={isHorizontal ? 22 : 28}
        restHeight={isHorizontal ? 6 : 8}
        gap={3}
        value={hoverDelay}
        disabled={!hoverOn}
        onStart={() => {
          void window.edge.setInteractive(true)
          setSliderActive(true)
        }}
        onRelease={(val) => {
          handleHoverDelayRelease(val)
        }}
        onChange={(val) => {
          handleHoverDelayInput(val)
        }}
      />
      <div className="setting-slider-labels">
        {[HOVER_OPEN_DELAY_MIN, 500, HOVER_OPEN_DELAY_MAX].map((ms) => {
          const active = hoverDelay === ms
          return (
            <button
              key={ms}
              type="button"
              disabled={!hoverOn}
              className={`slider-label-btn${active ? ' active' : ''}`}
              onClick={() => {
                if (hoverOn && !active) {
                  playDialTickSound()
                  patch({ hoverOpenDelay: ms })
                }
              }}
            >
              {formatHoverDelay(ms)}
            </button>
          )
        })}
      </div>
    </div>
  )

  const [localInlineOpen, setLocalInlineOpen] = useState(false)
  const isTutorial = inlineIndicatorStyle || (typeof window !== 'undefined' && window.location.hash.includes('onboarding'))
  const isFlyoutActive = isTutorial ? localInlineOpen : styleFlyoutOpen

  const handleToggleFlyout = (anchorEl?: HTMLElement | null) => {
    if (isTutorial) {
      setLocalInlineOpen(!localInlineOpen)
    } else {
      const nextOpen = !styleFlyoutOpen
      let rect: { x: number; y: number; width: number; height: number } | null = null
      if (nextOpen && anchorEl) {
        const r = anchorEl.getBoundingClientRect()
        rect = { x: r.left, y: r.top, width: r.width, height: r.height }
      }
      setStyleFlyoutOpen(nextOpen, rect)
    }
  }

  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.edge.getDisplays().then(setDisplays).catch(() => {})
    }, 250)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    let timer: number
    const pullTimer = window.setTimeout(() => {
      void useStore.getState().refreshLaunchAtLogin()
      timer = window.setInterval(() => {
        void useStore.getState().refreshLaunchAtLogin()
      }, 2000)
    }, 300)
    return () => {
      window.clearTimeout(pullTimer)
      if (timer) window.clearInterval(timer)
    }
  }, [])

  const updateDownloaded = updateInfo?.downloaded ? { version: updateInfo.latestVersion } : null
  const updateMode = resolveUpdateMode(settings)

  const checkState = useStore((s) => s.manualCheckState)
  const handleManualCheck = () => useStore.getState().startManualCheck()
  const handleStartDownload = () => useStore.getState().startManualDownload()

  const isManualDownloading = checkState.status === 'downloading'
  const isDownloading = isManualDownloading || (!updateDownloaded && !!updateInfo?.hasUpdate && (updateMode === 'auto' || !!updateInfo?.downloadProgress))
  // Update waiting for a user decision (Notify mode prompt or available check).
  const hasBackgroundUpdate = !updateDownloaded && !isDownloading && (!!updateInfo?.hasUpdate || checkState.status === 'available')
  const downloadPercent = updateInfo?.downloadProgress?.percent ?? 0

  // ── Tab state & Independent Scroll Memory per section ──────────────────────
  const activeTab = useStore((s) => s.settingsTab)
  const setActiveTab = useStore((s) => s.setSettingsTab)
  const scrollListRef = useRef<HTMLDivElement>(null)
  const tabScrollPositions = useRef<Record<SettingsTab, number>>({
    behaviour: 0,
    position: 0,
    appearance: 0
  })

  const handleTabSwitch = (newTab: SettingsTab) => {
    if (newTab === activeTab) return
    if (styleFlyoutOpen) {
      setStyleFlyoutOpen(false)
    }
    // Save current section's scroll position
    if (scrollListRef.current) {
      tabScrollPositions.current[activeTab] = scrollListRef.current.scrollTop
    }
    playButtonClickSound()
    setActiveTab(newTab)
  }

  // Close flyout if settings closes or unmounts
  useEffect(() => {
    return () => {
      if (useStore.getState().styleFlyoutOpen) {
        useStore.getState().setStyleFlyoutOpen(false)
      }
    }
  }, [])

  // Restore target section's independent scroll position when tab changes
  useEffect(() => {
    if (scrollListRef.current) {
      const targetPos = tabScrollPositions.current[activeTab] ?? 0
      scrollListRef.current.scrollTop = targetPos
    }
  }, [activeTab])

  // When update check finds a new update, smoothly scroll to top/front to highlight the update card
  useEffect(() => {
    if (checkState.status === 'available') {
      const behavior = settings.reduceMotion ? 'auto' : 'smooth'
      if (isHorizontal) {
        if (shelfTrackRef.current) {
          shelfTrackRef.current.scrollTo({ left: 0, behavior })
        }
        horizontalTabScrollPositions.current.behaviour = 0
      } else {
        if (scrollListRef.current) {
          scrollListRef.current.scrollTo({ top: 0, behavior })
        }
        tabScrollPositions.current.behaviour = 0
      }
    }
  }, [checkState.status, isHorizontal, settings.reduceMotion])

  // ── Promoted Active Update State ───────────────────────────────────────────
  // The top card shows all active update lifecycle stages:
  // 1) Downloaded update -> 'Restart to Update'
  // 2) Downloading in progress -> Live progress bar
  // 3) Update found & available -> 'Download & Update' / 'Skip'
  const hasPromotedTopUpdate = !isStoreBuild && (
    !!updateDownloaded ||
    isDownloading ||
    hasBackgroundUpdate
  )

  // ── After the settings: two cards, each with one job ──────────────────────
  // Community & Support (why, then Ko-fi / GitHub) and About Edge-Drop
  // (version, feedback, quit). They end every tab: in the top dock they scroll
  // in after the last group instead of staying pinned.
  // (What's New lives on the header's (i) button.)
  const renderClosingCards = () => (
    <>
      <section className={`settings-support${isHorizontal ? ' is-h' : ''}`} data-card="support">
        <h3 className="set-group-label">{t('footer.communityAndSupport') || 'COMMUNITY & SUPPORT'}</h3>
        <div className="settings-support-tagline">{t('footer.supportTagline') || '100% free & open-source clipboard'}</div>
        <div className="settings-support-actions">
          <button
            type="button"
            className="settings-support-btn is-primary kofi-support-btn"
            onClick={() => {
              playButtonClickSound()
              window.open('https://www.edgedrop.app/supportedgedrop', '_blank')
            }}
          >
            <HeartIcon width={13} height={13} />
            <span>{t('footer.supportOnKofi')}</span>
          </button>
          {isStoreBuild ? (
            <button
              type="button"
              className="settings-support-btn store-review-promo-btn"
              onClick={() => {
                playButtonClickSound()
                window.open('ms-windows-store://review/?ProductId=9P3JMHN9M4NR', '_blank')
              }}
            >
              <MicrosoftStoreLogo width={13} height={13} className="store-logo-icon" />
              <span>{t('footer.reviewOnStore')}</span>
            </button>
          ) : (
            <button
              type="button"
              className="settings-support-btn github-promo-btn"
              onClick={() => {
                playButtonClickSound()
                window.open('https://github.com/Deepender25/Edge-Drop', '_blank')
              }}
            >
              <GithubOctocatLogo width={13} height={13} className="github-octocat-icon" />
              <span>{t('footer.starOnGithub')}</span>
            </button>
          )}
        </div>
      </section>

      <section className={`settings-support settings-about${isHorizontal ? ' is-h' : ''}`} data-card="about">
        <h3 className="set-group-label">{t('groups.aboutEdgeDrop') || 'ABOUT EDGE-DROP'}</h3>
        <div className="settings-about-title">Edge-Drop {currentVersion || '0.3.1'}</div>
        <div className="settings-support-tagline">{t('footer.feedbackDesc')}</div>
        <div className="settings-support-actions">
          <button
            type="button"
            className="settings-support-btn"
            onClick={() => {
              playButtonClickSound()
              window.open('https://github.com/Deepender25/Edge-Drop/issues/new/choose', '_blank')
            }}
          >
            <span>{t('footer.submitFeedback')}</span>
          </button>
          <button
            type="button"
            className="settings-support-link subtle-quit-btn"
            onClick={() => {
              playButtonClickSound()
              void window.edge.quitApp()
            }}
          >
            <LogOutIcon width={12} height={12} />
            <span>{t('tray.quit')}</span>
          </button>
        </div>
      </section>
    </>
  )

  const handleOpenChangelog = () => {
    playButtonClickSound()
    const targetVersion = checkState.version || updateInfo?.latestVersion || currentVersion
    if (targetVersion) {
      patch({ lastSeenChangelogVersion: targetVersion })
    }
    window.open('https://www.edgedrop.app/changelog', '_blank')
  }

  // ── Promoted Top Update Card Renderer (Vertical Layout) ────────────────────
  const renderPromotedTopUpdateCard = () => {
    if (isStoreBuild) return null
    if (!hasPromotedTopUpdate) return null

    if (updateDownloaded) {
      return (
        <div className="setting-card update-promoted-card">
          <div className="shelf-card-top">
            <div className="update-header-row">
              <div className="update-group-label">
                <span className="update-dot" />
                <span>{t('behaviour.updateLabelReady') || 'UPDATE READY'}</span>
              </div>
              <button
                type="button"
                className="update-info-btn"
                title={t('header.whatsNew') || "What's New"}
                aria-label={t('header.whatsNew') || "What's New"}
                onClick={handleOpenChangelog}
              >
                <InfoIcon width={13} height={13} />
              </button>
            </div>
            <div className="setting-title">
              {t('behaviour.updateReadyTitle', { version: updateDownloaded.version })}
            </div>
            <div className="setting-desc">
              {t('behaviour.updateReadyDesc')}
            </div>
          </div>
          <div className="shelf-card-bottom">
            <SlideCommit
              label={t('behaviour.restart') || 'Restart'}
              doneLabel={t('behaviour.restarting') || 'Restarting...'}
              errorLabel={t('behaviour.restartFailed') || 'Restart failed'}
              height={32}
              radius={10}
              onConfirm={() => {
                playButtonClickSound()
                void window.edge.installUpdate()
              }}
            />
          </div>
        </div>
      )
    }

    if (isDownloading) {
      return (
        <div className="setting-card update-promoted-card">
          <div className="shelf-card-top">
            <div className="update-header-row">
              <div className="update-group-label">
                <span className="update-dot checking" />
                <span>{t('behaviour.updateLabelDownloading') || 'DOWNLOADING UPDATE'}</span>
              </div>
              <button
                type="button"
                className="update-info-btn"
                title={t('header.whatsNew') || "What's New"}
                aria-label={t('header.whatsNew') || "What's New"}
                onClick={handleOpenChangelog}
              >
                <InfoIcon width={13} height={13} />
              </button>
            </div>
            <div className="setting-title">
              {updateInfo?.latestVersion
                ? t('behaviour.updateAvailableTitle', { version: updateInfo.latestVersion })
                : t('behaviour.downloadingUpdate')}
            </div>
            <div className="setting-desc">
              {downloadPercent > 0 ? t('behaviour.downloadingWithPercent', { percent: downloadPercent }) : t('behaviour.downloadingUpdate')}
            </div>
          </div>
          <div className="shelf-card-bottom">
            <div className="shelf-update-progress-wrap">
              <div className="shelf-progress-bar" style={{ width: `${downloadPercent}%` }} />
              <span className="shelf-progress-text">{downloadPercent > 0 ? `${downloadPercent}%` : t('behaviour.connecting')}</span>
            </div>
          </div>
        </div>
      )
    }

    if (checkState.status === 'available' || hasBackgroundUpdate) {
      const versionStr = checkState.version || updateInfo?.latestVersion || ''
      return (
        <div className="setting-card update-promoted-card">
          <div className="shelf-card-top">
            <div className="update-header-row">
              <div className="update-group-label">
                <span className="update-dot" />
                <span>{t('behaviour.updateLabelAvailable') || 'NEW UPDATE AVAILABLE'}</span>
              </div>
              <button
                type="button"
                className="update-info-btn"
                title={t('header.whatsNew') || "What's New"}
                aria-label={t('header.whatsNew') || "What's New"}
                onClick={handleOpenChangelog}
              >
                <InfoIcon width={13} height={13} />
              </button>
            </div>
            <div className="setting-title">
              {t('behaviour.updateAvailableTitle', { version: versionStr })}
            </div>
            <div className="setting-desc">
              {t('behaviour.updateAvailableDesc')}
            </div>
          </div>
          <div className="shelf-card-bottom">
            <div className="update-action-row">
              <button
                type="button"
                className="update-action-btn primary"
                style={{ flex: 1 }}
                onClick={() => {
                  playButtonClickSound()
                  handleStartDownload()
                }}
              >
                {t('behaviour.update') || 'Update'}
              </button>
              <button
                type="button"
                className="update-action-btn secondary"
                style={{ flex: '0 0 68px' }}
                onClick={() => {
                  playButtonClickSound()
                  useStore.getState().dismissUpdate()
                }}
              >
                {t('behaviour.skip')}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return null
  }

  // ── Promoted Front Update Card Renderer (Horizontal Shelf Layout) ──────────
  const renderPromotedHorizontalUpdateCard = () => {
    if (isStoreBuild) return null
    if (!hasPromotedTopUpdate) return null

    if (updateDownloaded) {
      return (
        <div className="settings-shelf-card update-promoted-card behaviour-col">
          <div className="shelf-card-top">
            <div className="update-header-row">
              <div className="update-group-label">
                <span className="update-dot" />
                <span>{t('behaviour.updateLabelReady') || 'UPDATE READY'}</span>
              </div>
              <button
                type="button"
                className="update-info-btn"
                title={t('header.whatsNew') || "What's New"}
                aria-label={t('header.whatsNew') || "What's New"}
                onClick={handleOpenChangelog}
              >
                <InfoIcon width={13} height={13} />
              </button>
            </div>
            <div className="setting-title">
              {t('behaviour.updateReadyTitle', { version: updateDownloaded.version })}
            </div>
            <div className="setting-desc">
              {t('behaviour.updateReadyDesc')}
            </div>
          </div>
          <div className="shelf-card-bottom">
            <SlideCommit
              label={t('behaviour.restart') || 'Restart'}
              doneLabel={t('behaviour.restarting') || 'Restarting...'}
              errorLabel={t('behaviour.restartFailed') || 'Restart failed'}
              height={32}
              radius={10}
              onConfirm={() => {
                playButtonClickSound()
                void window.edge.installUpdate()
              }}
            />
          </div>
        </div>
      )
    }

    if (isDownloading) {
      return (
        <div className="settings-shelf-card update-promoted-card behaviour-col">
          <div className="shelf-card-top">
            <div className="update-header-row">
              <div className="update-group-label">
                <span className="update-dot checking" />
                <span>{t('behaviour.updateLabelDownloading') || 'DOWNLOADING UPDATE'}</span>
              </div>
              <button
                type="button"
                className="update-info-btn"
                title={t('header.whatsNew') || "What's New"}
                aria-label={t('header.whatsNew') || "What's New"}
                onClick={handleOpenChangelog}
              >
                <InfoIcon width={13} height={13} />
              </button>
            </div>
            <div className="setting-title">
              {updateInfo?.latestVersion
                ? t('behaviour.updateAvailableTitle', { version: updateInfo.latestVersion })
                : t('behaviour.downloadingUpdate')}
            </div>
            <div className="setting-desc">
              {downloadPercent > 0 ? t('behaviour.downloadingWithPercent', { percent: downloadPercent }) : t('behaviour.downloadingUpdate')}
            </div>
          </div>
          <div className="shelf-card-bottom">
            <div className="shelf-update-progress-wrap">
              <div className="shelf-progress-bar" style={{ width: `${downloadPercent}%` }} />
              <span className="shelf-progress-text">{downloadPercent > 0 ? `${downloadPercent}%` : t('behaviour.connecting')}</span>
            </div>
          </div>
        </div>
      )
    }

    if (checkState.status === 'available' || hasBackgroundUpdate) {
      const versionStr = checkState.version || updateInfo?.latestVersion || ''
      return (
        <div className="settings-shelf-card update-promoted-card behaviour-col">
          <div className="shelf-card-top">
            <div className="update-header-row">
              <div className="update-group-label">
                <span className="update-dot" />
                <span>{t('behaviour.updateLabelAvailable') || 'NEW UPDATE AVAILABLE'}</span>
              </div>
              <button
                type="button"
                className="update-info-btn"
                title={t('header.whatsNew') || "What's New"}
                aria-label={t('header.whatsNew') || "What's New"}
                onClick={handleOpenChangelog}
              >
                <InfoIcon width={13} height={13} />
              </button>
            </div>
            <div className="setting-title">
              {t('behaviour.updateAvailableTitle', { version: versionStr })}
            </div>
            <div className="setting-desc">
              {t('behaviour.updateAvailableDesc')}
            </div>
          </div>
          <div className="shelf-card-bottom">
            <div className="update-action-row">
              <button
                type="button"
                className="update-action-btn primary"
                style={{ flex: 1 }}
                onClick={() => {
                  playButtonClickSound()
                  handleStartDownload()
                }}
              >
                {t('behaviour.update') || 'Update'}
              </button>
              <button
                type="button"
                className="update-action-btn secondary"
                style={{ flex: '0 0 68px' }}
                onClick={() => {
                  playButtonClickSound()
                  useStore.getState().dismissUpdate()
                }}
              >
                {t('behaviour.skip')}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return null
  }

  // ── Update check: a row in the Updates group ─────────────────────────────
  // Hidden while the promoted top card shows an actionable state (it already
  // carries Download / Skip / Restart / progress).
  const renderUpdateCheckRow = (): RowSpec | null => {
    if (isStoreBuild || hasPromotedTopUpdate) return null
    const status = checkState.status
    const buttonLabel =
      status === 'checking'
        ? t('behaviour.checkingForUpdates')
        : status === 'up-to-date'
          ? t('behaviour.checkAgain')
          : status === 'error'
            ? t('behaviour.tryAgain')
            : t('behaviour.checkForUpdates')
    const version = `${t('footer.version')} ${currentVersion || '0.3.1'}`
    // The title stays put; only the line under it reports the state.
    return {
      id: 'update-check',
      title: t('behaviour.checkForUpdates'),
      desc:
        status === 'checking'
          ? t('behaviour.checkingForUpdates')
          : status === 'up-to-date'
            ? (
                <>
                  {t('behaviour.isUpToDate')}
                  <br />
                  {version}
                </>
              )
            : status === 'error'
              ? t(checkState.error === 'download' ? 'behaviour.updateDownloadFailed' : 'behaviour.updateCheckFailed')
              : version,
      descError: status === 'error',
      trailing: (
        <button
          type="button"
          className={`set-row-icon-btn${status === 'checking' ? ' is-busy' : ''}`}
          title={buttonLabel}
          aria-label={buttonLabel}
          disabled={status === 'checking'}
          onClick={() => {
            playButtonClickSound()
            handleManualCheck()
          }}
        >
          <ArrowsClockwiseIcon width={14} height={14} />
        </button>
      )
    }
  }

  // ── Building blocks shared by both layouts ────────────────────────────────
  const pills = <T extends string | number>(
    options: { label: string; val: T }[],
    isActive: (val: T) => boolean,
    onPick: (val: T) => void
  ) => (
    <div className="setting-pills">
      {options.map((opt) => (
        <button
          key={String(opt.val)}
          type="button"
          className={`pill ${isActive(opt.val) ? 'active' : ''}`}
          onClick={() => {
            playButtonClickSound()
            onPick(opt.val)
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )

  const offsetIsHorizontal = settings.stickPosition === 'top'
  const offsetVal = offsetIsHorizontal ? (settings.horizontalOffset ?? 0.5) : (settings.verticalOffset ?? 0.5)
  const thicknessPx = settings.hotZoneWidth ?? 3
  const indicatorOn = settings.showCopyIndicator ?? true

  const placementPill = (edge: 'left' | 'top' | 'right', label: string) => (
    <button
      type="button"
      className={`pill ${(edgeTransition?.active ? edgeTransition.to === edge : settings.stickPosition === edge) ? 'active' : ''} ${edgeTransition?.active && edgeTransition.to === edge ? 'transitioning' : ''}`}
      disabled={edgeTransition?.active}
      onClick={() => {
        void startEdgeTransition(edge)
      }}
    >
      {label}
    </button>
  )

  const languageControl = isHorizontal ? (
    <button
      type="button"
      className={`language-shelf-btn language-toggle-btn ${languageFlyoutOpen ? 'flyout-open' : ''}`}
      onClick={(e) => {
        playButtonClickSound()
        const rect = e.currentTarget.getBoundingClientRect()
        setLanguageFlyoutOpen(!languageFlyoutOpen, rect)
      }}
    >
      <span className="language-shelf-label">
        <GlobeIcon width={13} height={13} />
        <span>{getLangLabel(selectedLang)}</span>
      </span>
      <motion.span
        animate={{ rotate: languageFlyoutOpen ? 180 : 0 }}
        transition={{ duration: 0.2 }}
        style={{ display: 'flex', alignItems: 'center', opacity: 0.65, flexShrink: 0, marginLeft: 6 }}
      >
        <ChevronDownIcon width={12} height={12} />
      </motion.span>
    </button>
  ) : (
    <LanguageDropdown />
  )

  /** Onboarding only: the four indicator styles inline, instead of the flyout. */
  const tutorialIndicatorGrid = isTutorial && localInlineOpen && (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      style={{ overflow: 'hidden', marginTop: 10 }}
    >
      <div className="tutorial-indicator-grid">
        {([
          { id: 'logo', Icon: LogoIndicatorIcon, label: t('appearance.logoStyle') },
          { id: 'check', Icon: TickIndicatorIcon, label: t('appearance.tickStyle') },
          { id: 'copy', Icon: CopyIndicatorIcon, label: t('appearance.copyStyle') },
          { id: 'sparkle', Icon: SparkleIndicatorIcon, label: t('appearance.sparkleStyle') }
        ] as const).map(({ id, Icon, label }) => (
          <div
            key={id}
            className={`tutorial-indicator-option${(settings.copyIndicatorStyle || 'logo') === id ? ' active' : ''}`}
            onClick={() => {
              playButtonClickSound()
              patch({ copyIndicatorStyle: id })
            }}
          >
            <div className="tutorial-indicator-art">
              <Icon fillColor="#ffffff" size={30} />
            </div>
            <div className="tutorial-indicator-label">{label}</div>
          </div>
        ))}
      </div>
    </motion.div>
  )

  // ── Every setting, grouped by task ─────────────────────────────────────────
  // One definition for both layouts. A few rows only make sense on a side dock
  // (sliding along a vertical edge, the trigger's spot, panel height, text
  // size); the top dock leaves them out.
  const groupsFor = (tab: SettingsTab): GroupSpec[] => {
    if (tab === 'behaviour') {
      const updateCheck = renderUpdateCheckRow()
      return [
        {
          id: 'general',
          label: t('tabs.generalStartup') || 'GENERAL & STARTUP',
          rows: [
            {
              id: 'language',
              title: t('behaviour.languageTitle'),
              desc: isHorizontal ? (t('groups.languageSelectDesc') || 'Select application display language') : t('behaviour.languageDesc'),
              below: languageControl
            },
            {
              id: 'launch-at-login',
              title: t('behaviour.launchAtLoginTitle'),
              desc: t('behaviour.launchAtLoginDesc'),
              trailing: (
                <Toggle
                  checked={settings.launchAtLogin}
                  onChange={(v) => {
                    useStore.setState((s) => ({
                      settings: { ...s.settings, launchAtLogin: v }
                    }))
                    void patch({ launchAtLogin: v })
                  }}
                />
              )
            },
            {
              id: 'incognito',
              title: t('behaviour.incognitoTitle'),
              desc: t('behaviour.incognitoDesc'),
              trailing: <Toggle checked={settings.incognito} onChange={(v) => patch({ incognito: v })} />
            }
          ]
        },
        {
          id: 'opening',
          label: t('tabs.activationShortcuts') || 'SHORTCUTS & HOVER',
          rows: [
            {
              id: 'hover-activation',
              title: t('behaviour.hoverActivationTitle'),
              desc: hoverOn
                ? t('behaviour.hoverActivationDescOn')
                : t('behaviour.hoverActivationDescOff', { shortcut: settings.toggleHotkey || 'Alt+C' }),
              trailing: (
                <Toggle
                  checked={hoverOn}
                  onChange={(v) => {
                    if (!v) {
                      patch({ hoverActivation: false, suppressInFullscreen: false })
                    } else {
                      patch({ hoverActivation: true, suppressInFullscreen: true })
                    }
                  }}
                />
              )
            },
            {
              id: 'fullscreen',
              title: t('behaviour.fullscreenProtectionTitle'),
              desc: hoverOn ? t('behaviour.fullscreenProtectionDesc') : t('behaviour.disabledHoverOff'),
              disabled: !hoverOn,
              trailing: (
                <Toggle
                  checked={hoverOn ? settings.suppressInFullscreen : false}
                  onChange={(v) => hoverOn && patch({ suppressInFullscreen: v })}
                  disabled={!hoverOn}
                />
              )
            },
            {
              id: 'hover-delay',
              title: t('behaviour.hoverDelayTitle') || 'Open Delay',
              desc: hoverOn ? (t('behaviour.hoverDelayDesc') || 'Wait this long at the edge before the shelf slides open') : t('behaviour.disabledHoverOff'),
              disabled: !hoverOn,
              trailing: <span className="set-row-badge">{formatHoverDelay(hoverDelay)}</span>,
              below: renderHoverDelayControl(),
              size: 'slider'
            },
            {
              id: 'shortcut',
              title: t('behaviour.toggleHotkeyTitle'),
              desc: isHorizontal ? (t('groups.toggleHotkeyPressDesc') || t('behaviour.toggleHotkeyDesc')) : t('behaviour.toggleHotkeyDesc'),
              below: (
                <HotkeyRecorder
                  hotkey={settings.toggleHotkey || 'Alt+C'}
                  onChange={(nextHotkey) => {
                    patch({ toggleHotkey: nextHotkey })
                    pushToast({
                      id: Date.now().toString(),
                      message: t('toast.shortcutUpdated', { shortcut: nextHotkey }),
                      tone: 'info'
                    })
                  }}
                />
              )
            }
          ]
        },
        {
          id: 'clipboard',
          label: t('tabs.clipboardRules') || 'CLIPBOARD RULES',
          rows: [
            {
              id: 'move-to-top',
              title: t('behaviour.movePastedToTopTitle'),
              desc: t('behaviour.movePastedToTopDesc'),
              trailing: <Toggle checked={settings.movePastedToTop ?? true} onChange={(v) => patch({ movePastedToTop: v })} />
            },
            {
              id: 'clear-on-restart',
              title: t('behaviour.clearUnpinnedTitle'),
              desc: t('behaviour.clearUnpinnedDesc'),
              trailing: <Toggle checked={settings.clearUnpinnedOnRestart} onChange={(v) => patch({ clearUnpinnedOnRestart: v })} />
            },
            {
              id: 'capacity',
              title: t('behaviour.capacityTitle'),
              desc: t('behaviour.capacityDesc'),
              below: pills(
                [{ label: '100', val: 100 }, { label: '250', val: 250 }, { label: '500', val: 500 }, { label: '1000', val: 1000 }],
                (v) => settings.historyLimit === v,
                (v) => patch({ historyLimit: v })
              )
            },
            {
              id: 'auto-delete',
              title: t('behaviour.autoDeleteTitle'),
              desc: t('behaviour.autoDeleteDesc'),
              below: pills(
                [
                  { label: t('behaviour.never'), val: 0 },
                  { label: '1h', val: 1 },
                  { label: '6h', val: 6 },
                  { label: '24h', val: 24 },
                  { label: '7d', val: 168 }
                ],
                (v) => settings.autoDeleteHours === v,
                (v) => patch({ autoDeleteHours: v })
              )
            }
          ]
        },
        ...(!isStoreBuild ? [{
          id: 'updates',
          label: t('tabs.updates') || 'UPDATES',
          rows: [
            {
              id: 'update-mode',
              title: t('behaviour.autoUpdatesTitle'),
              desc:
                updateMode === 'auto'
                  ? t('behaviour.autoUpdatesDescOn')
                  : updateMode === 'notify'
                    ? (t('behaviour.updateModeNotifyDesc') || 'Notify when updates are available without downloading')
                    : t('behaviour.autoUpdatesDescOff'),
              below: pills<UpdateMode>(
                [
                  { label: t('behaviour.updateModeAuto') || 'Automatic', val: 'auto' },
                  { label: t('behaviour.updateModeNotify') || 'Notify me', val: 'notify' },
                  { label: t('behaviour.updateModeOff') || 'Off', val: 'off' }
                ],
                (v) => updateMode === v,
                (v) => patch({ updateMode: v })
              )
            },
            ...(updateCheck ? [updateCheck] : [])
          ]
        } satisfies GroupSpec] : [])
      ]
    }

    if (tab === 'position') {
      return [
        {
          id: 'position',
          label: t('tabs.position') || 'POSITION',
          rows: [
            {
              id: 'placement',
              title: t('position.edgePlacementTitle'),
              desc: t('position.edgePlacementDesc'),
              below: (
                <div className={`placement-3way-wrap${isHorizontal ? ' shelf-placement-3way' : ''}`}>
                  {placementPill('left', t('position.left') || 'Left')}
                  {placementPill('top', t('position.top') || 'Top')}
                  {placementPill('right', t('position.right') || 'Right')}
                </div>
              )
            },
            ...(!isHorizontal ? [{
              id: 'offset',
              title: offsetIsHorizontal ? (t('position.horizontalPositionTitle') || 'Horizontal Position') : t('position.verticalPositionTitle'),
              desc: offsetIsHorizontal ? (t('position.horizontalPositionDesc') || 'Adjust horizontal alignment along screen edge') : t('position.verticalPositionDesc'),
              trailing: <span className="set-row-badge">{`${Math.round(offsetVal * 100)}%`}</span>,
              size: 'slider',
              below: (
                <div className="setting-slider-wrap">
                  <WakeSlider
                    ariaLabel={offsetIsHorizontal ? (t('position.horizontalPositionTitle') || 'Horizontal Position') : t('position.verticalPositionTitle')}
                    min={0}
                    max={1}
                    step={0.01}
                    bars={28}
                    height={28}
                    restHeight={8}
                    gap={3}
                    value={offsetVal}
                    onStart={() => {
                      void window.edge.setInteractive(true)
                      setSliderActive(true)
                    }}
                    onRelease={(val) => {
                      setSliderActive(false)
                      if (offsetIsHorizontal) {
                        patch({ horizontalOffset: val })
                      } else {
                        handleSliderRelease(val)
                      }
                    }}
                    onChange={(raw) => {
                      if (offsetIsHorizontal) {
                        patch({ horizontalOffset: raw })
                      } else {
                        handleSliderInput(raw)
                      }
                    }}
                  />
                  <div className="setting-slider-labels">
                    {[
                      { label: offsetIsHorizontal ? t('position.left') : '0%', val: 0 },
                      { label: t('position.center'), val: 0.5 },
                      { label: offsetIsHorizontal ? t('position.right') : '100%', val: 1.0 }
                    ].map((pos) => {
                      const active = Math.abs(offsetVal - pos.val) < 0.04
                      return (
                        <button
                          key={pos.val}
                          type="button"
                          className={`slider-label-btn${active ? ' active' : ''}`}
                          onClick={() => {
                            playDialTickSound()
                            if (offsetIsHorizontal) {
                              patch({ horizontalOffset: pos.val })
                            } else {
                              handleSliderRelease(pos.val)
                            }
                          }}
                        >
                          {pos.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            } satisfies RowSpec] : []),
            ...(!isHorizontal ? [{
              id: 'panel-height',
              title: t('position.panelHeightTitle'),
              desc: t('position.panelHeightDesc'),
              below: pills(
                [
                  { label: t('appearance.small'), val: 0.5 },
                  { label: t('position.medium'), val: 0.65 },
                  { label: t('appearance.large'), val: 0.8 }
                ],
                (v) => Math.abs((settings.panelHeight || 0.6) - v) < 0.08,
                (v) => patch({ panelHeight: v })
              )
            } satisfies RowSpec] : []),
            {
              id: 'display',
              title: t('position.displayTitle'),
              desc: t('position.displayDesc'),
              below: (
                <div className="setting-pills">
                  {displays.length === 0 && <div className="pill disabled">{t('position.loadingDisplays')}</div>}
                  {displays.map((d) => {
                    const currentDisplay = displays.find((disp) => disp.isCurrent)
                    const activeDisplayId = currentDisplay
                      ? currentDisplay.id
                      : (settings.stickDisplayId ?? displays.find((disp) => disp.isPrimary)?.id ?? displays[0]?.id)
                    const isActive = activeDisplayId === d.id
                    const displayName = d.isPrimary ? t('position.primaryDisplay') : d.name
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className={`pill display-pill ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          playButtonClickSound()
                          patch({ stickDisplayId: d.id })
                          useStore.getState().notifyPositionChanged()
                        }}
                      >
                        <div className="pill-name">{displayName}</div>
                        <div className="pill-res">{d.resolution}</div>
                      </button>
                    )
                  })}
                </div>
              )
            }
          ]
        },
        {
          id: 'trigger-zone',
          label: t('position.triggerZone') || 'TRIGGER ZONE',
          rows: [
            {
              id: 'location-hint',
              title: t('position.edgeLocationHintTitle'),
              desc: isHorizontal ? (t('groups.edgeHintPulseDesc') || t('position.edgeLocationHintDesc')) : t('position.edgeLocationHintDesc'),
              trailing: <Toggle checked={settings.showEdgeLocationHint ?? false} onChange={(v) => patch({ showEdgeLocationHint: v })} />
            },
            ...(!isHorizontal ? [{
              id: 'trigger-position',
              title: t('position.edgeTriggerPositionTitle'),
              desc: t('position.edgeTriggerPositionDesc'),
              below: pills<'top' | 'center' | 'bottom'>(
                [
                  { label: offsetIsHorizontal ? (t('position.left') || 'Left') : t('position.top'), val: 'top' },
                  { label: t('position.center'), val: 'center' },
                  { label: offsetIsHorizontal ? (t('position.right') || 'Right') : t('position.bottom'), val: 'bottom' }
                ],
                (v) => (settings.triggerAlignment || 'center') === v,
                (v) => {
                  patch({ triggerAlignment: v })
                  useStore.getState().notifyPositionChanged()
                }
              )
            } satisfies RowSpec] : []),
            {
              id: 'hover-area',
              title: t('position.hoverAreaSizeTitle'),
              desc: t('position.hoverAreaSizeDesc'),
              below: pills(
                [
                  { label: t('appearance.small'), val: 0.25 },
                  { label: t('position.medium'), val: 0.4 },
                  { label: t('appearance.large'), val: 0.6 }
                ],
                (v) => Math.abs(settings.hotZoneHeight - v) < 0.08,
                (v) => patch({ hotZoneHeight: v })
              )
            },
            {
              id: 'trigger-thickness',
              title: t('position.edgeTriggerThicknessTitle'),
              desc: t('position.edgeTriggerThicknessDesc'),
              trailing: <span className="set-row-badge">{`${thicknessPx}px`}</span>,
              size: 'slider',
              below: (
                <div className="setting-slider-wrap">
                  <WakeSlider
                    ariaLabel={t('position.edgeTriggerThicknessTitle')}
                    min={1}
                    max={7}
                    step={1}
                    bars={28}
                    height={isHorizontal ? 22 : 28}
                    restHeight={isHorizontal ? 6 : 8}
                    gap={3}
                    value={thicknessPx}
                    onStart={() => {
                      void window.edge.setInteractive(true)
                      setSliderActive(true)
                    }}
                    onRelease={(val) => {
                      handleThicknessRelease(val)
                    }}
                    onChange={(val) => {
                      handleThicknessInput(val)
                    }}
                  />
                  <div className="setting-slider-labels">
                    {[
                      { label: t('position.thicknessMin'), val: 1 },
                      { label: t('position.thicknessMid'), val: 4 },
                      { label: t('position.thicknessMax'), val: 7 }
                    ].map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        className={`slider-label-btn${thicknessPx === preset.val ? ' active' : ''}`}
                        onClick={() => {
                          if (thicknessPx !== preset.val) {
                            playDialTickSound()
                            handleThicknessRelease(preset.val)
                          }
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            }
          ]
        }
      ]
    }

    // appearance
    return [
      {
        id: 'copy-indicator',
        label: t('appearance.copyIndicatorTitle') || 'COPY INDICATOR',
        rows: [
          {
            id: 'copy-indicator',
            title: t('appearance.copyIndicatorTitle'),
            desc: t('appearance.copyIndicatorDesc'),
            trailing: <Toggle checked={indicatorOn} onChange={(v) => patch({ showCopyIndicator: v })} />
          },
          ...(indicatorOn ? [{
            id: 'indicator-style',
            title: t('appearance.indicatorStyleTitle'),
            desc: t('appearance.indicatorStyleDesc'),
            trailing: (
              <button
                type="button"
                className={`icon-btn style-preview-toggle-btn ${isFlyoutActive ? 'active' : ''}`}
                title={isFlyoutActive ? t('appearance.closeStyleSelector') : t('appearance.openStyleSelector')}
                onClick={(e) => {
                  playButtonClickSound()
                  handleToggleFlyout(e.currentTarget)
                }}
              >
                {isFlyoutActive ? <CloseIcon /> : <ChevronRightIcon />}
              </button>
            ),
            extra: tutorialIndicatorGrid
          } satisfies RowSpec] : [])
        ]
      },
      ...(!isHorizontal ? [{
        id: 'typography',
        label: t('appearance.typography') || 'TYPOGRAPHY',
        rows: [
          {
            id: 'text-size',
            title: t('appearance.textSizeTitle'),
            desc: t('appearance.textSizeDesc'),
            below: pills(
              [
                { label: t('appearance.small'), val: 0.85 },
                { label: t('appearance.normal'), val: 1.0 },
                { label: t('appearance.large'), val: 1.15 }
              ],
              (v) => Math.abs((settings.fontSizeScale ?? 1.0) - v) < 0.05,
              (v) => patch({ fontSizeScale: v })
            )
          }
        ]
      } satisfies GroupSpec] : []),
      {
        id: 'audio',
        label: t('appearance.audioAndFeedback') || 'AUDIO FEEDBACK',
        rows: [
          {
            id: 'sound',
            title: t('behaviour.soundEffectsTitle'),
            desc: t('behaviour.soundEffectsDesc'),
            trailing: (
              <Toggle
                checked={settings.soundEffects ?? true}
                onChange={(v) => {
                  if (v) playToggleSound(true)
                  patch({ soundEffects: v })
                }}
              />
            )
          }
        ]
      }
    ]
  }

  const layout: 'v' | 'h' = isHorizontal ? 'h' : 'v'
  const renderGroups = (tab: SettingsTab) =>
    groupsFor(tab).map((group) => <SettingGroup key={group.id} group={group} layout={layout} />)

  // ── Horizontal Layout (Top Dock) ──────────────────────────────────────────
  if (isHorizontal) {
    const handleShelfWheel = (e: React.WheelEvent<HTMLDivElement>) => {
      if (e.deltaY !== 0) {
        e.currentTarget.scrollLeft += e.deltaY
      }
    }

    const handleShelfScroll = (e: React.UIEvent<HTMLDivElement>) => {
      if (isSwitchingTabRef.current) return
      if (styleFlyoutOpen) {
        setStyleFlyoutOpen(false)
      }
      if (languageFlyoutOpen) {
        setLanguageFlyoutOpen(false)
      }
      horizontalTabScrollPositions.current[horizontalTab] = e.currentTarget.scrollLeft
    }

    return (
      <div className="settings-horizontal-shelf">
        <div
          className="settings-shelf-track tab-view"
          ref={shelfTrackRef}
          onWheel={handleShelfWheel}
          onScroll={handleShelfScroll}
        >
          {horizontalTab === 'behaviour' && renderPromotedHorizontalUpdateCard()}
          {renderGroups(horizontalTab)}
          {renderClosingCards()}
        </div>
      </div>
    )
  }

  // ── Vertical Layout (Side Docks) ──────────────────────────────────────────
  const maxTabLen = Math.max(...TABS.map((tab) => tab.label.length))
  const tabFontSize = maxTabLen > 15 ? '10px' : maxTabLen > 13 ? '10.5px' : maxTabLen > 11 ? '11px' : '11.5px'
  const tabLetterSpacing = maxTabLen > 13 ? '-0.02em' : '0'

  return (
    <div className="settings-v" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <div className="settings-fixed-header">
        <div className="settings-tab-bar" role="tablist">
          {TABS.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`settings-tab-btn${active ? ' active' : ''}`}
                onClick={() => handleTabSwitch(tab.id)}
                style={{
                  fontSize: `calc(${tabFontSize} * var(--font-scale, 1))`,
                  letterSpacing: tabLetterSpacing
                }}
              >
                <span className="settings-tab-text">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="settings-scroll-list" ref={scrollListRef}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`tab-${activeTab}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeTab === 'behaviour' && renderPromotedTopUpdateCard()}
            {renderGroups(activeTab)}
            {renderClosingCards()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Grouped rows ─────────────────────────────────────────────────────────────

interface RowSpec {
  id: string
  title: ReactNode
  desc?: ReactNode
  /** error styling for the description */
  descError?: boolean
  /** control at the right end of the row: toggle, value, small button */
  trailing?: ReactNode
  /** wide control under the text: pills, slider, recorder, dropdown */
  below?: ReactNode
  /** sliders need a taller slot in the top dock */
  size?: 'slider'
  disabled?: boolean
  extra?: ReactNode
}

interface GroupSpec {
  id: string
  label: string
  rows: RowSpec[]
}

function SettingRow({ row, layout }: { row: RowSpec; layout: 'v' | 'h' }) {
  const tooltip = layout === 'h' && typeof row.desc === 'string' ? row.desc : undefined
  return (
    <div
      className={`set-row${row.below ? ' has-below' : ''}${row.size === 'slider' ? ' is-slider' : ''}${row.disabled ? ' is-disabled' : ''}`}
      data-row={row.id}
    >
      <div className="set-row-main">
        <div className="set-row-text" title={tooltip}>
          <div className="set-row-title">{row.title}</div>
          {row.desc && <div className={`set-row-desc${row.descError ? ' is-error' : ''}`}>{row.desc}</div>}
        </div>
        {row.trailing && <div className="set-row-trailing">{row.trailing}</div>}
      </div>
      {row.below && <div className="set-row-below">{row.below}</div>}
      {row.extra}
    </div>
  )
}

/** Top dock columns: a setting with a wide control (pills, slider, recorder)
 * fills a column; settings with just a toggle or button stack two to one. */
function columnsOf(rows: RowSpec[]): RowSpec[][] {
  const cols: RowSpec[][] = []
  for (const row of rows) {
    const last = cols[cols.length - 1]
    if (!row.below && last && last.length === 1 && !last[0].below) last.push(row)
    else cols.push([row])
  }
  return cols
}

function SettingGroup({ group, layout }: { group: GroupSpec; layout: 'v' | 'h' }) {
  return (
    <section className={`set-group${layout === 'h' ? ' is-h' : ''}`} data-group={group.id}>
      <h3 className="set-group-label">{group.label}</h3>
      <div className="set-group-card">
        {layout === 'h'
          ? columnsOf(group.rows).map((col) => (
              <div key={col[0].id} className={`set-col${col.length > 1 ? ' is-pair' : ''}`}>
                {col.map((row) => (
                  <SettingRow key={row.id} row={row} layout={layout} />
                ))}
              </div>
            ))
          : group.rows.map((row) => <SettingRow key={row.id} row={row} layout={layout} />)}
      </div>
    </section>
  )
}

function Toggle({
  checked,
  onChange,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <button
      type="button"
      className={`setting-toggle${checked ? ' checked' : ''}`}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        if (disabled) return
        playToggleSound(!checked)
        onChange(!checked)
      }}
      style={{
        flexShrink: 0,
        width: 36,
        height: 20,
        borderRadius: 999,
        background: disabled
          ? 'rgba(255, 255, 255, 0.05)'
          : checked
          ? '#ffffff'
          : isHovered
          ? 'rgba(255, 255, 255, 0.18)'
          : 'rgba(255, 255, 255, 0.12)',
        border: 'none',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 0,
        outline: 'none',
        transition: 'background 0.18s ease, opacity 0.18s ease',
        boxShadow: 'none',
        opacity: disabled ? 0.38 : 1
      }}
    >
      <motion.span
        className="toggle-thumb"
        initial={false}
        animate={{
          x: checked ? 19 : 3,
          backgroundColor: checked ? '#000000' : '#ffffff'
        }}
        transition={{
          type: 'spring',
          stiffness: 520,
          damping: 32,
          mass: 0.5
        }}
        style={{
          position: 'absolute',
          top: 3,
          left: 0,
          width: 14,
          height: 14,
          borderRadius: '50%',
          boxShadow: 'none',
          pointerEvents: 'none'
        }}
      />
    </button>
  )
}

function LanguageDropdown({ direction = 'down', compact = false }: { direction?: 'up' | 'down'; compact?: boolean } = {}) {
  const { language, languages, resolvedLang } = useTranslation()
  const patch = useStore((s) => s.patchSettings)
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const getLangLabel = (l: { code: string; name: string; nativeName: string }) => languageLabel(l, resolvedLang)

  const selectedLang = languages.find((l) => l.code === (language || 'system')) || languages[0]

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      window.addEventListener('mousedown', handleClickOutside)
    }
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeBtn = listRef.current.querySelector<HTMLButtonElement>('[data-active="true"]')
      if (activeBtn) {
        if (selectedLang.code === 'system') {
          listRef.current.scrollTop = 0
        } else {
          listRef.current.scrollTop = Math.max(0, activeBtn.offsetTop - 4)
        }
      }
    }
  }, [isOpen, selectedLang.code])

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => {
          playButtonClickSound()
          setIsOpen(!isOpen)
        }}
        style={{
          width: '100%',
          height: compact ? 28 : 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: isOpen ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.05)',
          color: '#ffffff',
          border: isOpen ? '1px solid rgba(255, 255, 255, 0.22)' : '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: compact ? 8 : 10,
          padding: compact ? '0 10px' : '8px 12px',
          fontSize: compact ? 11.5 : 12.5,
          fontWeight: 500,
          outline: 'none',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
          transition: 'all 0.15s ease'
        }}
      >
        <span>{getLangLabel(selectedLang)}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ display: 'flex', alignItems: 'center', color: 'rgba(255, 255, 255, 0.6)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={listRef}
            initial={{ opacity: 0, y: direction === 'up' ? -6 : 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: direction === 'up' ? -6 : 6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: direction === 'up' ? 'auto' : 'calc(100% + 6px)',
              bottom: direction === 'up' ? 'calc(100% + 5px)' : 'auto',
              left: 0,
              right: 0,
              maxHeight: direction === 'up' ? (compact ? 88 : 140) : 180,
              overflowY: 'auto',
              background: '#121214',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: 10,
              padding: '4px',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)',
              zIndex: 100,
              scrollbarWidth: 'none'
            }}
          >
            {languages.map((lang) => {
              const active = lang.code === (language || 'system')
              return (
                <button
                  key={lang.code}
                  type="button"
                  data-active={active ? 'true' : 'false'}
                  onClick={() => {
                    playButtonClickSound()
                    patch({ language: lang.code })
                    setIsOpen(false)
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: compact ? '5px 8px' : '7px 10px',
                    borderRadius: 7,
                    background: active ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                    color: active ? '#ffffff' : 'rgba(255, 255, 255, 0.8)',
                    fontSize: compact ? 11.5 : 12,
                    fontWeight: active ? 600 : 400,
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.12s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)'
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span>{getLangLabel(lang)}</span>
                  {active && <span style={{ color: '#4caf50', fontSize: 13, fontWeight: 700 }}>✓</span>}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
