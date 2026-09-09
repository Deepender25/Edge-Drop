import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/appStore'
import type { DisplayInfo } from '../../shared/types'
import { LiquidOctopusLoader } from './LiquidOctopusLoader'
import { TickIndicatorIcon, CopyIndicatorIcon, SparkleIndicatorIcon } from './CopyIndicatorCurve'
import { ChevronRightIcon, CloseIcon, LogOutIcon, StarIcon, GithubOctocatLogo, MicrosoftStoreLogo } from './icons'
import { HotkeyRecorder } from './HotkeyRecorder'
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
  const { t } = useTranslation()
  const settings = useStore((s) => s.settings)
  const isHorizontal = propIsHorizontal ?? (settings.stickPosition === 'top' || settings.stickPosition === 'bottom')

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
  const setSliderActive = useStore((s) => s.setSliderActive)

  const lastTickVal = useRef<number>(settings.verticalOffset ?? 0.5)
  const horizontalTab = useStore((s) => s.settingsTab)
  const shelfTrackRef = useRef<HTMLDivElement>(null)

  const handleSliderInput = (rawVal: number) => {
    const clamped = Math.min(1.0, Math.max(0.0, rawVal))
    if (Math.abs(clamped - lastTickVal.current) >= 0.05) {
      lastTickVal.current = clamped
      playDialTickSound()
    }
    // Update store state immediately for butter-smooth 60fps real-time tracking
    useStore.setState((s) => ({
      settings: { ...s.settings, verticalOffset: clamped }
    }))
  }

  const handleSliderRelease = (rawVal: number) => {
    // Snap to nearest 5% tick on pointer release
    const snapped = Math.round(rawVal / 0.05) * 0.05
    const clamped = Math.min(1.0, Math.max(0.0, snapped))
    lastTickVal.current = clamped
    playDialTickSound()
    patch({ verticalOffset: clamped })
  }

  const [localInlineOpen, setLocalInlineOpen] = useState(false)
  const isTutorial = inlineIndicatorStyle || (typeof window !== 'undefined' && window.location.hash.includes('onboarding'))

  const isFlyoutActive = isTutorial ? localInlineOpen : styleFlyoutOpen

  const handleToggleFlyout = () => {
    if (isTutorial) {
      setLocalInlineOpen(!localInlineOpen)
    } else {
      setStyleFlyoutOpen(!styleFlyoutOpen)
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
  const autoUpdates = settings.autoUpdates ?? true

  const checkState = useStore((s) => s.manualCheckState)
  const handleManualCheck = () => useStore.getState().startManualCheck()
  const handleStartDownload = () => useStore.getState().startManualDownload()

  const isDownloading = checkState.status === 'downloading' || (!updateDownloaded && (settings.autoUpdates ?? true) && !!updateInfo?.hasUpdate)
  const downloadPercent = updateInfo?.downloadProgress?.percent ?? 0

  // ── Tab state & Independent Scroll Memory per section ──────────────────────
  const [activeTab, setActiveTab] = useState<SettingsTab>('behaviour')
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

  // ── Update banner ref & status tracking ────────────────────────────────────
  const updateBannerRef = useRef<HTMLDivElement | null>(null)
  const hasUpdatePrompt = !isStoreBuild && (!autoUpdates || !!(updateDownloaded || isDownloading || checkState.status === 'available'))

  // ── Floating Scroll Indicator Badge for Off-Screen Update Banner ────────────
  const [isUpdateCardVisible, setIsUpdateCardVisible] = useState(false)
  const hasActiveUpdate = !isStoreBuild && !!(updateDownloaded || isDownloading || checkState.status === 'available')
  const showScrollUpdateBadge = hasActiveUpdate && !isUpdateCardVisible

  useEffect(() => {
    if (!hasActiveUpdate) {
      setIsUpdateCardVisible(false)
      return
    }

    if (activeTab !== 'behaviour') {
      setIsUpdateCardVisible(false)
      return
    }

    const scrollEl = scrollListRef.current
    const bannerEl = updateBannerRef.current
    if (!scrollEl || !bannerEl) {
      setIsUpdateCardVisible(false)
      return
    }

    const checkVisibility = () => {
      const scrollRect = scrollEl.getBoundingClientRect()
      const bannerRect = bannerEl.getBoundingClientRect()
      const isVisible = bannerRect.top < scrollRect.bottom && bannerRect.bottom > scrollRect.top
      setIsUpdateCardVisible(isVisible)
    }

    checkVisibility()

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        setIsUpdateCardVisible(entry?.isIntersecting ?? false)
      },
      {
        root: scrollEl,
        threshold: 0.05
      }
    )

    observer.observe(bannerEl)
    scrollEl.addEventListener('scroll', checkVisibility, { passive: true })

    return () => {
      observer.disconnect()
      scrollEl.removeEventListener('scroll', checkVisibility)
    }
  }, [activeTab, hasActiveUpdate, hasUpdatePrompt, isDownloading, updateDownloaded, checkState.status])

  const scrollToUpdateCard = () => {
    playButtonClickSound()
    if (activeTab !== 'behaviour') {
      handleTabSwitch('behaviour')
      requestAnimationFrame(() => {
        setTimeout(() => {
          updateBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }, 60)
      })
    } else {
      updateBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  // ── Persistent footer shared across all tabs ───────────────────────────
  const PersistentFooter = (
    <>
      {/* Community & Support */}
      <div className="setting-group-label" style={{ marginTop: 20 }}>{t('footer.communityAndSupport')}</div>

      <div className="setting-row vertical" style={{ gap: 10 }}>
        <div className="setting-info">
          <div className="setting-title">{t('footer.feedbackTitle')}</div>
          <div className="setting-desc">{t('footer.feedbackDesc')}</div>
        </div>
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

      {/* Support & GitHub Promo Footer */}
      <div className="setting-divider" style={{ marginTop: 20 }} />

      <div className="support-promo">
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

  // ── Manual update card renderer shared between vertical and horizontal views ──
  const renderManualUpdateCard = (withRef = false) => {
    if (!hasUpdatePrompt) return null
    return (
      <div className="manual-update-section" ref={withRef ? updateBannerRef : undefined} style={{ width: '100%' }}>
        <div className="manual-update-card">
          {updateDownloaded ? (
            <>
              <div className="manual-update-info">
                <div className="manual-update-title">
                  <span className="manual-update-dot ready" />
                  <span>{t('behaviour.updateReadyTitle', { version: updateDownloaded.version })}</span>
                </div>
                <div className="manual-update-desc">
                  {t('behaviour.updateReadyDesc')}
                </div>
              </div>
              <button
                type="button"
                className="manual-update-pill primary"
                onClick={() => {
                  playButtonClickSound()
                  void window.edge.installUpdate()
                }}
              >
                {t('behaviour.restartToUpdate')}
              </button>
            </>
          ) : isDownloading ? (
            <>
              <div className="manual-update-info">
                <div className="manual-update-title">
                  <span className="manual-update-dot ready" />
                  <span>
                    {updateInfo?.latestVersion
                      ? `Update v${updateInfo.latestVersion} Available`
                      : t('behaviour.updateAvailableTitle', { version: '' })}
                  </span>
                </div>
                <div className="manual-update-desc">
                  {t('behaviour.downloadingUpdate')}
                </div>
              </div>
              <button
                type="button"
                className="manual-update-pill primary"
                disabled
              >
                {downloadPercent > 0
                  ? `Downloading... (${downloadPercent}%)`
                  : 'Downloading update...'}
              </button>
            </>
          ) : checkState.status === 'available' ? (
            <>
              <div className="manual-update-info">
                <div className="manual-update-title">
                  <span className="manual-update-dot ready" />
                  <span>{t('behaviour.updateAvailableTitle', { version: checkState.version || '' })}</span>
                </div>
                <div className="manual-update-desc">
                  {t('behaviour.updateAvailableDesc')}
                </div>
              </div>
              <div className="manual-update-actions">
                <button
                  type="button"
                  className="manual-update-pill primary"
                  onClick={() => {
                    playButtonClickSound()
                    handleStartDownload()
                  }}
                >
                  {t('behaviour.downloadAndUpdate')}
                </button>
                <button
                  type="button"
                  className="manual-update-pill outline"
                  onClick={() => {
                    playButtonClickSound()
                    useStore.getState().dismissUpdate()
                  }}
                >
                  {t('behaviour.skip')}
                </button>
              </div>
            </>
          ) : checkState.status === 'checking' ? (
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
                <span className="manual-update-dot checking" />
                <span>{t('behaviour.checkingForUpdates')}</span>
              </button>
            </>
          ) : checkState.status === 'up-to-date' ? (
            <>
              <div className="manual-update-info">
                <div className="manual-update-title">
                  <span className="manual-update-dot ready" />
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

    const showCard = (category: 'behaviour' | 'position' | 'appearance') => {
      return horizontalTab === 'all' || horizontalTab === category
    }

    return (
      <div className="settings-horizontal-shelf">
        <div
          className="settings-shelf-track"
          ref={shelfTrackRef}
          onWheel={handleShelfWheel}
        >
          {/* ── CARD 0: Update Banner (if applicable) ── */}
          {hasUpdatePrompt && (horizontalTab === 'all' || horizontalTab === 'behaviour') && (
            <div className="settings-shelf-card update-card">
              <div className="shelf-card-header">
                <span className="shelf-card-category" style={{ color: '#ffd60a' }}>UPDATE</span>
                <span className="shelf-card-title">
                  {updateDownloaded
                    ? t('behaviour.updateReadyTitle', { version: updateDownloaded.version })
                    : isDownloading
                    ? 'Downloading Update...'
                    : checkState.status === 'available'
                    ? t('behaviour.updateAvailableTitle', { version: checkState.version || '' })
                    : t('behaviour.checkForUpdates')}
                </span>
              </div>
              <div className="shelf-card-body">
                {updateDownloaded ? (
                  <button
                    type="button"
                    className="pill primary-pill"
                    style={{ width: '100%', justifyContent: 'center', background: '#ffd60a', color: '#000000', fontWeight: 600 }}
                    onClick={() => {
                      playButtonClickSound()
                      void window.edge.installUpdate()
                    }}
                  >
                    {t('behaviour.restartToUpdate')}
                  </button>
                ) : isDownloading ? (
                  <div className="shelf-update-progress-wrap">
                    <div className="shelf-progress-bar" style={{ width: `${downloadPercent}%` }} />
                    <span className="shelf-progress-text">{downloadPercent > 0 ? `${downloadPercent}%` : 'Connecting...'}</span>
                  </div>
                ) : checkState.status === 'available' ? (
                  <button
                    type="button"
                    className="pill primary-pill"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      playButtonClickSound()
                      handleStartDownload()
                    }}
                  >
                    {t('behaviour.downloadAndUpdate')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pill display-pill"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      playButtonClickSound()
                      handleManualCheck()
                    }}
                  >
                    {t('behaviour.checkForUpdates')}
                  </button>
                )}
              </div>
              <div className="shelf-card-footer">
                {updateDownloaded ? t('behaviour.updateReadyDesc') : `Current version: v${currentVersion || '0.3.1'}`}
              </div>
            </div>
          )}

          {/* ── CARD 1: Language & Global Hotkey (BEHAVIOUR) ── */}
          {showCard('behaviour') && (
            <div className="settings-shelf-card">
              <div className="shelf-card-header">
                <span className="shelf-card-category">{t('tabs.behaviour')}</span>
                <span className="shelf-card-title">{t('behaviour.languageTitle')} & Hotkey</span>
              </div>
              <div className="shelf-card-body" style={{ gap: 8 }}>
                <LanguageDropdown />
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
              <div className="shelf-card-footer">
                {t('behaviour.toggleHotkeyDesc')}
              </div>
            </div>
          )}

          {/* ── CARD 2: Edge Activation & Protection (BEHAVIOUR) ── */}
          {showCard('behaviour') && (
            <div className="settings-shelf-card">
              <div className="shelf-card-header">
                <span className="shelf-card-category">{t('tabs.behaviour')}</span>
                <span className="shelf-card-title">{t('behaviour.hoverActivationTitle')}</span>
              </div>
              <div className="shelf-card-body" style={{ gap: 10 }}>
                <div className="shelf-row">
                  <span className="shelf-row-label">{t('behaviour.hoverActivationTitle')}</span>
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
                <div className="shelf-row" style={{ opacity: (settings.hoverActivation ?? true) ? 1 : 0.45 }}>
                  <span className="shelf-row-label">{t('behaviour.fullscreenProtectionTitle')}</span>
                  <Toggle
                    checked={(settings.hoverActivation ?? true) ? settings.suppressInFullscreen : false}
                    onChange={(v) => (settings.hoverActivation ?? true) && patch({ suppressInFullscreen: v })}
                    disabled={!(settings.hoverActivation ?? true)}
                  />
                </div>
              </div>
              <div className="shelf-card-footer">
                {(settings.hoverActivation ?? true) ? t('behaviour.hoverActivationDescOn') : t('behaviour.disabledHoverOff')}
              </div>
            </div>
          )}

          {/* ── CARD 3: System & Incognito (BEHAVIOUR) ── */}
          {showCard('behaviour') && (
            <div className="settings-shelf-card">
              <div className="shelf-card-header">
                <span className="shelf-card-category">{t('tabs.behaviour')}</span>
                <span className="shelf-card-title">{t('behaviour.launchAtLoginTitle')}</span>
              </div>
              <div className="shelf-card-body" style={{ gap: 10 }}>
                <div className="shelf-row">
                  <span className="shelf-row-label">{t('behaviour.launchAtLoginTitle')}</span>
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
                <div className="shelf-row">
                  <span className="shelf-row-label">{t('behaviour.incognitoTitle')}</span>
                  <Toggle
                    checked={settings.incognito}
                    onChange={(v) => patch({ incognito: v })}
                  />
                </div>
              </div>
              <div className="shelf-card-footer">
                {settings.incognito ? t('behaviour.incognitoDesc') : t('behaviour.launchAtLoginDesc')}
              </div>
            </div>
          )}

          {/* ── CARD 4: History Capacity & Auto-Delete (BEHAVIOUR) ── */}
          {showCard('behaviour') && (
            <div className="settings-shelf-card" style={{ minWidth: 260 }}>
              <div className="shelf-card-header">
                <span className="shelf-card-category">{t('tabs.behaviour')}</span>
                <span className="shelf-card-title">{t('behaviour.capacityTitle')} & Retention</span>
              </div>
              <div className="shelf-card-body" style={{ gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {t('behaviour.capacityTitle')}
                  </div>
                  <div className="setting-pills" style={{ gap: 4 }}>
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
                        onClick={() => { playButtonClickSound(); patch({ historyLimit: opt.val }) }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {t('behaviour.autoDeleteTitle')}
                  </div>
                  <div className="setting-pills" style={{ gap: 4 }}>
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
                        onClick={() => { playButtonClickSound(); patch({ autoDeleteHours: opt.val }) }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="shelf-card-footer">
                {t('behaviour.capacityDesc')}
              </div>
            </div>
          )}

          {/* ── CARD 5: Updates & Ordering (BEHAVIOUR) ── */}
          {showCard('behaviour') && (
            <div className="settings-shelf-card">
              <div className="shelf-card-header">
                <span className="shelf-card-category">{t('tabs.behaviour')}</span>
                <span className="shelf-card-title">{t('behaviour.movePastedToTopTitle')}</span>
              </div>
              <div className="shelf-card-body" style={{ gap: 10 }}>
                <div className="shelf-row">
                  <span className="shelf-row-label">{t('behaviour.movePastedToTopTitle')}</span>
                  <Toggle
                    checked={settings.movePastedToTop ?? true}
                    onChange={(v) => patch({ movePastedToTop: v })}
                  />
                </div>
                {!isStoreBuild && (
                  <div className="shelf-row">
                    <span className="shelf-row-label">{t('behaviour.autoUpdatesTitle')}</span>
                    <Toggle
                      checked={settings.autoUpdates ?? true}
                      onChange={(v) => patch({ autoUpdates: v })}
                    />
                  </div>
                )}
              </div>
              <div className="shelf-card-footer">
                <button
                  type="button"
                  className="pill display-pill"
                  style={{ width: '100%', justifyContent: 'center', padding: '4px 8px', fontSize: 11 }}
                  onClick={() => {
                    playButtonClickSound()
                    handleManualCheck()
                  }}
                >
                  {checkState.status === 'checking'
                    ? t('behaviour.checkingForUpdates')
                    : checkState.status === 'up-to-date'
                    ? `${t('behaviour.isUpToDate')} (v${currentVersion || '0.3.1'})`
                    : t('behaviour.checkForUpdates')}
                </button>
              </div>
            </div>
          )}

          {/* ── CARD 6: Edge Placement (POSITION) ── */}
          {showCard('position') && (
            <div className="settings-shelf-card" style={{ minWidth: 260 }}>
              <div className="shelf-card-header">
                <span className="shelf-card-category">{t('tabs.position')}</span>
                <span className="shelf-card-title">{t('position.edgePlacementTitle')}</span>
              </div>
              <div className="shelf-card-body" style={{ gap: 8 }}>
                <div className="setting-pills" style={{ gap: 4 }}>
                  {[
                    { label: t('position.leftEdge'), val: 'left' as const },
                    { label: t('position.rightEdge'), val: 'right' as const },
                    { label: t('position.topEdge') || 'Top Edge', val: 'top' as const },
                    { label: t('position.bottomEdge') || 'Bottom Edge', val: 'bottom' as const }
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      className={`pill ${settings.stickPosition === opt.val ? 'active' : ''}`}
                      onClick={() => {
                        playButtonClickSound()
                        patch({ stickPosition: opt.val })
                        useStore.getState().notifyPositionChanged()
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="shelf-row" style={{ marginTop: 2 }}>
                  <span className="shelf-row-label">{t('position.edgeLocationHintTitle')}</span>
                  <Toggle
                    checked={settings.showEdgeLocationHint ?? false}
                    onChange={(v) => patch({ showEdgeLocationHint: v })}
                  />
                </div>
              </div>
              <div className="shelf-card-footer">
                {t('position.edgePlacementDesc')}
              </div>
            </div>
          )}

          {/* ── CARD 7: Horizontal Position Offset (POSITION) ── */}
          {showCard('position') && (
            <div className="settings-shelf-card" style={{ minWidth: 270 }}>
              <div className="shelf-card-header">
                <span className="shelf-card-category">{t('tabs.position')}</span>
                <span className="shelf-card-title">{t('position.horizontalPositionTitle') || 'Horizontal Position'}</span>
              </div>
              <div className="shelf-card-body" style={{ gap: 8 }}>
                <div className="setting-slider-wrap">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.002"
                    className="setting-range-input"
                    value={settings.horizontalOffset ?? 0.5}
                    style={{
                      background: `linear-gradient(to right, #ffffff 0%, #ffffff ${(settings.horizontalOffset ?? 0.5) * 100}%, rgba(255, 255, 255, 0.12) ${(settings.horizontalOffset ?? 0.5) * 100}%, rgba(255, 255, 255, 0.12) 100%)`
                    }}
                    onChange={(e) => patch({ horizontalOffset: parseFloat(e.target.value) })}
                  />
                  <div className="setting-slider-labels">
                    {[
                      { label: 'Left', val: 0 },
                      { label: 'Center', val: 0.5 },
                      { label: 'Right', val: 1.0 }
                    ].map((pos) => {
                      const active = Math.abs((settings.horizontalOffset ?? 0.5) - pos.val) < 0.04
                      return (
                        <button
                          key={pos.val}
                          type="button"
                          className={`slider-label-btn${active ? ' active' : ''}`}
                          onClick={() => patch({ horizontalOffset: pos.val })}
                        >
                          {pos.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="shelf-card-footer">
                {`Offset: ${Math.round((settings.horizontalOffset ?? 0.5) * 100)}%`}
              </div>
            </div>
          )}

          {/* ── CARD 8: Trigger Zone & Thickness (POSITION) ── */}
          {showCard('position') && (
            <div className="settings-shelf-card" style={{ minWidth: 260 }}>
              <div className="shelf-card-header">
                <span className="shelf-card-category">{t('tabs.position')}</span>
                <span className="shelf-card-title">{t('position.triggerZone')}</span>
              </div>
              <div className="shelf-card-body" style={{ gap: 8 }}>
                <div className="setting-pills" style={{ gap: 4 }}>
                  {[
                    { label: t('position.top'), val: 'top' as const },
                    { label: t('position.center'), val: 'center' as const },
                    { label: t('position.bottom'), val: 'bottom' as const }
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input
                    type="range"
                    min="1"
                    max="7"
                    step="1"
                    className="setting-range-input"
                    value={settings.hotZoneWidth ?? 3}
                    style={{
                      flex: 1,
                      background: `linear-gradient(to right, #ffffff 0%, #ffffff ${(((settings.hotZoneWidth ?? 3) - 1) / 6) * 100}%, rgba(255, 255, 255, 0.12) ${(((settings.hotZoneWidth ?? 3) - 1) / 6) * 100}%, rgba(255, 255, 255, 0.12) 100%)`
                    }}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10)
                      if (val !== settings.hotZoneWidth) {
                        playDialTickSound()
                        patch({ hotZoneWidth: val })
                      }
                    }}
                  />
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#ffffff', minWidth: 28, textAlign: 'right' }}>
                    {`${settings.hotZoneWidth ?? 3}px`}
                  </span>
                </div>
              </div>
              <div className="shelf-card-footer">
                {t('position.edgeTriggerThicknessDesc')}
              </div>
            </div>
          )}

          {/* ── CARD 9: Target Monitor (POSITION) ── */}
          {showCard('position') && (
            <div className="settings-shelf-card" style={{ minWidth: 250 }}>
              <div className="shelf-card-header">
                <span className="shelf-card-category">{t('tabs.position')}</span>
                <span className="shelf-card-title">{t('position.displayTitle')}</span>
              </div>
              <div className="shelf-card-body" style={{ gap: 6 }}>
                <div className="setting-pills" style={{ gap: 4 }}>
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
              </div>
              <div className="shelf-card-footer">
                {t('position.displayDesc')}
              </div>
            </div>
          )}

          {/* ── CARD 10: Copy Indicator Style (APPEARANCE) ── */}
          {showCard('appearance') && (
            <div className="settings-shelf-card" style={{ minWidth: 280 }}>
              <div className="shelf-card-header">
                <span className="shelf-card-category">{t('tabs.appearance')}</span>
                <span className="shelf-card-title">{t('appearance.copyIndicatorTitle')}</span>
              </div>
              <div className="shelf-card-body" style={{ gap: 6 }}>
                <div className="shelf-row">
                  <span className="shelf-row-label">{t('appearance.copyIndicatorTitle')}</span>
                  <Toggle
                    checked={settings.showCopyIndicator ?? true}
                    onChange={(v) => patch({ showCopyIndicator: v })}
                  />
                </div>
                {(settings.showCopyIndicator ?? true) && (
                  <div className="shelf-indicator-grid">
                    {[
                      {
                        id: 'logo' as const,
                        label: t('appearance.logoStyle'),
                        Icon: () => <LiquidOctopusLoader fillColor="#ffffff" glowColor="rgba(255, 255, 255, 0.85)" speed={1.2} active={true} />
                      },
                      {
                        id: 'check' as const,
                        label: t('appearance.tickStyle'),
                        Icon: () => <TickIndicatorIcon fillColor="#ffffff" glowColor="rgba(255, 255, 255, 0.85)" size={20} />
                      },
                      {
                        id: 'copy' as const,
                        label: t('appearance.copyStyle'),
                        Icon: () => <CopyIndicatorIcon fillColor="#ffffff" glowColor="rgba(255, 255, 255, 0.85)" size={20} />
                      },
                      {
                        id: 'sparkle' as const,
                        label: t('appearance.sparkleStyle'),
                        Icon: () => <SparkleIndicatorIcon fillColor="#ffffff" glowColor="rgba(255, 255, 255, 0.85)" size={20} />
                      }
                    ].map((item) => {
                      const active = (settings.copyIndicatorStyle || 'logo') === item.id
                      return (
                        <div
                          key={item.id}
                          className={`shelf-indicator-item${active ? ' active' : ''}`}
                          onClick={() => {
                            playButtonClickSound()
                            patch({ copyIndicatorStyle: item.id })
                          }}
                        >
                          <div className="shelf-indicator-icon"><item.Icon /></div>
                          <span className="shelf-indicator-name">{item.label}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="shelf-card-footer">
                {t('appearance.copyIndicatorDesc')}
              </div>
            </div>
          )}

          {/* ── CARD 11: Typography & Audio (APPEARANCE) ── */}
          {showCard('appearance') && (
            <div className="settings-shelf-card">
              <div className="shelf-card-header">
                <span className="shelf-card-category">{t('tabs.appearance')}</span>
                <span className="shelf-card-title">{t('appearance.textSizeTitle')} & Sound</span>
              </div>
              <div className="shelf-card-body" style={{ gap: 8 }}>
                <div className="setting-pills" style={{ gap: 4 }}>
                  {[
                    { label: t('appearance.small'), val: 0.85 },
                    { label: t('appearance.normal'), val: 1.0 },
                    { label: t('appearance.large'), val: 1.15 }
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
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
                <div className="shelf-row">
                  <span className="shelf-row-label">{t('behaviour.soundEffectsTitle')}</span>
                  <Toggle
                    checked={settings.soundEffects ?? true}
                    onChange={(v) => {
                      if (v) playToggleSound(true)
                      patch({ soundEffects: v })
                    }}
                  />
                </div>
              </div>
              <div className="shelf-card-footer">
                {(settings.soundEffects ?? true) ? 'Sound feedback active' : 'Audio muted'}
              </div>
            </div>
          )}

          {/* ── CARD 12: About & Quit (APPEARANCE) ── */}
          {showCard('appearance') && (
            <div className="settings-shelf-card">
              <div className="shelf-card-header">
                <span className="shelf-card-category">{t('tabs.appearance')}</span>
                <span className="shelf-card-title">About Edge-Drop</span>
              </div>
              <div className="shelf-card-body" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="pill display-pill"
                  style={{ width: '100%', justifyContent: 'center', padding: '5px 10px', fontSize: 11 }}
                  onClick={() => {
                    playButtonClickSound()
                    window.open('https://www.edgedrop.app/supportedgedrop', '_blank')
                  }}
                >
                  ☕ {t('footer.supportDev')}
                </button>
                <button
                  type="button"
                  className="pill display-pill"
                  style={{ width: '100%', justifyContent: 'center', padding: '5px 10px', fontSize: 11 }}
                  onClick={() => {
                    playButtonClickSound()
                    window.open('https://github.com/Deepender25/Edge-Drop/issues/new/choose', '_blank')
                  }}
                >
                  💬 {t('footer.submitFeedback')}
                </button>
              </div>
              <div className="shelf-card-footer">
                <button
                  type="button"
                  className="shelf-quit-btn"
                  onClick={() => {
                    playButtonClickSound()
                    void window.edge.quitApp()
                  }}
                >
                  <span>Quit Edge-Drop (v{currentVersion || '0.3.1'})</span>
                </button>
              </div>
            </div>
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
                  {/* ── GROUP: Behaviour ─────────────────────────────────── */}
                  <div className="setting-group-label">{t('tabs.behaviour')}</div>

                  {/* ── Language Selector ── */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: '2px 0'
                  }}>
                    <div>
                      <div className="setting-title">{t('behaviour.languageTitle')}</div>
                      <div className="setting-desc" style={{ marginTop: 2 }}>{t('behaviour.languageDesc')}</div>
                    </div>
                    <LanguageDropdown />
                  </div>

                  <div className="setting-divider" />

                  <div className="setting-row">
                    <div className="setting-info">
                      <div className="setting-title">{t('behaviour.launchAtLoginTitle')}</div>
                      <div className="setting-desc">{t('behaviour.launchAtLoginDesc')}</div>
                    </div>
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

                  <div className="setting-divider" />

                  <div className="setting-row">
                    <div className="setting-info">
                      <div className="setting-title">{t('behaviour.incognitoTitle')}</div>
                      <div className="setting-desc">{t('behaviour.incognitoDesc')}</div>
                    </div>
                    <Toggle
                      checked={settings.incognito}
                      onChange={(v) => patch({ incognito: v })}
                    />
                  </div>

                  <div className="setting-divider" />

                  <div className="setting-row">
                    <div className="setting-info">
                      <div className="setting-title">{t('behaviour.hoverActivationTitle')}</div>
                      <div className="setting-desc" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '3px 5px', marginTop: 2 }}>
                        {(settings.hoverActivation ?? true) ? (
                          <span>{t('behaviour.hoverActivationDescOn')}</span>
                        ) : (
                          <span>{t('behaviour.hoverActivationDescOff', { shortcut: settings.toggleHotkey || 'Alt+C' })}</span>
                        )}
                      </div>
                    </div>
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

                  <div className="setting-divider" />

                  {/* ── Global Toggle Shortcut (Vertical Layout) ── */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: '2px 0'
                  }}>
                    <div>
                      <div className="setting-title">{t('behaviour.toggleHotkeyTitle')}</div>
                      <div className="setting-desc" style={{ marginTop: 2 }}>{t('behaviour.toggleHotkeyDesc')}</div>
                    </div>
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

                  <div className="setting-divider" />

                  <div className="setting-row" style={{ opacity: (settings.hoverActivation ?? true) ? 1 : 0.45, transition: 'opacity 0.2s ease' }}>
                    <div className="setting-info">
                      <div className="setting-title">{t('behaviour.fullscreenProtectionTitle')}</div>
                      <div className="setting-desc">
                        {(settings.hoverActivation ?? true)
                          ? t('behaviour.fullscreenProtectionDesc')
                          : t('behaviour.disabledHoverOff')}
                      </div>
                    </div>
                    <Toggle
                      checked={(settings.hoverActivation ?? true) ? settings.suppressInFullscreen : false}
                      onChange={(v) => (settings.hoverActivation ?? true) && patch({ suppressInFullscreen: v })}
                      disabled={!(settings.hoverActivation ?? true)}
                    />
                  </div>

                  <div className="setting-divider" />

                  <div className="setting-row">
                    <div className="setting-info">
                      <div className="setting-title">{t('behaviour.clearUnpinnedTitle')}</div>
                      <div className="setting-desc">{t('behaviour.clearUnpinnedDesc')}</div>
                    </div>
                    <Toggle
                      checked={settings.clearUnpinnedOnRestart}
                      onChange={(v) => patch({ clearUnpinnedOnRestart: v })}
                    />
                  </div>

                  <div className="setting-divider" />

                  <div className="setting-row">
                    <div className="setting-info">
                      <div className="setting-title">{t('behaviour.movePastedToTopTitle')}</div>
                      <div className="setting-desc">{t('behaviour.movePastedToTopDesc')}</div>
                    </div>
                    <Toggle
                      checked={settings.movePastedToTop ?? true}
                      onChange={(v) => patch({ movePastedToTop: v })}
                    />
                  </div>

                  {!isStoreBuild && (
                    <>
                      <div className="setting-divider" />

                      <div className="setting-row">
                        <div className="setting-info">
                          <div className="setting-title">{t('behaviour.autoUpdatesTitle')}</div>
                          <div className="setting-desc">
                            {(settings.autoUpdates ?? true)
                              ? t('behaviour.autoUpdatesDescOn')
                              : t('behaviour.autoUpdatesDescOff')}
                          </div>
                        </div>
                        <Toggle
                          checked={settings.autoUpdates ?? true}
                          onChange={(v) => patch({ autoUpdates: v })}
                        />
                      </div>
                    </>
                  )}

                  <div className="setting-divider" />

                  <div className="setting-row vertical">
                    <div className="setting-info">
                      <div className="setting-title">{t('behaviour.autoDeleteTitle')}</div>
                      <div className="setting-desc">{t('behaviour.autoDeleteDesc')}</div>
                    </div>
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

                  <div className="setting-divider" />

                  <div className="setting-row vertical">
                    <div className="setting-info">
                      <div className="setting-title">{t('behaviour.capacityTitle')}</div>
                      <div className="setting-desc">{t('behaviour.capacityDesc')}</div>
                    </div>
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

                  {/* ── Update Control (Shown at bottom above Community) ── */}
                  {hasUpdatePrompt && (
                    <>
                      <div className="setting-divider" style={{ marginTop: 20 }} />
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
                  <div className="setting-group-label">{t('tabs.position')}</div>

                  <div className="setting-row vertical">
                    <div className="setting-info">
                      <div className="setting-title">{t('position.edgePlacementTitle')}</div>
                      <div className="setting-desc">{t('position.edgePlacementDesc')}</div>
                    </div>
                    <div className="setting-pills">
                      {[
                        { label: t('position.leftEdge'), val: 'left' as const },
                        { label: t('position.rightEdge'), val: 'right' as const },
                        { label: t('position.topEdge') || 'Top Edge', val: 'top' as const },
                        { label: t('position.bottomEdge') || 'Bottom Edge', val: 'bottom' as const }
                      ].map((opt) => (
                        <button
                          key={opt.val}
                          className={`pill ${settings.stickPosition === opt.val ? 'active' : ''}`}
                          onClick={() => {
                            playButtonClickSound()
                            patch({ stickPosition: opt.val })
                            useStore.getState().notifyPositionChanged()
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="setting-divider" />

                  {/* Position Range Slider (Vertical for left/right, Horizontal for top/bottom) */}
                  {(() => {
                    const isHorizontal = settings.stickPosition === 'top' || settings.stickPosition === 'bottom'
                    const offsetVal = isHorizontal ? (settings.horizontalOffset ?? 0.5) : (settings.verticalOffset ?? 0.5)
                    const sliderTitle = isHorizontal ? (t('position.horizontalPositionTitle') || 'Horizontal Position') : t('position.verticalPositionTitle')
                    const sliderDesc = isHorizontal ? (t('position.horizontalPositionDesc') || 'Adjust horizontal alignment along screen edge') : t('position.verticalPositionDesc')

                    return (
                      <div className="setting-row vertical" style={{ gap: 10 }}>
                        <div className="setting-slider-header">
                          <div className="setting-info">
                            <div className="setting-title">{sliderTitle}</div>
                            <div className="setting-desc">{sliderDesc}</div>
                          </div>
                          <div className="setting-slider-val">
                            {`${Math.round(offsetVal * 100)}%`}
                          </div>
                        </div>

                        <div className="setting-slider-wrap">
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.002"
                            className="setting-range-input"
                            value={offsetVal}
                            style={{
                              background: `linear-gradient(to right, #ffffff 0%, #ffffff ${offsetVal * 100}%, rgba(255, 255, 255, 0.12) ${offsetVal * 100}%, rgba(255, 255, 255, 0.12) 100%)`
                            }}
                            onPointerDown={() => {
                              void window.edge.setInteractive(true)
                              setSliderActive(true)
                            }}
                            onPointerUp={(e) => {
                              setSliderActive(false)
                              const val = parseFloat((e.target as HTMLInputElement).value)
                              if (isHorizontal) {
                                patch({ horizontalOffset: val })
                              } else {
                                handleSliderRelease(val)
                              }
                            }}
                            onPointerCancel={(e) => {
                              setSliderActive(false)
                              const val = parseFloat((e.target as HTMLInputElement).value)
                              if (isHorizontal) {
                                patch({ horizontalOffset: val })
                              } else {
                                handleSliderRelease(val)
                              }
                            }}
                            onLostPointerCapture={(e) => {
                              setSliderActive(false)
                              const val = parseFloat((e.target as HTMLInputElement).value)
                              if (isHorizontal) {
                                patch({ horizontalOffset: val })
                              } else {
                                handleSliderRelease(val)
                              }
                            }}
                            onChange={(e) => {
                              const raw = parseFloat(e.target.value)
                              if (isHorizontal) {
                                patch({ horizontalOffset: raw })
                              } else {
                                handleSliderInput(raw)
                              }
                            }}
                          />

                          <div className="setting-slider-ticks">
                            {Array.from({ length: 21 }, (_, i) => {
                              const tickVal = i / 20
                              const isMajor = i % 5 === 0
                              const isActive = tickVal <= offsetVal
                              return (
                                <span
                                  key={i}
                                  className={`slider-tick${isMajor ? ' major' : ''}${isActive ? ' active' : ''}`}
                                />
                              )
                            })}
                          </div>

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
                    )
                  })()}

                  <div className="setting-divider" />

                  <div className="setting-row vertical">
                    <div className="setting-info">
                      <div className="setting-title">{t('position.displayTitle')}</div>
                      <div className="setting-desc">{t('position.displayDesc')}</div>
                    </div>
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

                  {/* ── GROUP: Trigger Zone ──────────────────────────────── */}
                  <div className="setting-group-label" style={{ marginTop: 20 }}>{t('position.triggerZone')}</div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <div className="setting-title">{t('position.edgeLocationHintTitle')}</div>
                      <div className="setting-desc">{t('position.edgeLocationHintDesc')}</div>
                    </div>
                    <Toggle
                      checked={settings.showEdgeLocationHint ?? false}
                      onChange={(v) => patch({ showEdgeLocationHint: v })}
                    />
                  </div>

                  <div className="setting-divider" />

                  <div className="setting-row vertical">
                    <div className="setting-info">
                      <div className="setting-title">{t('position.edgeTriggerPositionTitle')}</div>
                      <div className="setting-desc">{t('position.edgeTriggerPositionDesc')}</div>
                    </div>
                    <div className="setting-pills">
                      {[
                        { label: t('position.top'), val: 'top' as const },
                        { label: t('position.center'), val: 'center' as const },
                        { label: t('position.bottom'), val: 'bottom' as const }
                      ].map((opt) => (
                        <button
                          key={opt.label}
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

                  <div className="setting-divider" />

                  <div className="setting-row vertical">
                    <div className="setting-info">
                      <div className="setting-title">{t('position.hoverAreaSizeTitle')}</div>
                      <div className="setting-desc">{t('position.hoverAreaSizeDesc')}</div>
                    </div>
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

                  <div className="setting-divider" />

                  {/* Edge Trigger Thickness Range Slider */}
                  <div className="setting-row vertical" style={{ gap: 10 }}>
                    <div className="setting-slider-header">
                      <div className="setting-info">
                        <div className="setting-title">{t('position.edgeTriggerThicknessTitle')}</div>
                        <div className="setting-desc">{t('position.edgeTriggerThicknessDesc')}</div>
                      </div>
                      <div className="setting-slider-val">
                        {`${settings.hotZoneWidth ?? 3}px`}
                      </div>
                    </div>

                    <div className="setting-slider-wrap">
                      {(() => {
                        const currentPx = settings.hotZoneWidth ?? 3
                        const pct = Math.max(0, Math.min(100, ((currentPx - 1) / (7 - 1)) * 100))
                        return (
                          <input
                            type="range"
                            min="1"
                            max="7"
                            step="1"
                            className="setting-range-input"
                            value={currentPx}
                            style={{
                              background: `linear-gradient(to right, #ffffff 0%, #ffffff ${pct}%, rgba(255, 255, 255, 0.12) ${pct}%, rgba(255, 255, 255, 0.12) 100%)`
                            }}
                            onPointerDown={() => {
                              void window.edge.setInteractive(true)
                            }}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10)
                              if (val !== settings.hotZoneWidth) {
                                playDialTickSound()
                                patch({ hotZoneWidth: val })
                              }
                            }}
                          />
                        )
                      })()}

                      <div className="setting-slider-ticks">
                        {Array.from({ length: 7 }, (_, i) => {
                          const tickPx = i + 1
                          const currentPx = settings.hotZoneWidth ?? 3
                          const isMajor = tickPx === 1 || tickPx === 4 || tickPx === 7
                          const isActive = currentPx === tickPx
                          return (
                            <span
                              key={tickPx}
                              className={`slider-tick${isMajor ? ' major' : ''}${isActive ? ' active' : ''}`}
                            />
                          )
                        })}
                      </div>

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
                                  playDialTickSound()
                                  patch({ hotZoneWidth: preset.val })
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

                  <div className="setting-divider" />

                  <div className="setting-row vertical">
                    <div className="setting-info">
                      <div className="setting-title">{t('position.panelHeightTitle')}</div>
                      <div className="setting-desc">{t('position.panelHeightDesc')}</div>
                    </div>
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
                  <div className="setting-group-label">{t('appearance.copyIndicatorTitle')}</div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <div className="setting-title">{t('appearance.copyIndicatorTitle')}</div>
                      <div className="setting-desc">{t('appearance.copyIndicatorDesc')}</div>
                    </div>
                    <Toggle
                      checked={settings.showCopyIndicator ?? true}
                      onChange={(v) => patch({ showCopyIndicator: v })}
                    />
                  </div>

                  {(settings.showCopyIndicator ?? true) && (
                    <>
                      <div className="setting-divider" />

                      <div className="setting-row">
                        <div className="setting-info">
                          <div className="setting-title">{t('appearance.indicatorStyleTitle')}</div>
                          <div className="setting-desc">
                            {t('appearance.indicatorStyleDesc')}
                          </div>
                        </div>
                        
                        <button
                          type="button"
                          className={`icon-btn style-preview-toggle-btn ${isFlyoutActive ? 'active' : ''}`}
                          title={isFlyoutActive ? 'Close Style Selector' : 'Open Indicator Style Selector'}
                          onClick={() => {
                            playButtonClickSound()
                            handleToggleFlyout()
                          }}
                        >
                          {isFlyoutActive ? <CloseIcon /> : <ChevronRightIcon />}
                        </button>
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
                                <LiquidOctopusLoader fillColor="#ffffff" glowColor="rgba(255, 255, 255, 0.85)" speed={1.2} active={true} />
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
                                <TickIndicatorIcon fillColor="#ffffff" glowColor="rgba(255, 255, 255, 0.85)" size={30} />
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
                                <CopyIndicatorIcon fillColor="#ffffff" glowColor="rgba(255, 255, 255, 0.85)" size={30} />
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
                                <SparkleIndicatorIcon fillColor="#ffffff" glowColor="rgba(255, 255, 255, 0.85)" size={30} />
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>{t('appearance.sparkleStyle')}</div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </>
                  )}

                  {/* ── GROUP: Typography ────────────────────────────────── */}
                  <div className="setting-group-label" style={{ marginTop: 20 }}>{t('appearance.typography')}</div>

                  <div className="setting-row vertical">
                    <div className="setting-info">
                      <div className="setting-title">{t('appearance.textSizeTitle')}</div>
                      <div className="setting-desc">{t('appearance.textSizeDesc')}</div>
                    </div>
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

                  <div className="setting-divider" />

                  {/* ── GROUP: Audio & Feedback ──────────────────────────── */}
                  <div className="setting-group-label" style={{ marginTop: 20 }}>{t('appearance.audioAndFeedback')}</div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <div className="setting-title">{t('behaviour.soundEffectsTitle')}</div>
                      <div className="setting-desc">{t('behaviour.soundEffectsDesc')}</div>
                    </div>
                    <Toggle
                      checked={settings.soundEffects ?? true}
                      onChange={(v) => {
                        if (v) playToggleSound(true)
                        patch({ soundEffects: v })
                      }}
                    />
                  </div>

                  {PersistentFooter}
                </motion.div>
              )}
            </AnimatePresence>

          </div>

          {/* ── Floating Scroll Indicator Badge for Off-Screen Update Banner ── */}
          <AnimatePresence>
            {showScrollUpdateBadge && (
              <motion.div
                key="scroll-update-badge"
                initial={{ opacity: 0, y: 14, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 14, scale: 0.92 }}
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                onClick={scrollToUpdateCard}
                className="floating-update-pill"
              >
                <span className="floating-update-dot" />
                <span className="floating-update-text">
                  {updateDownloaded
                    ? t('behaviour.restartToUpdateBelow')
                    : isDownloading
                    ? (downloadPercent > 0 ? t('behaviour.downloadingWithPercent', { percent: downloadPercent }) : t('behaviour.downloadingUpdate'))
                    : t('behaviour.newUpdateAvailableBelow')}
                </span>
                <span className="floating-update-arrow">↓</span>
              </motion.div>
            )}
          </AnimatePresence>
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

function LanguageDropdown() {
  const { language, languages } = useTranslation()
  const patch = useStore((s) => s.patchSettings)
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const lastScrollTick = useRef<number>(0)

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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: isOpen ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.05)',
          color: '#ffffff',
          border: isOpen ? '1px solid rgba(255, 255, 255, 0.22)' : '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 10,
          padding: '8px 12px',
          fontSize: 12.5,
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
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onScroll={(e) => {
              const tick = Math.floor(e.currentTarget.scrollTop / 28)
              if (tick !== lastScrollTick.current) {
                lastScrollTick.current = tick
                playDialTickSound()
              }
            }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              maxHeight: 200,
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
                    padding: '7px 10px',
                    borderRadius: 7,
                    background: active ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                    color: active ? '#ffffff' : 'rgba(255, 255, 255, 0.8)',
                    fontSize: 12,
                    fontWeight: active ? 600 : 400,
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.12s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)'
                    playDialTickSound()
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
