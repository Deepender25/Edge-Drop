import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/appStore'
import type { DisplayInfo } from '../../shared/types'
import { LiquidOctopusLoader } from './LiquidOctopusLoader'
import { TickIndicatorIcon, CopyIndicatorIcon, SparkleIndicatorIcon } from './CopyIndicatorCurve'
import { ChevronRightIcon, CloseIcon, LogOutIcon, StarIcon, GithubOctocatLogo } from './icons'
import { ChangelogView } from './ChangelogView'
import { HotkeyRecorder } from './HotkeyRecorder'
import { playDialTickSound, playToggleSound, playButtonClickSound } from '../lib/soundEffects'
import { useTranslation } from '../i18n'
import '../styles/settings.css'

type SettingsTab = 'behaviour' | 'position' | 'appearance'

export function Settings({ inlineIndicatorStyle }: { inlineIndicatorStyle?: boolean }) {
  const { t } = useTranslation()
  const settings = useStore((s) => s.settings)

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
  const settingsSubView = useStore((s) => s.settingsSubView)
  const setSliderActive = useStore((s) => s.setSliderActive)

  const lastTickVal = useRef<number>(settings.verticalOffset ?? 0.5)

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
    window.edge.getDisplays().then(setDisplays).catch(() => {})
  }, [])

  const updateDownloaded = updateInfo?.downloaded ? { version: updateInfo.latestVersion } : null
  const autoUpdates = settings.autoUpdates ?? true

  const checkState = useStore((s) => s.manualCheckState)
  const handleManualCheck = () => useStore.getState().startManualCheck()
  const handleStartDownload = () => useStore.getState().startManualDownload()

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

  // ── Off-screen Update Banner Visibility Tracking ─────────────────────────────
  const updateBannerRef = useRef<HTMLDivElement | null>(null)
  const [isUpdateBannerVisible, setIsUpdateBannerVisible] = useState(true)

  const hasUpdatePrompt = !isStoreBuild && !!(updateDownloaded || ((settings.autoUpdates ?? true) && updateInfo?.hasUpdate) || checkState.status === 'available')
  const showScrollUpdateBadge = hasUpdatePrompt && activeTab === 'behaviour' && !isUpdateBannerVisible

  useEffect(() => {
    if (isStoreBuild || activeTab !== 'behaviour' || !hasUpdatePrompt) {
      setIsUpdateBannerVisible(true)
      return
    }

    const container = scrollListRef.current
    if (!container) return

    const checkVisibility = () => {
      const el = updateBannerRef.current
      if (!el) {
        setIsUpdateBannerVisible(true)
        return
      }
      const elRect = el.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      // Element is visible if its top and bottom are inside container's view
      const visible = elRect.top >= containerRect.top - 10 && elRect.bottom <= containerRect.bottom + 20
      setIsUpdateBannerVisible(visible)
    }

    checkVisibility()
    // Small delay to allow DOM render on tab switch
    const timer = setTimeout(checkVisibility, 60)

    container.addEventListener('scroll', checkVisibility, { passive: true })
    return () => {
      clearTimeout(timer)
      container.removeEventListener('scroll', checkVisibility)
    }
  }, [isStoreBuild, activeTab, hasUpdatePrompt, updateDownloaded, updateInfo, checkState.status])

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
            <div className="support-btn-heart-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#ff5252" stroke="none">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </div>
            <span>{t('footer.supportOnKofi')}</span>
          </button>

          {/* Secondary Action: GitHub Star */}
          <button
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
        </div>
        <div className="app-version-footer">
          {t('footer.version')} {currentVersion || '0.2.7'}
        </div>
      </div>

      {/* Subtle Bottom Quit Button */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14, marginBottom: 6 }}>
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

  const maxTabLen = Math.max(...TABS.map((tab) => tab.label.length))
  const tabFontSize = maxTabLen > 15 ? '9px' : maxTabLen > 13 ? '9.5px' : maxTabLen > 11 ? '10px' : maxTabLen > 9 ? '10.8px' : '11.5px'
  const tabLetterSpacing = maxTabLen > 13 ? '-0.03em' : maxTabLen > 10 ? '-0.015em' : '0'

  return (
    <AnimatePresence mode="wait">
      {settingsSubView === 'changelog' ? (
        <motion.div
          key="changelog-view"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ type: 'spring', stiffness: 400, damping: 36, mass: 0.6 }}
          style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}
        >
          <ChangelogView />
        </motion.div>
      ) : (
        <motion.div
          key="main-settings"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
          transition={{ type: 'spring', stiffness: 400, damping: 36, mass: 0.6 }}
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
                      onChange={(v) => patch({ launchAtLogin: v })}
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

                      {/* ── UPDATE CONTROL / MANUAL CHECK BANNER ── */}
                      <div ref={updateBannerRef}>
                        {updateDownloaded ? (
                          <div style={{
                            marginTop: 12,
                            background: 'rgba(76, 175, 80, 0.08)',
                            border: '1px solid rgba(76, 175, 80, 0.3)',
                            borderRadius: 12,
                            padding: '14px 16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
                          }}>
                            <div>
                              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#ffffff', letterSpacing: '-0.01em' }}>
                                {t('behaviour.updateReadyTitle', { version: updateDownloaded.version })}
                              </div>
                              <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)', marginTop: 3, lineHeight: 1.45 }}>
                                {t('behaviour.updateReadyDesc')}
                              </div>
                            </div>
                            <button
                              onClick={() => window.edge.installUpdate()}
                              style={{
                                width: '100%',
                                background: '#ffffff',
                                color: '#000000',
                                border: 'none',
                                borderRadius: 9,
                                padding: '8px 16px',
                                fontSize: 12.5,
                                fontWeight: 600,
                                cursor: 'pointer',
                                textAlign: 'center',
                                boxShadow: '0 2px 8px rgba(255, 255, 255, 0.15)',
                                transition: 'opacity 0.15s ease'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.92' }}
                              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                            >
                              {t('behaviour.restartToUpdate')}
                            </button>
                          </div>
                        ) : !autoUpdates ? (
                          <div style={{
                            marginTop: 12,
                            background: 'rgba(255, 255, 255, 0.035)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: 12,
                            padding: '14px 16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)'
                          }}>
                            {checkState.status === 'idle' && (
                              <button
                                onClick={handleManualCheck}
                                style={{
                                  width: '100%',
                                  background: 'rgba(255, 255, 255, 0.07)',
                                  color: '#ffffff',
                                  border: '1px solid rgba(255, 255, 255, 0.14)',
                                  borderRadius: 10,
                                  padding: '9px 16px',
                                  fontSize: 12.5,
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                  textAlign: 'center',
                                  transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'
                                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)'
                                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.14)'
                                }}
                              >
                                {t('behaviour.checkForUpdates')}
                              </button>
                            )}

                            {checkState.status === 'checking' && (
                              <div style={{ fontSize: 12.5, color: 'rgba(255, 255, 255, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '6px 0' }}>
                                <motion.span
                                  animate={{ rotate: 360 }}
                                  transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                                  style={{
                                    display: 'inline-block',
                                    width: 13,
                                    height: 13,
                                    border: '2px solid rgba(255, 255, 255, 0.25)',
                                    borderTopColor: '#ffffff',
                                    borderRadius: '50%'
                                  }}
                                />
                                {t('behaviour.checkingForUpdates')}
                              </div>
                            )}

                            {checkState.status === 'up-to-date' && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                <div style={{ fontSize: 12.5, color: '#4caf50', fontWeight: 500 }}>
                                  {t('behaviour.isUpToDate')} (v{currentVersion || '0.2.1'})
                                </div>
                                <button
                                  onClick={handleManualCheck}
                                  style={{
                                    background: 'transparent',
                                    color: 'rgba(255, 255, 255, 0.65)',
                                    border: 'none',
                                    fontSize: 11.5,
                                    cursor: 'pointer',
                                    textDecoration: 'underline'
                                  }}
                                >
                                  {t('behaviour.checkAgain')}
                                </button>
                              </div>
                            )}

                            {checkState.status === 'available' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div>
                                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#ffffff', letterSpacing: '-0.01em' }}>
                                    {t('behaviour.updateAvailableTitle', { version: checkState.version || '' })}
                                  </div>
                                  <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.65)', marginTop: 3, lineHeight: 1.45 }}>
                                    {t('behaviour.updateAvailableDesc')}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                                  <button
                                    onClick={handleStartDownload}
                                    style={{
                                      background: '#ffffff',
                                      color: '#000000',
                                      border: 'none',
                                      borderRadius: 9,
                                      padding: '7px 16px',
                                      fontSize: 12,
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      boxShadow: '0 2px 8px rgba(255, 255, 255, 0.15)',
                                      transition: 'transform 0.15s ease, opacity 0.15s ease'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.92' }}
                                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                                  >
                                    {t('behaviour.downloadAndUpdate')}
                                  </button>
                                  <button
                                    onClick={() => useStore.getState().dismissUpdate()}
                                    style={{
                                      background: 'rgba(255, 255, 255, 0.08)',
                                      color: 'rgba(255, 255, 255, 0.8)',
                                      border: '1px solid rgba(255, 255, 255, 0.14)',
                                      borderRadius: 9,
                                      padding: '7px 14px',
                                      fontSize: 12,
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                      transition: 'background 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.14)' }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)' }}
                                  >
                                    {t('behaviour.skip')}
                                  </button>
                                </div>
                              </div>
                            )}

                            {checkState.status === 'downloading' && (
                              <div style={{ fontSize: 12.5, color: 'rgba(255, 255, 255, 0.9)', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                                <motion.span
                                  animate={{ rotate: 360 }}
                                  transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                                  style={{
                                    display: 'inline-block',
                                    width: 13,
                                    height: 13,
                                    border: '2px solid rgba(255, 255, 255, 0.25)',
                                    borderTopColor: '#ffffff',
                                    borderRadius: '50%'
                                  }}
                                />
                                {t('behaviour.downloadingUpdate')}
                              </div>
                            )}

                            {checkState.status === 'error' && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                <div style={{ fontSize: 12, color: '#f44336' }}>
                                  ⚠️ {checkState.error || t('behaviour.updateCheckFailed')}
                                </div>
                                <button
                                  onClick={handleManualCheck}
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.12)',
                                    color: '#ffffff',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: 7,
                                    padding: '4px 10px',
                                    fontSize: 11.5,
                                    cursor: 'pointer'
                                  }}
                                >
                                  {t('behaviour.tryAgain')}
                                </button>
                              </div>
                            )}
                          </div>
                        ) : null}
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
                        { label: t('position.rightEdge'), val: 'right' as const }
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

                  {/* Vertical Position Range Slider */}
                  <div className="setting-row vertical" style={{ gap: 10 }}>
                    <div className="setting-slider-header">
                      <div className="setting-info">
                        <div className="setting-title">{t('position.verticalPositionTitle')}</div>
                        <div className="setting-desc">{t('position.verticalPositionDesc')}</div>
                      </div>
                      <div className="setting-slider-val">
                        {`${Math.round((settings.verticalOffset ?? 0.5) * 100)}%`}
                      </div>
                    </div>

                    <div className="setting-slider-wrap">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.002"
                        className="setting-range-input"
                        value={settings.verticalOffset ?? 0.5}
                        style={{
                          background: `linear-gradient(to right, #ffffff 0%, #ffffff ${(settings.verticalOffset ?? 0.5) * 100}%, rgba(255, 255, 255, 0.12) ${(settings.verticalOffset ?? 0.5) * 100}%, rgba(255, 255, 255, 0.12) 100%)`
                        }}
                        onPointerDown={() => {
                          void window.edge.setInteractive(true)
                          setSliderActive(true)
                        }}
                        onPointerUp={(e) => {
                          setSliderActive(false)
                          const val = parseFloat((e.target as HTMLInputElement).value)
                          handleSliderRelease(val)
                        }}
                        onPointerCancel={(e) => {
                          setSliderActive(false)
                          const val = parseFloat((e.target as HTMLInputElement).value)
                          handleSliderRelease(val)
                        }}
                        onLostPointerCapture={(e) => {
                          setSliderActive(false)
                          const val = parseFloat((e.target as HTMLInputElement).value)
                          handleSliderRelease(val)
                        }}
                        onChange={(e) => {
                          const raw = parseFloat(e.target.value)
                          handleSliderInput(raw)
                        }}
                      />

                      <div className="setting-slider-ticks">
                        {Array.from({ length: 21 }, (_, i) => {
                          const tickVal = i * 0.05
                          const currentVal = settings.verticalOffset ?? 0.5
                          const isMajor = i === 0 || i === 10 || i === 20
                          const isActive = Math.abs(currentVal - tickVal) < 0.025
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
                          { label: '0%', val: 0 },
                          { label: '50%', val: 0.5 },
                          { label: '100%', val: 1.0 }
                        ].map((pos) => {
                          const currentVal = settings.verticalOffset ?? 0.5
                          const active = Math.abs(currentVal - pos.val) < 0.04
                          return (
                            <button
                              key={pos.val}
                              type="button"
                              className={`slider-label-btn${active ? ' active' : ''}`}
                              onClick={() => handleSliderRelease(pos.val)}
                            >
                              {pos.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="setting-divider" />

                  <div className="setting-row vertical">
                    <div className="setting-info">
                      <div className="setting-title">{t('position.displayTitle')}</div>
                      <div className="setting-desc">{t('position.displayDesc')}</div>
                    </div>
                    <div className="setting-pills">
                      {displays.length === 0 && <div className="pill disabled">Loading...</div>}
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
                                <LiquidOctopusLoader fillColor="#ffffff" glowColor="rgba(255, 255, 255, 0.85)" speed={1.2} />
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
                initial={{ opacity: 0, y: 12, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                onClick={() => {
                  playButtonClickSound()
                  updateBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                }}
                style={{
                  position: 'absolute',
                  bottom: 14,
                  left: 12,
                  right: 12,
                  margin: '0 auto',
                  width: 'fit-content',
                  maxWidth: 'calc(100% - 24px)',
                  background: '#388e3c',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  borderRadius: 20,
                  padding: '6px 14px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
                  zIndex: 30,
                  whiteSpace: 'nowrap'
                }}
              >
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#ffffff' }} />
                <span>{updateDownloaded ? t('behaviour.restartToUpdateBelow') : t('behaviour.newUpdateAvailableBelow')}</span>
                <span style={{ fontSize: 11, marginLeft: 2 }}>↓</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
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
  return (
    <button
      type="button"
      className={`setting-toggle${checked ? ' checked' : ''}`}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        playToggleSound(!checked)
        onChange(!checked)
      }}
      style={{
        flexShrink: 0,
        width: 38,
        height: 22,
        borderRadius: 999,
        background: disabled ? 'rgba(255, 255, 255, 0.05)' : checked ? '#ffffff' : 'rgba(255, 255, 255, 0.12)',
        border: disabled ? '1px solid rgba(255, 255, 255, 0.08)' : checked ? '1px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.18)',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 0,
        outline: 'none',
        transition: 'background 0.22s ease, border-color 0.22s ease',
        boxShadow: !disabled && checked ? '0 0 12px rgba(255, 255, 255, 0.25)' : 'none',
        opacity: disabled ? 0.45 : 1
      }}
    >
      <motion.span
        className="toggle-thumb"
        initial={false}
        animate={{
          x: checked ? 18 : 2,
          backgroundColor: checked ? '#000000' : '#ffffff'
        }}
        transition={{
          type: 'spring',
          stiffness: 600,
          damping: 35
        }}
        style={{
          position: 'absolute',
          top: 2,
          left: 0,
          width: 16,
          height: 16,
          borderRadius: '50%',
          boxShadow: '0 1.5px 4px rgba(0, 0, 0, 0.4)'
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
