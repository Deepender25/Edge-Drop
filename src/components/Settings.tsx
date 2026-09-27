import { useEffect, useState, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/appStore'
import type { DisplayInfo, UpdateMode } from '../../shared/types'
import { resolveUpdateMode } from '../../shared/types'
import {
  LogoIndicatorIcon,
  TickIndicatorIcon,
  CopyIndicatorIcon,
  SparkleIndicatorIcon
} from './CopyIndicatorCurve'
import { ChevronRightIcon, CloseIcon, LogOutIcon, StarIcon, InfoIcon, GithubOctocatLogo, MicrosoftStoreLogo } from './icons'
import { HotkeyRecorder } from './HotkeyRecorder'
import { SlideCommit } from './SlideCommit'
import { WakeSlider } from './WakeSlider'
import { playDialTickSound, playToggleSound, playButtonClickSound } from '../lib/soundEffects'
import { useTranslation } from '../i18n'
import '../styles/settings.css'

type SettingsTab = 'behaviour' | 'position' | 'appearance'

export function Settings({
  inlineIndicatorStyle,
  isHorizontal: propIsHorizontal
}: {
  inlineIndicatorStyle?: boolean
  isHorizontal?: boolean
}) {
  const { t, language, languages } = useTranslation()
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

  const getLangLabel = (l: { code: string; name: string; nativeName: string }) =>
    l.code === 'system' || l.nativeName.includes('(') ? l.nativeName : `${l.nativeName} (${l.name})`
  const selectedLang = languages.find((l) => l.code === (language || 'system')) || languages[0]

  const lastTickVal = useRef<number>(settings.verticalOffset ?? 0.5)
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

  const handleSliderInput = (rawVal: number) => {
    const clamped = Math.min(1.0, Math.max(0.0, rawVal))
    if (Math.abs(clamped - lastTickVal.current) >= 0.05) {
      lastTickVal.current = clamped
      playDialTickSound()
    }
    useStore.setState((s) => ({
      settings: { ...s.settings, verticalOffset: clamped }
    }))
  }

  const handleSliderRelease = (rawVal: number) => {
    const snapped = Math.round(rawVal / 0.05) * 0.05
    const clamped = Math.min(1.0, Math.max(0.0, snapped))
    lastTickVal.current = clamped
    playDialTickSound()
    patch({ verticalOffset: clamped })
  }

  const handleThicknessInput = (rawVal: number) => {
    const clamped = Math.min(7, Math.max(1, Math.round(rawVal)))
    if (clamped !== (settings.hotZoneWidth ?? 3)) {
      playDialTickSound()
      useStore.setState((s) => ({
        settings: { ...s.settings, hotZoneWidth: clamped }
      }))
    }
  }

  const handleThicknessRelease = (rawVal: number) => {
    const clamped = Math.min(7, Math.max(1, Math.round(rawVal)))
    setSliderActive(false)
    playDialTickSound()
    patch({ hotZoneWidth: clamped })
  }

  const [localInlineOpen, setLocalInlineOpen] = useState(false)
  const isTutorial = inlineIndicatorStyle || (typeof window !== 'undefined' && window.location.hash.includes('onboarding'))
  const isFlyoutActive = isTutorial ? localInlineOpen : styleFlyoutOpen
  const indicatorBtnRef = useRef<HTMLButtonElement | null>(null)

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
  const updateBannerRef = useRef<HTMLDivElement | null>(null)

  // ── Persistent footer shared across all tabs ───────────────────────────
  const PersistentFooter = (
    <>
      {/* Community & Support */}
      <div className="setting-section-divider">
        <span className="setting-section-divider-text">{t('footer.communityAndSupport') || 'COMMUNITY & SUPPORT'}</span>
      </div>

      <div className="setting-card">
        <div className="shelf-card-top">
          <div className="setting-group-label">{t('groups.feedback') || 'FEEDBACK'}</div>
          <div className="setting-title">{t('footer.feedbackTitle')}</div>
          <div className="setting-desc">{t('footer.feedbackDesc')}</div>
        </div>
        <div className="shelf-card-bottom">
          <button
            className="pill display-pill"
            style={{ width: '100%', justifyContent: 'center', padding: '7px 14px', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '12.5px' }}
            onClick={() => {
              playButtonClickSound()
              window.open('https://github.com/Deepender25/Edge-Drop/issues/new/choose', '_blank')
            }}
          >
            {t('footer.submitFeedback')}
          </button>
        </div>
      </div>

      {/* Support & GitHub Promo Card */}
      <div className="setting-card" style={{ padding: '14px' }}>
        <div className="support-promo" style={{ margin: 0, padding: 0, background: 'transparent', border: 'none' }}>
          <div className="support-promo-title">
            {t('footer.supportPromo')}
          </div>
          <div className="support-buttons-group">
            {/* Primary Action: Support via Ko-fi / UPI */}
            <button
              className="kofi-support-btn"
              onClick={() => {
                playButtonClickSound()
                window.open('https://www.edgedrop.app/supportedgedrop', '_blank')
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#ff4757" stroke="none" style={{ flexShrink: 0 }}>
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              <span>{t('footer.supportOnKofi')}</span>
            </button>

            {/* Secondary Action: GitHub Star on GitHub builds / Review on Microsoft Store for Store builds */}
            {isStoreBuild ? (
              <button
                type="button"
                className="store-review-promo-btn"
                onClick={() => {
                  playButtonClickSound()
                  window.open('ms-windows-store://review/?ProductId=9P3JMHN9M4NR', '_blank')
                }}
              >
                <MicrosoftStoreLogo width={14} height={14} className="store-logo-icon" />
                <span>{t('footer.reviewOnStore')}</span>
              </button>
            ) : (
              <button
                type="button"
                className="github-promo-btn"
                onClick={() => {
                  playButtonClickSound()
                  window.open('https://github.com/Deepender25/Edge-Drop', '_blank')
                }}
              >
                <GithubOctocatLogo width={14} height={14} className="github-octocat-icon" />
                <span>{t('footer.starOnGithub')}</span>
                <StarIcon width={13} height={13} className="star-icon" fill="#fbbf24" stroke="#fbbf24" style={{ marginLeft: 2 }} />
              </button>
            )}
          </div>
          <div className="app-version-footer">
            <span>{t('footer.version')} {currentVersion || '0.3.1'}</span>
            <span className="version-separator">·</span>
            <button
              type="button"
              className="version-changelog-link"
              onClick={() => {
                playButtonClickSound()
                if (currentVersion) {
                  patch({ lastSeenChangelogVersion: currentVersion })
                }
                window.open('https://www.edgedrop.app/changelog', '_blank')
              }}
            >
              <span>{t('header.whatsNew')}</span>
              <span style={{ fontSize: 10, opacity: 0.7 }}>↗</span>
            </button>
          </div>
        </div>
      </div>

      {/* Subtle Bottom Quit Button */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12, marginBottom: 8 }}>
        <button
          className="subtle-quit-btn"
          onClick={() => {
            playButtonClickSound()
            void window.edge.quitApp()
          }}
        >
          <LogOutIcon width={13} height={13} />
          <span>{t('tray.quit')}</span>
        </button>
      </div>
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
              <span className="shelf-progress-text">{downloadPercent > 0 ? `${downloadPercent}%` : 'Connecting...'}</span>
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
              <span className="shelf-progress-text">{downloadPercent > 0 ? `${downloadPercent}%` : 'Connecting...'}</span>
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

  // ── Manual update card renderer (idle/check states at the bottom) ──
  const renderManualUpdateCard = (withRef = false) => {
    // Hidden while the promoted top card shows an actionable state — the
    // top card already carries Download/Skip/Restart/progress, so rendering
    // both would duplicate the prompt. The idle branch below IS the Check
    // button, which is exactly what belongs at the bottom.
    if (isStoreBuild || hasPromotedTopUpdate) return null
    return (
      <div className="manual-update-section" ref={withRef ? updateBannerRef : undefined} style={{ width: '100%' }}>
        <div className="manual-update-card">
          {checkState.status === 'checking' ? (
            <>
              <div className="manual-update-info">
                <div className="manual-update-title">{t('behaviour.checkForUpdates')}</div>
                <div className="manual-update-desc">{t('behaviour.checkingForUpdates')}</div>
              </div>
              <button
                type="button"
                className="manual-update-pill outline"
                disabled
              >
                <span className="update-dot checking" />
                <span>{t('behaviour.checkingForUpdates')}</span>
              </button>
            </>
          ) : checkState.status === 'up-to-date' ? (
            <>
              <div className="manual-update-info">
                <div className="manual-update-title">
                  <span className="update-dot available" />
                  <span>{t('behaviour.isUpToDate')}</span>
                </div>
                <div className="manual-update-desc">
                  {t('footer.version')} {currentVersion || '0.3.1'}
                </div>
              </div>
              <button
                type="button"
                className="manual-update-pill outline"
                onClick={() => {
                  playButtonClickSound()
                  handleManualCheck()
                }}
              >
                {t('behaviour.checkAgain')}
              </button>
            </>
          ) : checkState.status === 'error' ? (
            <>
              <div className="manual-update-info">
                <div className="manual-update-title error">
                  {t('behaviour.updateCheckFailed')}
                </div>
                <div className="manual-update-desc error">
                  {checkState.error || t('behaviour.updateCheckFailed')}
                </div>
              </div>
              <button
                type="button"
                className="manual-update-pill outline"
                onClick={() => {
                  playButtonClickSound()
                  handleManualCheck()
                }}
              >
                {t('behaviour.tryAgain')}
              </button>
            </>
          ) : (
            <>
              <div className="manual-update-info">
                <div className="manual-update-title">{t('behaviour.checkForUpdates')}</div>
                <div className="manual-update-desc">
                  {t('footer.version')} {currentVersion || '0.3.1'}
                </div>
              </div>
              <button
                type="button"
                className="manual-update-pill outline"
                onClick={() => {
                  playButtonClickSound()
                  handleManualCheck()
                }}
              >
                {t('behaviour.checkForUpdates')}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Horizontal Layout (Top / Bottom Dock Position) ────────────────────────
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

    const renderHorizontalCommunityCard = () => (
      <div className="settings-shelf-card support-card">
        <div className="shelf-card-top">
          <div className="setting-group-label">{t('footer.communityAndSupport') || 'COMMUNITY & SUPPORT'}</div>
          <div className="setting-title">{t('footer.communityAndSupport')}</div>
          <div className="setting-desc">{t('footer.supportTagline') || '100% free & open-source clipboard'}</div>
        </div>
        <div className="shelf-card-bottom">
          <button
            type="button"
            className="shelf-kofi-btn"
            onClick={() => {
              playButtonClickSound()
              window.open('https://www.edgedrop.app/supportedgedrop', '_blank')
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#ff4757" stroke="none" style={{ flexShrink: 0 }}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <span>{t('footer.supportOnKofi')}</span>
          </button>
          {isStoreBuild ? (
            <button
              type="button"
              className="shelf-github-btn"
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
              className="shelf-github-btn"
              onClick={() => {
                playButtonClickSound()
                window.open('https://github.com/Deepender25/Edge-Drop', '_blank')
              }}
            >
              <GithubOctocatLogo width={13} height={13} className="github-octocat-icon" />
              <span>{t('footer.starOnGithub')}</span>
              <StarIcon width={12} height={12} className="star-icon" fill="#fbbf24" stroke="#fbbf24" style={{ marginLeft: 2 }} />
            </button>
          )}
        </div>
      </div>
    )

    const renderHorizontalAboutCard = () => (
      <div className="settings-shelf-card about-card">
        <div className="shelf-card-top">
          <div className="setting-group-label">{t('groups.aboutEdgeDrop') || 'ABOUT EDGE-DROP'}</div>
          <div className="setting-title">Edge-Drop v{currentVersion || '0.3.2'}</div>
          <div className="setting-desc">{t('footer.feedbackDesc')}</div>
        </div>
        <div className="shelf-card-bottom">
          <button
            type="button"
            className="pill display-pill"
            style={{ width: '100%', justifyContent: 'center', height: 30, fontSize: 11.5, fontWeight: 550, borderRadius: 999 }}
            onClick={() => {
              playButtonClickSound()
              window.open('https://github.com/Deepender25/Edge-Drop/issues/new/choose', '_blank')
            }}
          >
            {t('footer.submitFeedback')}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
            <button
              type="button"
              className="version-changelog-link"
              style={{ fontSize: 11 }}
              onClick={() => {
                playButtonClickSound()
                if (currentVersion) patch({ lastSeenChangelogVersion: currentVersion })
                window.open('https://www.edgedrop.app/changelog', '_blank')
              }}
            >
              {t('header.whatsNew')} ↗
            </button>
            <button
              type="button"
              className="shelf-quit-btn"
              onClick={() => {
                playButtonClickSound()
                void window.edge.quitApp()
              }}
            >
              <LogOutIcon width={11} height={11} />
              <span>{t('tray.quit')}</span>
            </button>
          </div>
        </div>
      </div>
    )

    return (
      <div className="settings-horizontal-shelf">
        <div
          className="settings-shelf-track tab-view"
          ref={shelfTrackRef}
          onWheel={handleShelfWheel}
          onScroll={handleShelfScroll}
        >
          {/* ── TAB 1: BEHAVIOUR ── */}
          {horizontalTab === 'behaviour' && (
            <>
              {renderPromotedHorizontalUpdateCard()}

              {/* ── SUB-GROUP 1 DIVIDER: General & Startup ── */}
              <div className="shelf-section-divider">
                <span className="shelf-section-divider-text">{t('tabs.generalStartup') || 'GENERAL & STARTUP'}</span>
              </div>

              {/* Card 1: Language */}
              <div className="settings-shelf-card shortcuts-card behaviour-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.general') || 'GENERAL'}</div>
                  <div className="setting-title">{t('behaviour.languageTitle')}</div>
                  <div className="setting-desc">{t('groups.languageSelectDesc') || 'Select application display language'}</div>
                </div>
                <div className="shelf-card-bottom">
                  <button
                    type="button"
                    className={`language-shelf-btn language-toggle-btn ${languageFlyoutOpen ? 'flyout-open' : ''}`}
                    onClick={(e) => {
                      playButtonClickSound()
                      const rect = e.currentTarget.getBoundingClientRect()
                      setLanguageFlyoutOpen(!languageFlyoutOpen, rect)
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, overflow: 'hidden' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.65, flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="2" y1="12" x2="22" y2="12"/>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                      </svg>
                      <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getLangLabel(selectedLang)}
                      </span>
                    </div>
                    <motion.span
                      animate={{ rotate: languageFlyoutOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ display: 'flex', alignItems: 'center', opacity: 0.65, flexShrink: 0, marginLeft: 6 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6"/>
                      </svg>
                    </motion.span>
                  </button>
                </div>
              </div>

              {/* Card 2: Launch at Login */}
              <div className="settings-shelf-card system-card behaviour-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.startup') || 'STARTUP'}</div>
                </div>
                <div className="shelf-card-inline">
                  <div className="shelf-card-inline-text">
                    <div className="setting-title">{t('behaviour.launchAtLoginTitle')}</div>
                    <div className="setting-desc">{t('behaviour.launchAtLoginDesc')}</div>
                  </div>
                  <div className="shelf-card-inline-action">
                    <Toggle
                      checked={settings.launchAtLogin}
                      onChange={(v) => {
                        useStore.setState((s) => ({
                          settings: { ...s.settings, launchAtLogin: v }
                        }))
                        void patch({ launchAtLogin: v })
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Card 3: Incognito Mode */}
              <div className="settings-shelf-card incognito-card behaviour-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.privacy') || 'PRIVACY'}</div>
                </div>
                <div className="shelf-card-inline">
                  <div className="shelf-card-inline-text">
                    <div className="setting-title">{t('behaviour.incognitoTitle')}</div>
                    <div className="setting-desc">{t('behaviour.incognitoDesc')}</div>
                  </div>
                  <div className="shelf-card-inline-action">
                    <Toggle
                      checked={settings.incognito}
                      onChange={(v) => patch({ incognito: v })}
                    />
                  </div>
                </div>
              </div>

              {/* ── SUB-GROUP 2 DIVIDER: Shortcuts & Hover ── */}
              <div className="shelf-section-divider">
                <span className="shelf-section-divider-text">{t('tabs.activationShortcuts') || 'SHORTCUTS & HOVER'}</span>
              </div>

              {/* Card 4: Hover Activation */}
              <div className="settings-shelf-card hover-card behaviour-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.hoverActivation') || 'HOVER ACTIVATION'}</div>
                </div>
                <div className="shelf-card-inline">
                  <div className="shelf-card-inline-text">
                    <div className="setting-title">{t('behaviour.hoverActivationTitle')}</div>
                    <div className="setting-desc">
                      {(settings.hoverActivation ?? true)
                        ? t('behaviour.hoverActivationDescOn')
                        : t('behaviour.hoverActivationDescOff', { shortcut: settings.toggleHotkey || 'Alt+C' })}
                    </div>
                  </div>
                  <div className="shelf-card-inline-action">
                    <Toggle
                      checked={settings.hoverActivation ?? true}
                      onChange={(v) => {
                        if (!v) {
                          patch({ hoverActivation: false, suppressInFullscreen: false })
                        } else {
                          patch({ hoverActivation: true, suppressInFullscreen: true })
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Card 5: Global Toggle Shortcut */}
              <div className="settings-shelf-card hotkey-card behaviour-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.keyboardShortcut') || 'KEYBOARD SHORTCUT'}</div>
                  <div className="setting-title">{t('behaviour.toggleHotkeyTitle')}</div>
                  <div className="setting-desc">{t('groups.toggleHotkeyPressDesc') || 'Press anywhere to toggle Edge-Drop'}</div>
                </div>
                <div className="shelf-card-bottom">
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
                </div>
              </div>

              {/* Card 6: Fullscreen Protection */}
              <div className="settings-shelf-card fullscreen-card behaviour-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.fullscreenProtection') || 'FULLSCREEN PROTECTION'}</div>
                </div>
                <div className="shelf-card-inline" style={{ opacity: (settings.hoverActivation ?? true) ? 1 : 0.45 }}>
                  <div className="shelf-card-inline-text">
                    <div className="setting-title">{t('behaviour.fullscreenProtectionTitle')}</div>
                    <div className="setting-desc">
                      {(settings.hoverActivation ?? true)
                        ? t('behaviour.fullscreenProtectionDesc')
                        : t('behaviour.disabledHoverOff')}
                    </div>
                  </div>
                  <div className="shelf-card-inline-action">
                    <Toggle
                      checked={(settings.hoverActivation ?? true) ? settings.suppressInFullscreen : false}
                      onChange={(v) => (settings.hoverActivation ?? true) && patch({ suppressInFullscreen: v })}
                      disabled={!(settings.hoverActivation ?? true)}
                    />
                  </div>
                </div>
              </div>

              {/* ── SUB-GROUP 3 DIVIDER: Clipboard Rules ── */}
              <div className="shelf-section-divider">
                <span className="shelf-section-divider-text">{t('tabs.clipboardRules') || 'CLIPBOARD RULES'}</span>
              </div>

              {/* Card 7: Move Pasted to Top */}
              <div className="settings-shelf-card order-card behaviour-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.clipboardBehaviour') || 'CLIPBOARD BEHAVIOUR'}</div>
                </div>
                <div className="shelf-card-inline">
                  <div className="shelf-card-inline-text">
                    <div className="setting-title">{t('behaviour.movePastedToTopTitle')}</div>
                    <div className="setting-desc">{t('behaviour.movePastedToTopDesc')}</div>
                  </div>
                  <div className="shelf-card-inline-action">
                    <Toggle
                      checked={settings.movePastedToTop ?? true}
                      onChange={(v) => patch({ movePastedToTop: v })}
                    />
                  </div>
                </div>
              </div>

              {/* Card 8: Clear Unpinned on Restart */}
              <div className="settings-shelf-card rules-card behaviour-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.restartCleanup') || 'RESTART CLEANUP'}</div>
                </div>
                <div className="shelf-card-inline">
                  <div className="shelf-card-inline-text">
                    <div className="setting-title">{t('behaviour.clearUnpinnedTitle')}</div>
                    <div className="setting-desc">{t('behaviour.clearUnpinnedDesc')}</div>
                  </div>
                  <div className="shelf-card-inline-action">
                    <Toggle
                      checked={settings.clearUnpinnedOnRestart}
                      onChange={(v) => patch({ clearUnpinnedOnRestart: v })}
                    />
                  </div>
                </div>
              </div>

              {/* ── SUB-GROUP 4 DIVIDER: Storage & Retention ── */}
              <div className="shelf-section-divider">
                <span className="shelf-section-divider-text">{t('tabs.storageRetention') || 'STORAGE & RETENTION'}</span>
              </div>

              {/* Card 9: History Capacity */}
              <div className="settings-shelf-card storage-card behaviour-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.storageCapacity') || 'STORAGE CAPACITY'}</div>
                  <div className="setting-title">{t('behaviour.capacityTitle')}</div>
                  <div className="setting-desc">{t('behaviour.capacityDesc')}</div>
                </div>
                <div className="shelf-card-bottom">
                  <div className="setting-pills" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                    {[
                      { label: '100', val: 100 },
                      { label: '250', val: 250 },
                      { label: '500', val: 500 },
                      { label: '1000', val: 1000 }
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        className={`pill ${settings.historyLimit === opt.val ? 'active' : ''}`}
                        style={{ height: 32, fontSize: 11.5, fontWeight: 500, padding: 0 }}
                        onClick={() => { playButtonClickSound(); patch({ historyLimit: opt.val }) }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card 10: Auto-Delete Timer */}
              <div className="settings-shelf-card autodelete-card behaviour-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.autoDelete') || 'AUTO-DELETE'}</div>
                  <div className="setting-title">{t('behaviour.autoDeleteTitle')}</div>
                  <div className="setting-desc">{t('behaviour.autoDeleteDesc')}</div>
                </div>
                <div className="shelf-card-bottom">
                  <div className="setting-pills" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                    {[
                      { label: t('behaviour.never'), val: 0 },
                      { label: '1h', val: 1 },
                      { label: '6h', val: 6 },
                      { label: '24h', val: 24 },
                      { label: '7d', val: 168 }
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        className={`pill ${settings.autoDeleteHours === opt.val ? 'active' : ''}`}
                        style={{ height: 32, fontSize: 11, fontWeight: 500, padding: 0 }}
                        onClick={() => { playButtonClickSound(); patch({ autoDeleteHours: opt.val }) }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── SUB-GROUP 5 DIVIDER: Updates ── */}
              {!isStoreBuild && (
                <div className="shelf-section-divider">
                  <span className="shelf-section-divider-text">{t('tabs.updates') || 'UPDATES'}</span>
                </div>
              )}

              {/* Card 11: Application Updates (3-mode selector) */}
              <div className="settings-shelf-card updates-card behaviour-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.updates') || 'UPDATES'}</div>
                  <div className="setting-title">{t('behaviour.autoUpdatesTitle')}</div>
                  <div className="setting-desc">
                    {!isStoreBuild
                      ? (updateMode === 'auto'
                        ? t('behaviour.autoUpdatesDescOn')
                        : updateMode === 'notify'
                        ? (t('behaviour.updateModeNotifyDesc') || 'Notify when updates are available without downloading')
                        : t('behaviour.autoUpdatesDescOff'))
                      : 'Managed by Microsoft Store'}
                  </div>
                </div>
                {!isStoreBuild && (
                  <div className="shelf-card-bottom">
                    <div className="setting-pills" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, width: '100%' }}>
                      {([
                        { id: 'auto' as UpdateMode, label: t('behaviour.updateModeAuto') || 'Automatic' },
                        { id: 'notify' as UpdateMode, label: t('behaviour.updateModeNotify') || 'Notify me' },
                        { id: 'off' as UpdateMode, label: t('behaviour.updateModeOff') || 'Off' }
                      ]).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`pill ${updateMode === opt.id ? 'active' : ''}`}
                          style={{ height: 32, fontSize: 11, fontWeight: 500, padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', justifyContent: 'center' }}
                          onClick={() => { playButtonClickSound(); patch({ updateMode: opt.id }) }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Card 12: Update Status & Actions (idle/check states; hidden
                  while the promoted front card shows an actionable state) */}
              {!isStoreBuild && !hasPromotedTopUpdate && (
                <div className="settings-shelf-card check-updates-card behaviour-col" ref={updateBannerRef}>
                  <div className="shelf-card-top">
                    <div className="setting-group-label">
                      UPDATE STATUS
                    </div>
                    <div className="setting-title" style={{ lineHeight: 1.3 }}>
                      {checkState.status === 'checking'
                        ? t('behaviour.checkingForUpdates')
                        : checkState.status === 'up-to-date'
                        ? t('behaviour.isUpToDate')
                        : checkState.status === 'error'
                        ? t('behaviour.updateCheckFailed')
                        : t('behaviour.checkForUpdates')}
                    </div>
                    <div className="setting-desc">
                      {checkState.status === 'error'
                        ? (checkState.error || t('behaviour.updateCheckFailed'))
                        : `Edge-Drop v${currentVersion || '0.3.1'}`}
                    </div>
                  </div>
                  <div className="shelf-card-bottom">
                    <button
                      type="button"
                      className="pill display-pill"
                      style={{ width: '100%', justifyContent: 'center', fontSize: 11.5, height: 32 }}
                      disabled={checkState.status === 'checking'}
                      onClick={() => {
                        playButtonClickSound()
                        handleManualCheck()
                      }}
                    >
                      {checkState.status === 'checking' ? (
                        <>
                          <span className="update-dot checking" style={{ marginRight: 6 }} />
                          <span>{t('behaviour.checkingForUpdates')}</span>
                        </>
                      ) : checkState.status === 'up-to-date' ? (
                        t('behaviour.checkAgain')
                      ) : checkState.status === 'error' ? (
                        t('behaviour.tryAgain')
                      ) : (
                        t('behaviour.checkForUpdates')
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* ── SUB-GROUP 6 DIVIDER: Community & Support ── */}
              <div className="shelf-section-divider">
                <span className="shelf-section-divider-text">{t('footer.communityAndSupport') || 'COMMUNITY & SUPPORT'}</span>
              </div>

              {/* Card 13: Community & Feedback */}
              {renderHorizontalCommunityCard()}

              {/* Card 14: About & Quit */}
              {renderHorizontalAboutCard()}
            </>
          )}

          {/* ── TAB 2: POSITION ── */}
          {horizontalTab === 'position' && (
            <>
              {/* ── SUB-GROUP 1 DIVIDER: Position ── */}
              <div className="shelf-section-divider">
                <span className="shelf-section-divider-text">{t('tabs.position') || 'POSITION'}</span>
              </div>

              {/* Card 1: Edge Placement */}
              <div className="settings-shelf-card placement-card position-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.placement') || 'PLACEMENT'}</div>
                  <div className="setting-title" style={{ color: '#ffffff' }}>{t('position.edgePlacementTitle')}</div>
                  <div className="setting-desc">{t('position.edgePlacementDesc')}</div>
                </div>
                <div className="shelf-card-bottom">
                  <div className="placement-3way-wrap shelf-placement-3way">
                    <button
                      type="button"
                      className={`pill ${(edgeTransition?.active ? edgeTransition.to === 'left' : settings.stickPosition === 'left') ? 'active' : ''} ${edgeTransition?.active && edgeTransition.to === 'left' ? 'transitioning' : ''}`}
                      disabled={edgeTransition?.active}
                      onClick={() => {
                        void startEdgeTransition('left')
                      }}
                    >
                      {t('position.leftEdge') || 'Left Edge'}
                    </button>
                    <button
                      type="button"
                      className={`pill ${(edgeTransition?.active ? edgeTransition.to === 'top' : settings.stickPosition === 'top') ? 'active' : ''} ${edgeTransition?.active && edgeTransition.to === 'top' ? 'transitioning' : ''}`}
                      disabled={edgeTransition?.active}
                      onClick={() => {
                        void startEdgeTransition('top')
                      }}
                    >
                      {t('position.topEdge') || 'Top Edge'}
                    </button>
                    <button
                      type="button"
                      className={`pill ${(edgeTransition?.active ? edgeTransition.to === 'right' : settings.stickPosition === 'right') ? 'active' : ''} ${edgeTransition?.active && edgeTransition.to === 'right' ? 'transitioning' : ''}`}
                      disabled={edgeTransition?.active}
                      onClick={() => {
                        void startEdgeTransition('right')
                      }}
                    >
                      {t('position.rightEdge') || 'Right Edge'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Card 2: Target Display */}
              <div className="settings-shelf-card display-card position-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.displayMonitor') || 'DISPLAY MONITOR'}</div>
                  <div className="setting-title">{t('position.displayTitle')}</div>
                  <div className="setting-desc">{t('position.displayDesc')}</div>
                </div>
                <div className="shelf-card-bottom">
                  {displays.length === 0 ? (
                    <div className="pill disabled">{t('position.loadingDisplays')}</div>
                  ) : (
                    displays.map((d) => {
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
                          style={{ width: '100%', justifyContent: 'space-between', padding: '6px 14px', fontSize: 11.5, height: 32, flexShrink: 0 }}
                          onClick={() => {
                            playButtonClickSound()
                            patch({ stickDisplayId: d.id })
                            useStore.getState().notifyPositionChanged()
                          }}
                        >
                          <span className="pill-name" style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: 8 }}>{displayName}</span>
                          <span className="pill-res" style={{ opacity: 0.75, fontSize: 11, flexShrink: 0 }}>{d.resolution}</span>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Card 3: Edge Location Hint */}
              <div className="settings-shelf-card beacon-card position-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.locationHint') || 'LOCATION HINT'}</div>
                </div>
                <div className="shelf-card-inline">
                  <div className="shelf-card-inline-text">
                    <div className="setting-title">{t('position.edgeLocationHintTitle')}</div>
                    <div className="setting-desc">{t('groups.edgeHintPulseDesc') || 'Beacon pulse along edge to hint dock position'}</div>
                  </div>
                  <div className="shelf-card-inline-action">
                    <Toggle
                      checked={settings.showEdgeLocationHint ?? false}
                      onChange={(v) => patch({ showEdgeLocationHint: v })}
                    />
                  </div>
                </div>
              </div>

              {/* ── SUB-GROUP 2 DIVIDER: Trigger Zone ── */}
              <div className="shelf-section-divider">
                <span className="shelf-section-divider-text">{t('position.triggerZone') || 'TRIGGER ZONE'}</span>
              </div>

              {/* Card 5: Hover Area Size */}
              <div className="settings-shelf-card trigger-bar-card position-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.hoverZoneLength') || 'HOVER ZONE LENGTH'}</div>
                  <div className="setting-title">{t('position.hoverAreaSizeTitle')}</div>
                  <div className="setting-desc">{t('position.hoverAreaSizeDesc')}</div>
                </div>
                <div className="shelf-card-bottom">
                  <div className="setting-pills" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, width: '100%' }}>
                    {[
                      { label: t('appearance.small'), val: 0.25 },
                      { label: t('position.medium'), val: 0.4 },
                      { label: t('appearance.large'), val: 0.6 }
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        className={`pill ${Math.abs(settings.hotZoneHeight - opt.val) < 0.08 ? 'active' : ''}`}
                        style={{ height: 32, fontSize: 11.5, fontWeight: 500, padding: 0 }}
                        onClick={() => {
                          playButtonClickSound()
                          patch({ hotZoneHeight: opt.val })
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card 6: Edge Trigger Thickness */}
              <div className="settings-shelf-card trigger-thickness-card position-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.triggerThickness') || 'TRIGGER THICKNESS'}</div>
                  <div className="setting-slider-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div>
                      <div className="setting-title">{t('position.edgeTriggerThicknessTitle')}</div>
                      <div className="setting-desc">{t('position.edgeTriggerThicknessDesc')}</div>
                    </div>
                    <div className="setting-slider-val" style={{ flexShrink: 0, padding: '2px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6 }}>
                      {`${settings.hotZoneWidth ?? 3}px`}
                    </div>
                  </div>
                </div>
                <div className="shelf-card-bottom">
                  <div className="setting-slider-wrap" style={{ gap: 4, padding: '2px 0' }}>
                    <WakeSlider
                      ariaLabel={t('position.edgeTriggerThicknessTitle')}
                      min={1}
                      max={7}
                      step={1}
                      bars={28}
                      height={28}
                      restHeight={8}
                      gap={3}
                      value={settings.hotZoneWidth ?? 3}
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
                    <div className="setting-slider-labels" style={{ marginTop: 2 }}>
                      {[
                        { label: 'Min', val: 1 },
                        { label: 'Mid', val: 4 },
                        { label: 'Max', val: 7 }
                      ].map((preset) => {
                        const currentPx = settings.hotZoneWidth ?? 3
                        const active = currentPx === preset.val
                        return (
                          <button
                            key={preset.val}
                            type="button"
                            className={`slider-label-btn${active ? ' active' : ''}`}
                            style={{ fontSize: 10, padding: '2px 8px' }}
                            onClick={() => {
                              if (currentPx !== preset.val) {
                                handleThicknessRelease(preset.val)
                              }
                            }}
                          >
                            {preset.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── SUB-GROUP 3 DIVIDER: Community & Support ── */}
              <div className="shelf-section-divider">
                <span className="shelf-section-divider-text">{t('footer.communityAndSupport') || 'COMMUNITY & SUPPORT'}</span>
              </div>

              {/* Card 9: Community & Feedback */}
              {renderHorizontalCommunityCard()}

              {/* Card 10: About & Quit */}
              {renderHorizontalAboutCard()}
            </>
          )}

          {/* ── TAB 3: APPEARANCE ── */}
          {horizontalTab === 'appearance' && (
            <>
              {/* ── SUB-GROUP 1 DIVIDER: Copy Indicator ── */}
              <div className="shelf-section-divider">
                <span className="shelf-section-divider-text">{t('appearance.copyIndicatorTitle') || 'COPY INDICATOR'}</span>
              </div>

              {/* Card 1: Copy Indicator Toggle */}
              <div className="settings-shelf-card beacon-toggle-card appearance-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.copyBeacon') || 'COPY BEACON'}</div>
                </div>
                <div className="shelf-card-inline">
                  <div className="shelf-card-inline-text">
                    <div className="setting-title">{t('appearance.copyIndicatorTitle')}</div>
                    <div className="setting-desc">{t('appearance.copyIndicatorDesc')}</div>
                  </div>
                  <div className="shelf-card-inline-action">
                    <Toggle
                      checked={settings.showCopyIndicator ?? true}
                      onChange={(v) => patch({ showCopyIndicator: v })}
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Visual Copy Beacon Style */}
              {(settings.showCopyIndicator ?? true) && (
                <div className="settings-shelf-card copy-card appearance-col">
                  <div className="shelf-card-top">
                    <div className="setting-group-label">{t('groups.beaconStyle') || 'BEACON STYLE'}</div>
                  </div>
                  <div className="shelf-card-inline">
                    <div className="shelf-card-inline-text">
                      <div className="setting-title">{t('appearance.indicatorStyleTitle')}</div>
                      <div className="setting-desc">{t('appearance.indicatorStyleDesc')}</div>
                    </div>
                    <div className="shelf-card-inline-action">
                      <button
                        ref={indicatorBtnRef}
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
                    </div>
                  </div>
                </div>
              )}

              {/* ── SUB-GROUP 2 DIVIDER: Audio & Feedback ── */}
              <div className="shelf-section-divider">
                <span className="shelf-section-divider-text">{t('appearance.audioAndFeedback') || 'AUDIO FEEDBACK'}</span>
              </div>

              {/* Card 4: Audio & Feedback */}
              <div className="settings-shelf-card audio-card appearance-col">
                <div className="shelf-card-top">
                  <div className="setting-group-label">{t('groups.audioFeedback') || 'AUDIO FEEDBACK'}</div>
                </div>
                <div className="shelf-card-inline">
                  <div className="shelf-card-inline-text">
                    <div className="setting-title">{t('behaviour.soundEffectsTitle')}</div>
                    <div className="setting-desc">{t('behaviour.soundEffectsDesc')}</div>
                  </div>
                  <div className="shelf-card-inline-action">
                    <Toggle
                      checked={settings.soundEffects ?? true}
                      onChange={(v) => {
                        if (v) playToggleSound(true)
                        patch({ soundEffects: v })
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* ── SUB-GROUP 3 DIVIDER: Community & Support ── */}
              <div className="shelf-section-divider">
                <span className="shelf-section-divider-text">{t('footer.communityAndSupport') || 'COMMUNITY & SUPPORT'}</span>
              </div>

              {/* Card 5: Community & Feedback */}
              {renderHorizontalCommunityCard()}

              {/* Card 6: About & Quit */}
              {renderHorizontalAboutCard()}
            </>
          )}
        </div>
      </div>
    )
  }


  const maxTabLen = Math.max(...TABS.map((tab) => tab.label.length))
  const tabFontSize = maxTabLen > 15 ? '9px' : maxTabLen > 13 ? '9.5px' : maxTabLen > 11 ? '10px' : maxTabLen > 9 ? '10.8px' : '11.5px'
  const tabLetterSpacing = maxTabLen > 13 ? '-0.03em' : maxTabLen > 10 ? '-0.015em' : '0'

  return (
    <div
      style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
    >
      {/* ── Stationary Fixed Header (Tab Selector) ────────────────── */}
          <div className="settings-fixed-header">
            <div className="settings-tab-bar">
              {TABS.map((tab) => {
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
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

          {/* ── Scrollable Content Area (Independent per section) ───────── */}
          <div className="settings-scroll-list" ref={scrollListRef}>

            {/* ── Tab 1: Behaviour (First) ──────────────────────────────── */}
            <AnimatePresence mode="wait">
              {activeTab === 'behaviour' && (
                <motion.div
                  key="tab-behaviour"
                  initial={{ opacity: 0, scale: 0.98, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -4 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  {renderPromotedTopUpdateCard()}

                  {/* ── SUB-GROUP 1: General & Startup ───────────────── */}
                  <div className="setting-section-divider">
                    <span className="setting-section-divider-text">{t('tabs.generalStartup') || 'GENERAL & STARTUP'}</span>
                  </div>

                  {/* Card 1: Language */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.general') || 'GENERAL'}</div>
                      <div className="setting-title">{t('behaviour.languageTitle')}</div>
                      <div className="setting-desc">{t('behaviour.languageDesc')}</div>
                    </div>
                    <div className="shelf-card-bottom">
                      <LanguageDropdown />
                    </div>
                  </div>

                  {/* Card 2: Launch at Login */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.startup') || 'STARTUP'}</div>
                    </div>
                    <div className="shelf-card-inline">
                      <div className="shelf-card-inline-text">
                        <div className="setting-title">{t('behaviour.launchAtLoginTitle')}</div>
                        <div className="setting-desc">{t('behaviour.launchAtLoginDesc')}</div>
                      </div>
                      <div className="shelf-card-inline-action">
                        <Toggle
                          checked={settings.launchAtLogin}
                          onChange={(v) => {
                            useStore.setState((s) => ({
                              settings: { ...s.settings, launchAtLogin: v }
                            }))
                            void patch({ launchAtLogin: v })
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Incognito Mode */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.privacy') || 'PRIVACY'}</div>
                    </div>
                    <div className="shelf-card-inline">
                      <div className="shelf-card-inline-text">
                        <div className="setting-title">{t('behaviour.incognitoTitle')}</div>
                        <div className="setting-desc">{t('behaviour.incognitoDesc')}</div>
                      </div>
                      <div className="shelf-card-inline-action">
                        <Toggle
                          checked={settings.incognito}
                          onChange={(v) => patch({ incognito: v })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── SUB-GROUP 2: Shortcuts & Hover ──────────────── */}
                  <div className="setting-section-divider">
                    <span className="setting-section-divider-text">{t('tabs.activationShortcuts') || 'SHORTCUTS & HOVER'}</span>
                  </div>

                  {/* Card 4: Hover Activation */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.hoverActivation') || 'HOVER ACTIVATION'}</div>
                    </div>
                    <div className="shelf-card-inline">
                      <div className="shelf-card-inline-text">
                        <div className="setting-title">{t('behaviour.hoverActivationTitle')}</div>
                        <div className="setting-desc">
                          {(settings.hoverActivation ?? true)
                            ? t('behaviour.hoverActivationDescOn')
                            : t('behaviour.hoverActivationDescOff', { shortcut: settings.toggleHotkey || 'Alt+C' })}
                        </div>
                      </div>
                      <div className="shelf-card-inline-action">
                        <Toggle
                          checked={settings.hoverActivation ?? true}
                          onChange={(v) => {
                            if (!v) {
                              patch({ hoverActivation: false, suppressInFullscreen: false })
                            } else {
                              patch({ hoverActivation: true, suppressInFullscreen: true })
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card 5: Global Toggle Shortcut */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.keyboardShortcut') || 'KEYBOARD SHORTCUT'}</div>
                      <div className="setting-title">{t('behaviour.toggleHotkeyTitle')}</div>
                      <div className="setting-desc">{t('behaviour.toggleHotkeyDesc')}</div>
                    </div>
                    <div className="shelf-card-bottom">
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
                    </div>
                  </div>

                  {/* Card 6: Fullscreen Protection */}
                  <div className="setting-card" style={{ opacity: (settings.hoverActivation ?? true) ? 1 : 0.45, transition: 'opacity 0.2s ease' }}>
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.fullscreenProtection') || 'FULLSCREEN PROTECTION'}</div>
                    </div>
                    <div className="shelf-card-inline">
                      <div className="shelf-card-inline-text">
                        <div className="setting-title">{t('behaviour.fullscreenProtectionTitle')}</div>
                        <div className="setting-desc">
                          {(settings.hoverActivation ?? true)
                            ? t('behaviour.fullscreenProtectionDesc')
                            : t('behaviour.disabledHoverOff')}
                        </div>
                      </div>
                      <div className="shelf-card-inline-action">
                        <Toggle
                          checked={(settings.hoverActivation ?? true) ? settings.suppressInFullscreen : false}
                          onChange={(v) => (settings.hoverActivation ?? true) && patch({ suppressInFullscreen: v })}
                          disabled={!(settings.hoverActivation ?? true)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── SUB-GROUP 3: Clipboard Rules ─────────────────── */}
                  <div className="setting-section-divider">
                    <span className="setting-section-divider-text">{t('tabs.clipboardRules') || 'CLIPBOARD RULES'}</span>
                  </div>

                  {/* Card 7: Move Pasted to Top */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.clipboardBehaviour') || 'CLIPBOARD BEHAVIOUR'}</div>
                    </div>
                    <div className="shelf-card-inline">
                      <div className="shelf-card-inline-text">
                        <div className="setting-title">{t('behaviour.movePastedToTopTitle')}</div>
                        <div className="setting-desc">{t('behaviour.movePastedToTopDesc')}</div>
                      </div>
                      <div className="shelf-card-inline-action">
                        <Toggle
                          checked={settings.movePastedToTop ?? true}
                          onChange={(v) => patch({ movePastedToTop: v })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card 8: Clear Unpinned on Restart */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.restartCleanup') || 'RESTART CLEANUP'}</div>
                    </div>
                    <div className="shelf-card-inline">
                      <div className="shelf-card-inline-text">
                        <div className="setting-title">{t('behaviour.clearUnpinnedTitle')}</div>
                        <div className="setting-desc">{t('behaviour.clearUnpinnedDesc')}</div>
                      </div>
                      <div className="shelf-card-inline-action">
                        <Toggle
                          checked={settings.clearUnpinnedOnRestart}
                          onChange={(v) => patch({ clearUnpinnedOnRestart: v })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── SUB-GROUP 4: Storage & Retention ─────────────── */}
                  <div className="setting-section-divider">
                    <span className="setting-section-divider-text">{t('tabs.storageRetention') || 'STORAGE & RETENTION'}</span>
                  </div>

                  {/* Card 9: History Capacity */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.storageCapacity') || 'STORAGE CAPACITY'}</div>
                      <div className="setting-title">{t('behaviour.capacityTitle')}</div>
                      <div className="setting-desc">{t('behaviour.capacityDesc')}</div>
                    </div>
                    <div className="shelf-card-bottom">
                      <div className="setting-pills">
                        {[
                          { label: '100', val: 100 },
                          { label: '250', val: 250 },
                          { label: '500', val: 500 },
                          { label: '1000', val: 1000 }
                        ].map((opt) => (
                          <button
                            key={opt.val}
                            className={`pill ${settings.historyLimit === opt.val ? 'active' : ''}`}
                            onClick={() => { playButtonClickSound(); patch({ historyLimit: opt.val }) }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Card 10: Auto-Delete Timer */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.autoDelete') || 'AUTO-DELETE'}</div>
                      <div className="setting-title">{t('behaviour.autoDeleteTitle')}</div>
                      <div className="setting-desc">{t('behaviour.autoDeleteDesc')}</div>
                    </div>
                    <div className="shelf-card-bottom">
                      <div className="setting-pills">
                        {[
                          { label: t('behaviour.never'), val: 0 },
                          { label: '1h', val: 1 },
                          { label: '6h', val: 6 },
                          { label: '24h', val: 24 },
                          { label: '7d', val: 168 }
                        ].map((opt) => (
                          <button
                            key={opt.val}
                            className={`pill ${settings.autoDeleteHours === opt.val ? 'active' : ''}`}
                            onClick={() => { playButtonClickSound(); patch({ autoDeleteHours: opt.val }) }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ── UPDATES SECTION (Consolidated above Community & Support) ── */}
                  {!isStoreBuild && (
                    <>
                      <div className="setting-section-divider">
                        <span className="setting-section-divider-text">{t('tabs.updates') || 'UPDATES'}</span>
                      </div>

                      {/* Card 11: Auto Updates (3-way selector) */}
                      <div className="setting-card">
                        <div className="shelf-card-top">
                          <div className="setting-group-label">{t('groups.updates') || 'UPDATES'}</div>
                          <div className="setting-title">{t('behaviour.autoUpdatesTitle')}</div>
                          <div className="setting-desc">
                            {updateMode === 'auto'
                              ? t('behaviour.autoUpdatesDescOn')
                              : updateMode === 'notify'
                              ? (t('behaviour.updateModeNotifyDesc') || 'Notify when updates are available without downloading')
                              : t('behaviour.autoUpdatesDescOff')}
                          </div>
                        </div>
                        <div className="shelf-card-bottom">
                          <div className="setting-pills" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
                            {([
                              { label: t('behaviour.updateModeAuto') || 'Automatic', val: 'auto' as UpdateMode },
                              { label: t('behaviour.updateModeNotify') || 'Notify me', val: 'notify' as UpdateMode },
                              { label: t('behaviour.updateModeOff') || 'Off', val: 'off' as UpdateMode }
                            ]).map((opt) => (
                              <button
                                key={opt.val}
                                className={`pill ${updateMode === opt.val ? 'active' : ''}`}
                                onClick={() => { playButtonClickSound(); patch({ updateMode: opt.val }) }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {renderManualUpdateCard(true)}
                    </>
                  )}

                  {PersistentFooter}
                </motion.div>
              )}

              {/* ── Tab 2: Position (Second) ─────────────────────────────── */}
              {activeTab === 'position' && (
                <motion.div
                  key="tab-position"
                  initial={{ opacity: 0, scale: 0.98, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -4 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  {/* ── GROUP: Position ──────────────────────────────────── */}
                  <div className="setting-section-divider">
                    <span className="setting-section-divider-text">{t('tabs.position') || 'POSITION'}</span>
                  </div>

                  {/* Card 1: Edge Placement */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.placement') || 'PLACEMENT'}</div>
                      <div className="setting-title">{t('position.edgePlacementTitle')}</div>
                      <div className="setting-desc">{t('position.edgePlacementDesc')}</div>
                    </div>
                    <div className="shelf-card-bottom">
                      <div className="placement-3way-wrap">
                        <button
                          type="button"
                          className={`pill ${(edgeTransition?.active ? edgeTransition.to === 'left' : settings.stickPosition === 'left') ? 'active' : ''} ${edgeTransition?.active && edgeTransition.to === 'left' ? 'transitioning' : ''}`}
                          disabled={edgeTransition?.active}
                          onClick={() => {
                            void startEdgeTransition('left')
                          }}
                        >
                          {t('position.leftEdge') || 'Left Edge'}
                        </button>
                        <button
                          type="button"
                          className={`pill ${(edgeTransition?.active ? edgeTransition.to === 'top' : settings.stickPosition === 'top') ? 'active' : ''} ${edgeTransition?.active && edgeTransition.to === 'top' ? 'transitioning' : ''}`}
                          disabled={edgeTransition?.active}
                          onClick={() => {
                            void startEdgeTransition('top')
                          }}
                        >
                          {t('position.topEdge') || 'Top Edge'}
                        </button>
                        <button
                          type="button"
                          className={`pill ${(edgeTransition?.active ? edgeTransition.to === 'right' : settings.stickPosition === 'right') ? 'active' : ''} ${edgeTransition?.active && edgeTransition.to === 'right' ? 'transitioning' : ''}`}
                          disabled={edgeTransition?.active}
                          onClick={() => {
                            void startEdgeTransition('right')
                          }}
                        >
                          {t('position.rightEdge') || 'Right Edge'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Position Range Slider */}
                  {(() => {
                    const isHorizontal = settings.stickPosition === 'top'
                    const offsetVal = isHorizontal ? (settings.horizontalOffset ?? 0.5) : (settings.verticalOffset ?? 0.5)
                    const sliderTitle = isHorizontal ? (t('position.horizontalPositionTitle') || 'Horizontal Position') : t('position.verticalPositionTitle')
                    const sliderDesc = isHorizontal ? (t('position.horizontalPositionDesc') || 'Adjust horizontal alignment along screen edge') : t('position.verticalPositionDesc')

                    return (
                      <div className="setting-card">
                        <div className="shelf-card-top">
                          <div className="setting-group-label">{t('groups.alignment') || 'ALIGNMENT'}</div>
                          <div className="setting-slider-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <div>
                              <div className="setting-title">{sliderTitle}</div>
                              <div className="setting-desc">{sliderDesc}</div>
                            </div>
                            <div className="setting-slider-val">
                              {`${Math.round(offsetVal * 100)}%`}
                            </div>
                          </div>
                        </div>

                        <div className="shelf-card-bottom">
                          <div className="setting-slider-wrap">
                            <WakeSlider
                              ariaLabel={sliderTitle}
                              min={0}
                              max={1}
                              step={0.002}
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
                                if (isHorizontal) {
                                  patch({ horizontalOffset: val })
                                } else {
                                  handleSliderRelease(val)
                                }
                              }}
                              onChange={(raw) => {
                                if (isHorizontal) {
                                  patch({ horizontalOffset: raw })
                                } else {
                                  handleSliderInput(raw)
                                }
                              }}
                            />

                            <div className="setting-slider-labels">
                              {[
                                { label: isHorizontal ? 'Left' : '0%', val: 0 },
                                { label: 'Center', val: 0.5 },
                                { label: isHorizontal ? 'Right' : '100%', val: 1.0 }
                              ].map((pos) => {
                                const active = Math.abs(offsetVal - pos.val) < 0.04
                                return (
                                  <button
                                    key={pos.val}
                                    type="button"
                                    className={`slider-label-btn${active ? ' active' : ''}`}
                                    onClick={() => {
                                      if (isHorizontal) {
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
                        </div>
                      </div>
                    )
                  })()}

                  {/* Card 3: Target Display */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.displayMonitor') || 'DISPLAY MONITOR'}</div>
                      <div className="setting-title">{t('position.displayTitle')}</div>
                      <div className="setting-desc">{t('position.displayDesc')}</div>
                    </div>
                    <div className="shelf-card-bottom">
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
                    </div>
                  </div>

                  {/* ── GROUP: Trigger Zone ──────────────────────────────── */}
                  <div className="setting-section-divider">
                    <span className="setting-section-divider-text">{t('position.triggerZone') || 'TRIGGER ZONE'}</span>
                  </div>

                  {/* Card 4: Location Hint */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.locationHint') || 'LOCATION HINT'}</div>
                    </div>
                    <div className="shelf-card-inline">
                      <div className="shelf-card-inline-text">
                        <div className="setting-title">{t('position.edgeLocationHintTitle')}</div>
                        <div className="setting-desc">{t('position.edgeLocationHintDesc')}</div>
                      </div>
                      <div className="shelf-card-inline-action">
                        <Toggle
                          checked={settings.showEdgeLocationHint ?? false}
                          onChange={(v) => patch({ showEdgeLocationHint: v })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card 5: Trigger Alignment */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.triggerPosition') || 'TRIGGER POSITION'}</div>
                      <div className="setting-title">{t('position.edgeTriggerPositionTitle')}</div>
                      <div className="setting-desc">{t('position.edgeTriggerPositionDesc')}</div>
                    </div>
                    <div className="shelf-card-bottom">
                      <div className="setting-pills">
                        {[
                          { label: (settings.stickPosition === 'top') ? (t('position.left') || 'Left') : t('position.top'), val: 'top' as const },
                          { label: t('position.center'), val: 'center' as const },
                          { label: (settings.stickPosition === 'top') ? (t('position.right') || 'Right') : t('position.bottom'), val: 'bottom' as const }
                        ].map((opt) => (
                          <button
                            key={opt.val}
                            className={`pill ${(settings.triggerAlignment || 'center') === opt.val ? 'active' : ''}`}
                            onClick={() => {
                              playButtonClickSound()
                              patch({ triggerAlignment: opt.val })
                              useStore.getState().notifyPositionChanged()
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Card 6: Hover Area Size */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.hoverZoneLength') || 'HOVER ZONE LENGTH'}</div>
                      <div className="setting-title">{t('position.hoverAreaSizeTitle')}</div>
                      <div className="setting-desc">{t('position.hoverAreaSizeDesc')}</div>
                    </div>
                    <div className="shelf-card-bottom">
                      <div className="setting-pills">
                        {[
                          { label: t('appearance.small'), val: 0.25 },
                          { label: t('position.medium'), val: 0.4 },
                          { label: t('appearance.large'), val: 0.6 }
                        ].map((opt) => (
                          <button
                            key={opt.label}
                            className={`pill ${Math.abs(settings.hotZoneHeight - opt.val) < 0.08 ? 'active' : ''}`}
                            onClick={() => {
                              playButtonClickSound()
                              patch({ hotZoneHeight: opt.val })
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Card 7: Edge Trigger Thickness */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.triggerThickness') || 'TRIGGER THICKNESS'}</div>
                      <div className="setting-slider-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <div>
                          <div className="setting-title">{t('position.edgeTriggerThicknessTitle')}</div>
                          <div className="setting-desc">{t('position.edgeTriggerThicknessDesc')}</div>
                        </div>
                        <div className="setting-slider-val">
                          {`${settings.hotZoneWidth ?? 3}px`}
                        </div>
                      </div>
                    </div>

                    <div className="shelf-card-bottom">
                      <div className="setting-slider-wrap">
                        <WakeSlider
                          min={1}
                          max={7}
                          step={1}
                          bars={28}
                          height={28}
                          restHeight={8}
                          gap={3}
                          value={settings.hotZoneWidth ?? 3}
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
                            { label: 'Min', val: 1 },
                            { label: 'Mid', val: 4 },
                            { label: 'Max', val: 7 }
                          ].map((preset) => {
                            const currentPx = settings.hotZoneWidth ?? 3
                            const active = currentPx === preset.val
                            return (
                              <button
                                key={preset.val}
                                type="button"
                                className={`slider-label-btn${active ? ' active' : ''}`}
                                onClick={() => {
                                  if (currentPx !== preset.val) {
                                    handleThicknessRelease(preset.val)
                                  }
                                }}
                              >
                                {preset.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 8: Panel Height */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.panelHeight') || 'PANEL HEIGHT'}</div>
                      <div className="setting-title">{t('position.panelHeightTitle')}</div>
                      <div className="setting-desc">{t('position.panelHeightDesc')}</div>
                    </div>
                    <div className="shelf-card-bottom">
                      <div className="setting-pills">
                        {[
                          { label: t('appearance.small'), val: 0.5 },
                          { label: t('position.medium'), val: 0.65 },
                          { label: t('appearance.large'), val: 0.8 }
                        ].map((opt) => (
                          <button
                            key={opt.label}
                            className={`pill ${Math.abs((settings.panelHeight || 0.6) - opt.val) < 0.08 ? 'active' : ''}`}
                            onClick={() => {
                              playButtonClickSound()
                              patch({ panelHeight: opt.val })
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {PersistentFooter}
                </motion.div>
              )}

              {/* ── Tab 3: Appearance (Third) ────────────────────────────── */}
              {activeTab === 'appearance' && (
                <motion.div
                  key="tab-appearance"
                  initial={{ opacity: 0, scale: 0.98, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -4 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  {/* ── GROUP: Copy Indicator ────────────────────────────── */}
                  <div className="setting-section-divider">
                    <span className="setting-section-divider-text">{t('appearance.copyIndicatorTitle') || 'COPY INDICATOR'}</span>
                  </div>

                  {/* Card 1: Copy Indicator Toggle */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.copyBeacon') || 'COPY BEACON'}</div>
                    </div>
                    <div className="shelf-card-inline">
                      <div className="shelf-card-inline-text">
                        <div className="setting-title">{t('appearance.copyIndicatorTitle')}</div>
                        <div className="setting-desc">{t('appearance.copyIndicatorDesc')}</div>
                      </div>
                      <div className="shelf-card-inline-action">
                        <Toggle
                          checked={settings.showCopyIndicator ?? true}
                          onChange={(v) => patch({ showCopyIndicator: v })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Indicator Style */}
                  {(settings.showCopyIndicator ?? true) && (
                    <div className="setting-card">
                      <div className="shelf-card-top">
                        <div className="setting-group-label">{t('groups.beaconStyle') || 'BEACON STYLE'}</div>
                      </div>
                      <div className="shelf-card-inline">
                        <div className="shelf-card-inline-text">
                          <div className="setting-title">{t('appearance.indicatorStyleTitle')}</div>
                          <div className="setting-desc">
                            {t('appearance.indicatorStyleDesc')}
                          </div>
                        </div>
                        <div className="shelf-card-inline-action">
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
                        </div>
                      </div>

                      {isTutorial && localInlineOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22, ease: 'easeOut' }}
                          style={{ overflow: 'hidden', marginTop: 12, marginBottom: 8 }}
                        >
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: 10,
                            padding: 12,
                            background: '#09090b',
                            borderRadius: 12,
                            border: '1px solid rgba(255, 255, 255, 0.08)'
                          }}>
                            {/* Logo Card */}
                            <div
                              onClick={() => {
                                playButtonClickSound()
                                patch({ copyIndicatorStyle: 'logo' })
                              }}
                              style={{
                                background: (settings.copyIndicatorStyle || 'logo') === 'logo' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                                border: (settings.copyIndicatorStyle || 'logo') === 'logo' ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                                borderRadius: 10,
                                padding: '12px 8px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                gap: 8,
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <LogoIndicatorIcon fillColor="#ffffff" size={30} />
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>{t('appearance.logoStyle')}</div>
                            </div>

                            {/* Tick Card */}
                            <div
                              onClick={() => {
                                playButtonClickSound()
                                patch({ copyIndicatorStyle: 'check' })
                              }}
                              style={{
                                background: settings.copyIndicatorStyle === 'check' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                                border: settings.copyIndicatorStyle === 'check' ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                                borderRadius: 10,
                                padding: '12px 8px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                gap: 8,
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <TickIndicatorIcon fillColor="#ffffff" size={30} />
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>{t('appearance.tickStyle')}</div>
                            </div>

                            {/* Copy Card */}
                            <div
                              onClick={() => {
                                playButtonClickSound()
                                patch({ copyIndicatorStyle: 'copy' })
                              }}
                              style={{
                                background: settings.copyIndicatorStyle === 'copy' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                                border: settings.copyIndicatorStyle === 'copy' ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                                borderRadius: 10,
                                padding: '12px 8px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                gap: 8,
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CopyIndicatorIcon fillColor="#ffffff" size={30} />
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>{t('appearance.copyStyle')}</div>
                            </div>

                            {/* Sparkle Card */}
                            <div
                              onClick={() => {
                                playButtonClickSound()
                                patch({ copyIndicatorStyle: 'sparkle' })
                              }}
                              style={{
                                background: settings.copyIndicatorStyle === 'sparkle' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                                border: settings.copyIndicatorStyle === 'sparkle' ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                                borderRadius: 10,
                                padding: '12px 8px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                gap: 8,
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <SparkleIndicatorIcon fillColor="#ffffff" size={30} />
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>{t('appearance.sparkleStyle')}</div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  )}

                  {/* ── GROUP: Typography ────────────────────────────────── */}
                  <div className="setting-section-divider">
                    <span className="setting-section-divider-text">{t('appearance.typography') || 'TYPOGRAPHY'}</span>
                  </div>

                  {/* Card 3: Text Size */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.textSize') || 'TEXT SIZE'}</div>
                      <div className="setting-title">{t('appearance.textSizeTitle')}</div>
                      <div className="setting-desc">{t('appearance.textSizeDesc')}</div>
                    </div>
                    <div className="shelf-card-bottom">
                      <div className="setting-pills">
                        {[
                          { label: t('appearance.small'), val: 0.85 },
                          { label: t('appearance.normal'), val: 1.0 },
                          { label: t('appearance.large'), val: 1.15 }
                        ].map((opt) => (
                          <button
                            key={opt.label}
                            className={`pill ${Math.abs((settings.fontSizeScale ?? 1.0) - opt.val) < 0.05 ? 'active' : ''}`}
                            onClick={() => {
                              playButtonClickSound()
                              patch({ fontSizeScale: opt.val })
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ── GROUP: Audio & Feedback ──────────────────────────── */}
                  <div className="setting-section-divider">
                    <span className="setting-section-divider-text">{t('appearance.audioAndFeedback') || 'AUDIO FEEDBACK'}</span>
                  </div>

                  {/* Card 4: Audio Feedback */}
                  <div className="setting-card">
                    <div className="shelf-card-top">
                      <div className="setting-group-label">{t('groups.audioFeedback') || 'AUDIO FEEDBACK'}</div>
                    </div>
                    <div className="shelf-card-inline">
                      <div className="shelf-card-inline-text">
                        <div className="setting-title">{t('behaviour.soundEffectsTitle')}</div>
                        <div className="setting-desc">{t('behaviour.soundEffectsDesc')}</div>
                      </div>
                      <div className="shelf-card-inline-action">
                        <Toggle
                          checked={settings.soundEffects ?? true}
                          onChange={(v) => {
                            if (v) playToggleSound(true)
                            patch({ soundEffects: v })
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {PersistentFooter}
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>
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
  const { language, languages } = useTranslation()
  const patch = useStore((s) => s.patchSettings)
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const getLangLabel = (l: { code: string; name: string; nativeName: string }) =>
    l.code === 'system' || l.nativeName.includes('(') ? l.nativeName : `${l.nativeName} (${l.name})`

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
