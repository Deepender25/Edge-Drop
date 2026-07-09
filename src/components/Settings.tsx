import { useStore } from '../store/appStore'
import '../styles/settings.css'

export function Settings() {
  const settings = useStore((s) => s.settings)
  const patch = useStore((s) => s.patchSettings)

  return (
    <div className="settings-list">
      
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
