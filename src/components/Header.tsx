/** Panel header: title + settings toggle. */
import { motion } from 'framer-motion'
import { useStore } from '../store/appStore'
import { GearIcon, CloseIcon, InfoIcon, ClockIcon, TypeIcon, LinkIcon, ImageIcon, FilesIcon, EmojiSmileIcon } from './icons'
import { playButtonClickSound } from '../lib/soundEffects'
import { loadEmojiCatalog } from '../lib/emoji/load'

import { useTranslation } from '../i18n'

export function Header() {
  const { t } = useTranslation()
  const isMac = window.edge?.platform === 'darwin'
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const updateInfo = useStore((s) => s.updateInfo)
  const settings = useStore((s) => s.settings)
  const patchSettings = useStore((s) => s.patchSettings)
  const currentVersion = useStore((s) => s.currentVersion)

  const isChangelogUnread = settingsOpen && (
    !settings.lastSeenChangelogVersion ||
    (currentVersion && settings.lastSeenChangelogVersion !== currentVersion && settings.lastSeenChangelogVersion !== `v${currentVersion}`)
  )

  const handleOpenChangelog = () => {
    if (currentVersion) {
      patchSettings({ lastSeenChangelogVersion: currentVersion })
    }
    window.open('https://www.edgedrop.app/changelog', '_blank')
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
  const filterChipWidth = isMac ? 26 : 28
  const filterGap = isMac ? 3 : 4
  const filterIconSize = isMac ? 13 : 14
  const headerButtonSize = isMac ? 28 : 32
  const reduceMotion = !!settings.reduceMotion
  const headerFade = `opacity ${reduceMotion ? '0.01s' : '0.16s'} ease`

  return (
    <div className="header" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', height: 40, padding: '0 14px', boxSizing: 'border-box' }}>
      <div
        style={{
          display: 'grid',
          gridTemplate: '1fr / 1fr',
          alignItems: 'center',
          minWidth: 0,
          flex: 1,
          height: 28,
          overflow: 'hidden'
        }}
      >
        <div
          className="filter-segmented-track"
          aria-hidden={settingsOpen}
          style={{
            gridArea: '1 / 1 / 2 / 2',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            background: 'transparent',
            border: 'none',
            borderRadius: 999,
            padding: 0,
            gap: filterGap,
            marginLeft: 0,
            maxWidth: '100%',
            overflow: 'visible',
            opacity: settingsOpen ? 0 : 1,
            pointerEvents: settingsOpen ? 'none' : 'auto',
            transition: headerFade
          }}
        >
            {/* Single Persistent Sliding Pill Indicator (ABOVE the buttons) */}
            <motion.div
              initial={false}
              animate={{ x: activeIndex * (filterChipWidth + filterGap) }}
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
                height: filterChipWidth,
                borderRadius: 999,
                background: 'linear-gradient(180deg, #ffffff 0%, #ebebeb 100%)',
                border: 'none',
                boxShadow: isMac ? '0 1px 4px rgba(0, 0, 0, 0.28)' : '0 2px 8px rgba(0, 0, 0, 0.35), inset 0 1px 0 #ffffff',
                pointerEvents: 'none',
                zIndex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#000000',
                willChange: 'transform'
              }}
            >
              <ActiveIcon width={filterIconSize} height={filterIconSize} />
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
                  tabIndex={settingsOpen ? -1 : 0}
                  onPointerEnter={() => {
                    if (f.id === 'emoji') void loadEmojiCatalog()
                  }}
                  onClick={() => {
                    playButtonClickSound()
                    if (f.id === 'emoji') setEmojiOpen(true)
                    else setTypeFilter(f.id)
                  }}
                >
                  <Icon width={filterIconSize} height={filterIconSize} />
                </button>
              )
            })}
        </div>
        <span
          aria-hidden={!settingsOpen}
          style={{
            gridArea: '1 / 1 / 2 / 2',
            fontSize: 13,
            fontWeight: 600,
            color: '#8e8e93',
            letterSpacing: '0.01em',
            paddingLeft: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 170,
            lineHeight: '28px',
            opacity: settingsOpen ? 1 : 0,
            pointerEvents: 'none',
            transition: headerFade
          }}
        >
          {t('header.settings')}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, paddingRight: 2 }}>
        {settingsOpen && (
          <button
            type="button"
            className="icon-btn"
            title={t('header.whatsNew')}
            onClick={() => {
              playButtonClickSound()
              handleOpenChangelog()
            }}
            style={{
              color: 'rgba(255, 255, 255, 0.75)',
              flexShrink: 0,
              cursor: 'pointer',
              width: headerButtonSize,
              height: headerButtonSize,
              display: 'grid',
              placeItems: 'center',
              position: 'relative',
              borderRadius: 8,
              transition: 'all 0.15s ease'
            }}
          >
            <InfoIcon width={isMac ? 15 : 16} height={isMac ? 15 : 16} />
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
            flexShrink: 0,
            cursor: 'pointer',
            width: headerButtonSize,
            height: headerButtonSize,
            display: 'grid',
            placeItems: 'center',
            position: 'relative'
          }}
        >
          <span
            aria-hidden={settingsOpen}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              opacity: settingsOpen ? 0 : 1,
              transition: headerFade,
              pointerEvents: 'none'
            }}
          >
            <GearIcon width={isMac ? 15 : 16} height={isMac ? 15 : 16} />
          </span>
          <span
            aria-hidden={!settingsOpen}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              opacity: settingsOpen ? 1 : 0,
              transition: headerFade,
              pointerEvents: 'none'
            }}
          >
            <CloseIcon width={isMac ? 15 : 16} height={isMac ? 15 : 16} />
          </span>
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
