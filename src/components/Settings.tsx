import { useEffect, useState } from 'react'
import { useStore } from '../store/appStore'
import type { DisplayInfo } from '../../shared/types'
import '../styles/settings.css'

export function Settings() {
  const settings = useStore((s) => s.settings)
  const patch = useStore((s) => s.patchSettings)
  const updateInfo = useStore((s) => s.updateInfo)
  const currentVersion = useStore((s) => s.currentVersion)

  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  useEffect(() => {
    window.edge.getDisplays().then(setDisplays).catch(() => {})
  }, [])

  return (
    <div className="settings-list">
      {updateInfo?.hasUpdate && (
        <>
          <div className="update-prompt">
            <div className="update-text">
              There is a new version available for this application and you can download it.
            </div>
            <button
              className="update-btn"
              onClick={() => window.open(updateInfo.downloadUrl, '_blank')}
            >
              Download {updateInfo.latestVersion}
            </button>
          </div>
          <div className="setting-divider" />
        </>
      )}

      {/* Clear unpinned on restart */}
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-title">Clear unpinned on restart</div>
          <div className="setting-desc">Wipe unpinned items whenever device restarts</div>
        </div>
        <Toggle
          checked={settings.clearUnpinnedOnRestart}
          onChange={(v) => patch({ clearUnpinnedOnRestart: v })}
        />
      </div>

      <div className="setting-divider" />

      {/* Auto-delete timer */}
      <div className="setting-row vertical">
        <div className="setting-info">
          <div className="setting-title">Auto-delete timer</div>
          <div className="setting-desc">Automatically purge copied items (preserves Pinned)</div>
        </div>
        <div className="setting-pills">
          {[
            { label: 'Never', val: 0 },
            { label: '1h', val: 1 },
            { label: '6h', val: 6 },
            { label: '24h', val: 24 },
            { label: '7d', val: 168 }
          ].map((opt) => (
            <button
              key={opt.val}
              className={`pill ${settings.autoDeleteHours === opt.val ? 'active' : ''}`}
              onClick={() => patch({ autoDeleteHours: opt.val })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-divider" />

      {/* History capacity */}
      <div className="setting-row vertical">
        <div className="setting-info">
          <div className="setting-title">History capacity</div>
          <div className="setting-desc">Maximum unpinned items stored in history</div>
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
              onClick={() => patch({ historyLimit: opt.val })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-divider" />

      {/* Edge trigger height */}
      <div className="setting-row vertical">
        <div className="setting-info">
          <div className="setting-title">Edge trigger height</div>
          <div className="setting-desc">Hover area size on screen edge</div>
        </div>
        <div className="setting-pills">
          {[
            { label: 'Small', val: 0.25 },
            { label: 'Medium', val: 0.4 },
            { label: 'Large', val: 0.6 }
          ].map((opt) => (
            <button
              key={opt.label}
              className={`pill ${Math.abs(settings.hotZoneHeight - opt.val) < 0.08 ? 'active' : ''}`}
              onClick={() => patch({ hotZoneHeight: opt.val })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-divider" />

      {/* Edge trigger width */}
      <div className="setting-row vertical">
        <div className="setting-info">
          <div className="setting-title">Edge trigger thickness</div>
          <div className="setting-desc">Physical thickness of the trigger area</div>
        </div>
        <div className="setting-pills">
          {[
            { label: 'Small', val: 3 },
            { label: 'Medium', val: 6 },
            { label: 'Large', val: 12 }
          ].map((opt) => (
            <button
              key={opt.label}
              className={`pill ${settings.hotZoneWidth === opt.val ? 'active' : ''}`}
              onClick={() => patch({ hotZoneWidth: opt.val })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-divider" />

      {/* Panel height */}
      <div className="setting-row vertical">
        <div className="setting-info">
          <div className="setting-title">Panel height</div>
          <div className="setting-desc">Vertical size of the clipboard panel</div>
        </div>
        <div className="setting-pills">
          {[
            { label: 'Small', val: 0.5 },
            { label: 'Medium', val: 0.65 },
            { label: 'Large', val: 0.8 }
          ].map((opt) => (
            <button
              key={opt.label}
              className={`pill ${Math.abs((settings.panelHeight || 0.6) - opt.val) < 0.08 ? 'active' : ''}`}
              onClick={() => patch({ panelHeight: opt.val })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-divider" />

      {/* Stick position */}
      <div className="setting-row vertical">
        <div className="setting-info">
          <div className="setting-title">Stick position</div>
          <div className="setting-desc">Screen edge to attach the panel</div>
        </div>
        <div className="setting-pills">
          {[
            { label: 'Left', val: 'left' as const },
            { label: 'Right', val: 'right' as const },
            { label: 'Top', val: 'top' as const }
          ].map((opt) => (
            <button
              key={opt.label}
              className={`pill ${settings.stickPosition === opt.val ? 'active' : ''}`}
              onClick={() => patch({ stickPosition: opt.val })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-divider" />

      {/* Display picker */}
      <div className="setting-row vertical">
        <div className="setting-info">
          <div className="setting-title">Display</div>
          <div className="setting-desc">Monitor to stick the panel to</div>
        </div>
        <div className="setting-pills">
          {displays.length === 0 && <div className="pill disabled">Loading...</div>}
          {displays.map((d) => (
            <button
              key={d.id}
              className={`pill display-pill ${settings.stickDisplayId === d.id ? 'active' : ''}`}
              onClick={() => patch({ stickDisplayId: d.id })}
            >
              <div className="pill-name">{d.name}</div>
              <div className="pill-res">{d.resolution}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="setting-divider" />

      {/* Incognito mode */}
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-title">Incognito mode</div>
          <div className="setting-desc">Temporarily pause recording new clipboard items</div>
        </div>
        <Toggle
          checked={settings.incognito}
          onChange={(v) => patch({ incognito: v })}
        />
      </div>

      <div className="setting-divider" />

      {/* Launch at login */}
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-title">Launch at login</div>
          <div className="setting-desc">Start silently in background when computer boots</div>
        </div>
        <Toggle
          checked={settings.launchAtLogin}
          onChange={(v) => patch({ launchAtLogin: v })}
        />
      </div>

      <div className="setting-divider" />

      {/* GitHub Star Promo */}
      <div className="github-promo">
        <div className="github-promo-text">
          If you like the application, please give a star to the GitHub repository - it means a lot!
        </div>
        <button
          className="github-promo-btn"
          onClick={() => window.open('https://github.com/Deepender25/Edge-Drop', '_blank')}
        >
          <svg
            className="star-icon"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="currentColor"
            style={{ marginRight: 6 }}
          >
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
          Star on GitHub
        </button>
        <div className="app-version-footer">
          Version {currentVersion || '0.1.0'}
        </div>
      </div>

    </div>
  )
}

function Toggle({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      className={`setting-toggle${checked ? ' checked' : ''}`}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-thumb" />
    </button>
  )
}
