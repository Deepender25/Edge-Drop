import { useStore } from '../store/appStore'
import RubberSegment from './RubberSegment'
import { GearIcon, CloseIcon, InfoIcon, ClockIcon, TypeIcon, LinkIcon, ImageIcon, FilesIcon, PaletteIcon, EmojiSmileIcon } from './icons'
import { playButtonClickSound } from '../lib/soundEffects'
import { loadEmojiCatalog } from '../lib/emoji/load'
import { ShelfSearch } from './ShelfSearch'
import { EmojiCategoryBar } from './EmojiCategoryBar'

import { useTranslation } from '../i18n'
import { ClearMenu } from './ClearMenu'
import type { ClipboardItemDto, TypeFilter } from '../../shared/types'

export interface HeaderProps {
  isHorizontal?: boolean
  itemCount?: number
  clearProps?: {
    items: ClipboardItemDto[]
    disabled: boolean
    panelOpen: boolean
    onClear: (ids: string[]) => void
    onClearAll: () => void
  }
}

export function Header({ isHorizontal = false, itemCount, clearProps }: HeaderProps = {}) {
  const isStoreBuild = useStore((s) => s.isStoreBuild)
  const { t } = useTranslation()
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const updateInfo = useStore((s) => s.updateInfo)
  const settings = useStore((s) => s.settings)
  const patchSettings = useStore((s) => s.patchSettings)
  const currentVersion = useStore((s) => s.currentVersion)
  const settingsTab = useStore((s) => s.settingsTab)
  const setSettingsTab = useStore((s) => s.setSettingsTab)

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
    { id: 'colors', label: t('filters.colors') || 'Colors', Icon: PaletteIcon },
    { id: 'emoji', label: t('emoji.open'), Icon: EmojiSmileIcon }
  ]

  const activeId: (typeof FILTERS)[number]['id'] = emojiOpen ? 'emoji' : typeFilter
  const filterSlotSize = isHorizontal ? 26 : 24
  const filterTrackHeight = isHorizontal ? 30 : 28
  const filterIconSize = isHorizontal ? 14 : 13
  const reduceMotion = !!settings.reduceMotion
  const headerFade = `opacity ${reduceMotion ? '0.01s' : '0.16s'} ease`

  return (
    <div
      className={`header${isHorizontal ? ' header-horizontal' : ''}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        width: '100%',
        alignItems: 'center',
        height: 40,
        padding: isHorizontal ? '0 16px' : '0 14px',
        boxSizing: 'border-box',
        position: 'relative',
        zIndex: isHorizontal ? 250 : 100
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplate: '1fr / 1fr',
          alignItems: 'center',
          minWidth: 0,
          flex: 1,
          height: 32,
          overflow: 'visible'
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
            marginLeft: 0,
            maxWidth: '100%',
            overflow: 'visible',
            opacity: settingsOpen ? 0 : 1,
            pointerEvents: settingsOpen ? 'none' : 'auto',
            transition: headerFade
          }}
        >
          <RubberSegment
            items={FILTERS.map((f) => ({
              value: f.id,
              label: f.label,
              title: f.label,
              icon: <f.Icon width={filterIconSize} height={filterIconSize} />
            }))}
            value={activeId}
            onChange={(val) => {
              playButtonClickSound()
              if (val === 'emoji') setEmojiOpen(true)
              else setTypeFilter(val as TypeFilter)
            }}
            onHoverItem={(val) => {
              if (val === 'emoji') void loadEmojiCatalog()
            }}
            trackColor="#141414"
            thumbColor="#ffffff"
            textColor="rgba(255, 255, 255, 0.72)"
            activeTextColor="#000000"
            size="custom"
            height={filterTrackHeight}
            minWidth={filterSlotSize}
            radius={9999}
            inset={2}
            equalSlots={true}
            stretch={80}
            squash={2}
            glide={60}
            draggable={true}
            tabIndex={settingsOpen ? -1 : undefined}
            aria-label={t('filters.title') || 'Filters'}
          />
        </div>
        {isHorizontal ? (
          <div
            aria-hidden={!settingsOpen}
            style={{
              gridArea: '1 / 1 / 2 / 2',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              opacity: settingsOpen ? 1 : 0,
              pointerEvents: settingsOpen ? 'auto' : 'none',
              transition: headerFade
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginRight: 2
              }}
            >
              {t('header.settings')}
            </span>
            <div className="settings-header-pills" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {[
                { id: 'behaviour' as const, label: t('tabs.behaviour') },
                { id: 'position' as const, label: t('tabs.position') },
                { id: 'appearance' as const, label: t('tabs.appearance') }
              ].map((tab) => {
                const active = settingsTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`settings-header-pill${active ? ' active' : ''}`}
                    onClick={() => {
                      playButtonClickSound()
                      setSettingsTab(tab.id)
                    }}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
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
        )}
      </div>

      {isHorizontal && !settingsOpen && !emojiOpen && (
        <div className="header-search header-search-center">
          <ShelfSearch />
        </div>
      )}
      {isHorizontal && !settingsOpen && emojiOpen && (
        <div className="header-search header-search-center">
          <EmojiCategoryBar isHorizontal={true} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingRight: 2, position: 'relative', zIndex: 260 }}>
        {isHorizontal && !settingsOpen && itemCount != null && (
          <div className="footer-capsule" style={{ marginRight: 2 }}>
            <span className="footer-capsule-count" title={`${itemCount}`}>
              {itemCount}
            </span>
          </div>
        )}
        {isHorizontal && clearProps && !settingsOpen && (
          <ClearMenu {...clearProps} menuDirection="down" />
        )}
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
              background: 'transparent',
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
            <GearIcon />
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
            <CloseIcon />
          </span>
          {!settingsOpen && !isStoreBuild && (updateInfo?.downloaded || updateInfo?.hasUpdate) && (
            <span
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#30d158',
                border: '1.5px solid #000000',
                boxShadow: '0 0 8px rgba(48, 209, 88, 0.7)',
                pointerEvents: 'none'
              }}
            />
          )}
        </button>
      </div>
    </div>
  )
}
