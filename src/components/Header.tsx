/** Panel header: title + settings toggle. */
import { motion } from 'framer-motion'
import { useStore } from '../store/appStore'
import { GearIcon, CloseIcon, InfoIcon, ClockIcon, TypeIcon, LinkIcon, ImageIcon, FilesIcon, EmojiSmileIcon } from './icons'
import { playButtonClickSound } from '../lib/soundEffects'

import { useTranslation } from '../i18n'

export function Header() {
  const { t } = useTranslation()
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const updateInfo = useStore((s) => s.updateInfo)
  const settingsSubView = useStore((s) => s.settingsSubView)
  const setSettingsSubView = useStore((s) => s.setSettingsSubView)
  const settings = useStore((s) => s.settings)
  const patchSettings = useStore((s) => s.patchSettings)
  const currentVersion = useStore((s) => s.currentVersion)

  const isChangelogUnread = settingsOpen && (
    !settings.lastSeenChangelogVersion ||
    (currentVersion && settings.lastSeenChangelogVersion !== currentVersion && settings.lastSeenChangelogVersion !== `v${currentVersion}`)
  )

  const handleOpenChangelog = () => {
    if (settingsSubView === 'changelog') {
      setSettingsSubView('main')
    } else {
      setSettingsSubView('changelog')
      if (currentVersion) {
        patchSettings({ lastSeenChangelogVersion: currentVersion })
      }
    }
  }

  const typeFilter = useStore((s) => s.typeFilter)
  const setTypeFilter = useStore((s) => s.setTypeFilter)
  const emojiOpen = useStore((s) => s.emojiOpen)
  const setEmojiOpen = useStore((s) => s.setEmojiOpen)

  const FILTERS: {
    id: import('../../shared/types').TypeFilter | 'emoji'
    label: string
    Icon: typeof ClockIcon
  }[] = [
    { id: 'all', label: t('filters.all'), Icon: ClockIcon },
    { id: 'text', label: t('filters.text'), Icon: TypeIcon },
    { id: 'links', label: t('filters.links'), Icon: LinkIcon },
    { id: 'images', label: t('filters.images'), Icon: ImageIcon },
    { id: 'files', label: t('filters.files'), Icon: FilesIcon },
    { id: 'emoji', label: t('emoji.open'), Icon: EmojiSmileIcon }
  ]

  const activeId: (typeof FILTERS)[number]['id'] = emojiOpen ? 'emoji' : typeFilter
  const activeIndex = Math.max(0, FILTERS.findIndex((f) => f.id === activeId))
  const ActiveIcon = FILTERS[activeIndex]?.Icon || FILTERS[0].Icon
  const filterChipWidth = 28

  return (
    <div className="header" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', height: 40, padding: '0 14px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 0, minWidth: 0, flex: 1, overflow: 'hidden' }}>
        {settingsOpen ? (
          <span style={{ fontSize: 13, fontWeight: 600, color: '#8e8e93', letterSpacing: '0.01em', paddingLeft: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170 }}>
            {settingsSubView === 'changelog' ? t('header.whatsNew') : t('header.settings')}
          </span>
        ) : (
          <div 
            className="filter-segmented-track" 
            style={{ 
              position: 'relative',
              display: 'flex', 
              alignItems: 'center', 
              background: 'transparent', 
              border: 'none', 
              borderRadius: 999, 
              padding: 0, 
              gap: 4, 
              marginLeft: 0,
              maxWidth: '100%',
              overflow: 'visible'
            }}
          >
            {/* Single Persistent Sliding Pill Indicator (ABOVE the buttons) */}
            <motion.div
              initial={false}
              animate={{ x: activeIndex * (filterChipWidth + 4) }}
              transition={{
                type: 'spring',
                stiffness: 440,
                damping: 34,
                mass: 0.7
              }}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: filterChipWidth,
                height: 28,
                borderRadius: 999,
                background: '#ffffff',
                border: 'none',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
                pointerEvents: 'none',
                zIndex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#000000',
                willChange: 'transform'
              }}
            >
              <ActiveIcon width={14} height={14} />
            </motion.div>

            {FILTERS.map((f) => {
              const active = activeId === f.id
              const Icon = f.Icon
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`filter-chip${active ? ' active' : ''}`}
                  title={f.label}
                  aria-label={f.label}
                  aria-pressed={active}
                  onClick={() => {
                    playButtonClickSound()
                    if (f.id === 'emoji') setEmojiOpen(true)
                    else setTypeFilter(f.id)
                  }}
                  style={{
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: filterChipWidth,
                    height: 28,
                    padding: 0,
                    color: 'rgba(255, 255, 255, 0.75)',
                    background: '#141414',
                    border: 'none',
                    borderRadius: 999,
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'color 0.18s ease, background-color 0.15s ease',
                    zIndex: 1,
                    flexShrink: 0
                  }}
                >
                  <Icon width={14} height={14} />
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, paddingRight: 2 }}>
        {settingsOpen && (
          <button
            type="button"
            className={`icon-btn${settingsSubView === 'changelog' ? ' active' : ''}`}
            title={settingsSubView === 'changelog' ? t('tabs.behaviour') : t('header.whatsNew')}
            onClick={() => {
              playButtonClickSound()
              handleOpenChangelog()
            }}
            style={{
              color: settingsSubView === 'changelog' ? '#ffffff' : 'rgba(255, 255, 255, 0.75)',
              background: settingsSubView === 'changelog' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
              border: 'none',
              boxShadow: 'none',
              flexShrink: 0,
              cursor: 'pointer',
              width: 32,
              height: 32,
              display: 'grid',
              placeItems: 'center',
              position: 'relative',
              borderRadius: 8,
              transition: 'all 0.15s ease'
            }}
          >
            <InfoIcon width={16} height={16} />
            {isChangelogUnread && (
              <span
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 0 6px rgba(255, 255, 255, 0.6)',
                  border: '1.5px solid #000000',
                  pointerEvents: 'none'
                }}
              />
            )}
          </button>
        )}

        <button
          type="button"
          className={`icon-btn${settingsOpen ? ' active' : ''}`}
          title={settingsOpen ? t('header.close') : t('header.settings')}
          onClick={() => {
            playButtonClickSound()
            if (settingsOpen) {
              setSettingsOpen(false)
              setSettingsSubView('main')
              return
            }
            const state = useStore.getState()
            const hasActiveFlyout = !!(state.previewItemId || state.styleFlyoutOpen)
            if (hasActiveFlyout) {
              state.setPreviewItemId(null)
              state.setStyleFlyoutOpen(false)
              setTimeout(() => {
                useStore.getState().setSettingsOpen(true)
              }, 220)
            } else {
              setSettingsOpen(true)
            }
          }}
          style={{
            color: '#ffffff',
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            flexShrink: 0,
            cursor: 'pointer',
            width: 32,
            height: 32,
            display: 'grid',
            placeItems: 'center',
            position: 'relative'
          }}
        >
          {settingsOpen ? <CloseIcon /> : <GearIcon />}
          {!settingsOpen && (updateInfo?.downloaded || ((settings.autoUpdates ?? true) && updateInfo?.hasUpdate)) && (
            <span
              style={{
                position: 'absolute',
                top: 5,
                right: 5,
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#4caf50',
                border: '1.5px solid #000000',
                pointerEvents: 'none'
              }}
            />
          )}
        </button>
      </div>
    </div>
  )
}
