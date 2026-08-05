import { useEffect, useState } from 'react'
import { useStore } from '../store/appStore'
import { useTranslation } from '../i18n'

interface HighlightItem {
  title: string
  description: string
}

interface ChangelogRelease {
  version: string
  date: string
  isLatest: boolean
  summary: string
  highlights: HighlightItem[]
}

const CHANGELOG_DATA: ChangelogRelease[] = [
  {
    version: 'v0.2.6',
    date: 'Aug 05, 2026',
    isLatest: true,
    summary: 'Performance optimizations, redesigned settings footer, custom support portal integration, and enhanced 30-language typography.',
    highlights: [
      {
        title: 'Performance Improvements',
        description: 'Removed CPU blur effects across UI components for smoother panel opening and scrolling.'
      },
      {
        title: 'Settings UI & Navigation Redesign',
        description: 'Reordered settings footer to place the Support section above the Quit button, redesigned buttons into matching pill shapes with a soft pastel red support button, and simplified Quit into a low-profile bottom button.'
      },
      {
        title: 'Official Support Portal Integration',
        description: 'Updated support link to open official Edge-Drop support page supporting both International Ko-fi and Indian UPI options.'
      },
      {
        title: 'Localization & Typography Enhancements',
        description: 'Updated filter category labels across 30 languages with shorter native terms and added dynamic font scaling so filter text fits cleanly without overlapping.'
      }
    ]
  },
  {
    version: 'v0.2.5',
    date: 'Aug 03, 2026',
    isLatest: false,
    summary: 'Full 30-language localization with auto-scroll selector, powerMonitor sleep/wake protection, text size typography settings, and multi-file action bar.',
    highlights: [
      {
        title: 'Complete 30-Language Localization & Smart Language Selector',
        description: 'Implemented full translation dictionaries across 30 languages, added RTL layout support for Arabic and Hebrew, integrated audio haptics, and added auto-scrolling to position the selected language in the dropdown viewport.'
      },
      {
        title: 'Laptop Sleep & Unlock Protection',
        description: 'Eliminated false Copy Indicator activations when opening laptop lid or unlocking screen using native powerMonitor lifecycle handlers.'
      },
      {
        title: 'Text Size Typography Scale Setting',
        description: 'Added customizable typography scale settings (Small, Normal, Medium, Large) applying dynamic font scaling across the app.'
      },
      {
        title: 'Multi-File Selection & Preview Action Bar',
        description: 'Added tap-to-toggle multi-file selection with a batch action bar (Select All, Copy Selected, Paste Selected, Clear Selection).'
      }
    ]
  },
  {
    version: 'v0.2.0',
    date: 'Jul 26, 2026',
    isLatest: false,
    summary: 'Silent background auto-updater, direct web link launcher, dedicated Pinned items deck, and interactive controls.',
    highlights: [
      {
        title: 'Silent Background Auto-Updates',
        description: 'New updates download silently in the background with a single-click Restart to Update button.'
      },
      {
        title: 'Direct One-Click Web Link Launcher',
        description: 'Copied links feature a dedicated launch button opening directly in your default browser.'
      },
      {
        title: 'Dedicated Pinned Items Deck',
        description: 'Encapsulated pinned items inside a dedicated deck container at the top of the shelf.'
      },
      {
        title: 'Live What\'s New Sync',
        description: 'Release history connects live to GitHub Releases with automatic offline safeguards.'
      }
    ]
  },
  {
    version: 'v0.1.5',
    date: 'Jul 24, 2026',
    isLatest: false,
    summary: 'Customizable Copy Indicator styles with a 2x2 grid selector flyout alongside panel hover stability fixes for medium and large panel heights.',
    highlights: [
      {
        title: 'Four Vector Indicator Options',
        description: 'Added support for 4 customizable copy indicator styles including Logo, Tick, Copy, and Sparkle.'
      },
      {
        title: 'Balanced 2x2 Grid Flyout Selector',
        description: 'Integrated a 2x2 grid selector flyout inside Settings under Indicator Style for quick style previews and one-click selection.'
      },
      {
        title: 'Clean Vector Graphic Rendering',
        description: 'Removed background circle badges so all icons float natively as solid vector graphics with subtle glowing drop shadows.'
      },
      {
        title: 'Panel Hover Boundary Fix for Settings Button',
        description: 'Resolved an issue where moving the cursor down toward the Settings button on medium (60%) and large (80%) panel heights caused the clipboard to prematurely close.'
      },
      {
        title: 'Recalibrated Y-Axis Hot Zone',
        description: 'Updated the panel height bounds calculation in the edge hover detector so the entire vertical area of the expanded blade remains active.'
      }
    ]
  },
  {
    version: 'v0.1.4',
    date: 'Jul 23, 2026',
    isLatest: false,
    summary: 'Automatic Fullscreen Protection for gamers and presenters - detecting Direct3D games and fullscreen media via native Windows APIs.',
    highlights: [
      {
        title: 'Automatic OS Game & Fullscreen Detection',
        description: 'Integrated native Windows API detection to identify Direct3D fullscreen games, presentation modes, and busy states.'
      },
      {
        title: 'Hover Suppression & Instant Auto-Retract',
        description: 'Automatically suppresses edge hover and instantly retracts the panel when a fullscreen game, video, or presentation is active in the foreground.'
      },
      {
        title: '0ms Latency & Hotkey Access',
        description: 'Background polling runs every 1 second with 0ms overhead during edge hover checks. Global shortcut Alt + C remains active.'
      },
      {
        title: 'Settings Toggle (Fullscreen Protection)',
        description: 'Added a user toggle under Behaviour in Settings (Fullscreen Protection, enabled by default).'
      },
      {
        title: 'GitHub Support & Feedback Links',
        description: 'Added a COMMUNITY & SUPPORT section in Settings linking directly to bug reports and feature requests.'
      }
    ]
  },
  {
    version: 'v0.1.3',
    date: 'Jul 23, 2026',
    isLatest: false,
    summary: 'Major multi-display architecture overhaul featuring single-source display selection, System Tray sync, and automatic OS disconnect recovery.',
    highlights: [
      {
        title: 'Single-Source Display Engine & Real-Time Tray Sync',
        description: 'Unified monitor listing and selection state across Application Settings and the System Tray context menu into a single source of truth.'
      },
      {
        title: 'Automatic OS Disconnect Recovery',
        description: 'When a secondary display hosting the panel is disconnected, Edge-Drop auto-heals its target back to the Primary Display.'
      },
      {
        title: 'Brief Visual Confirmation Pop-Ups',
        description: 'The clipboard panel automatically pops open for 1.5 seconds to visually confirm its position whenever a monitor configuration changes.'
      },
      {
        title: 'Universal Flyout Click-to-Paste',
        description: 'Clicking any text snippet, image thumbnail, or file tile inside an open Preview Flyout now instantly pastes that item into active applications.'
      },
      {
        title: 'Animation Controls',
        description: 'Added independent settings under Animations for bounce scale pop (bounceAnimation) and background blurring (blurAnimation).'
      }
    ]
  },
  {
    version: 'v0.1.2',
    date: 'Jul 22, 2026',
    isLatest: false,
    summary: 'Security infrastructure upgrades including Windows DPAPI history encryption, process isolation, Electron 34, and Preview Flyout drag-to-stack.',
    highlights: [
      {
        title: 'Windows DPAPI safeStorage Encryption & Electron 34',
        description: 'Clipboard history is now encrypted at rest using native Windows DPAPI. Core runtime upgraded to Electron v34.2.0.'
      },
      {
        title: 'Preview Flyout Drag-to-Stack Merging',
        description: 'You can drag any item from the clipboard shelf directly onto an open Preview Flyout to stack and merge items instantly.'
      },
      {
        title: 'Dynamic 100% Full-Width Single-File Layout',
        description: 'Opening the Preview Flyout for a single file dynamically expands to a full-width presentation.'
      },
      {
        title: 'Unified Image File Rendering',
        description: 'Images copied from File Explorer or desktop automatically render as rich visual image cards with thumbnails.'
      }
    ]
  },
  {
    version: 'v0.1.1',
    date: 'Jul 18, 2026',
    isLatest: false,
    summary: 'Multi-monitor configuration, screen edge selection (Left/Right), and background memory optimizations.',
    highlights: [
      {
        title: 'Multi-Monitor & Position Support',
        description: 'Targeted display selection allows anchoring to any connected monitor on either Left or Right screen edge.'
      },
      {
        title: 'Resource & Memory Optimization',
        description: 'Rebuilt image handling consuming up to 60% less RAM while idle.'
      },
      {
        title: 'Bug Fixes & UI Refinements',
        description: 'Display highlight accuracy defaults to primary display and Z-index rendering fixes.'
      }
    ]
  },
  {
    version: 'v0.1.0',
    date: 'Jul 10, 2026',
    isLatest: false,
    summary: 'Initial release of Edge-Drop, a zero-click desktop clipboard shelf living on the screen edge.',
    highlights: [
      {
        title: 'Zero-Click Activation & Edge Hover',
        description: 'Anchored at the screen edge with 120ms dwelling detection and physics-based spring panel opening.'
      },
      {
        title: 'OS-Level OLE Native Drag & Drop',
        description: 'Drag items directly into Photoshop, Word, Slack, or File Explorer.'
      },
      {
        title: 'Fluid Collections & 3D Stacks',
        description: 'Multi-file copies auto-group into expandable 3D card stacks.'
      },
      {
        title: 'Configurable Clipboard Engine',
        description: 'Incognito Mode, customizable history capacity (100-1000 items), auto-delete timers, and vertical trigger hot-zones.'
      }
    ]
  }
]

export function ChangelogView() {
  const { t } = useTranslation()
  const currentVersion = useStore((s) => s.currentVersion)
  const [releases, setReleases] = useState<ChangelogRelease[]>(CHANGELOG_DATA)

  useEffect(() => {
    window.edge.getReleases()
      .then((fetched) => {
        if (Array.isArray(fetched) && fetched.length > 0) {
          setReleases(fetched)
        }
      })
      .catch((err) => {
        console.warn('Failed to load live GitHub releases:', err)
      })
  }, [])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      padding: '16px',
      boxSizing: 'border-box',
      width: '100%',
      maxWidth: '100%',
      overflowX: 'hidden',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#ffffff'
    }}>
      {releases.map((rel, index) => {
        const isCurrent = currentVersion ? `v${currentVersion}` === rel.version || currentVersion === rel.version : rel.isLatest

        return (
          <div
            key={rel.version}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              maxWidth: '100%',
              overflowX: 'hidden',
              paddingBottom: index < releases.length - 1 ? '24px' : '0',
              borderBottom: index < releases.length - 1 ? '1px solid rgba(255, 255, 255, 0.08)' : 'none'
            }}
          >
            {/* Version Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <span style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#ffffff',
                  fontFamily: 'Consolas, "Cascadia Code", monospace',
                  letterSpacing: '-0.02em'
                }}>
                  {rel.version}
                </span>
                {isCurrent && (
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.75)',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em'
                  }}>
                    {t('flyout.current')}
                  </span>
                )}
              </div>
              {rel.date && (
                <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', whiteSpace: 'nowrap' }}>
                  {rel.date}
                </span>
              )}
            </div>

            {/* Summary */}
            <p style={{
              margin: 0,
              fontSize: '12.5px',
              lineHeight: '1.5',
              color: 'rgba(255, 255, 255, 0.8)',
              fontWeight: 400
            }}>
              {rel.summary}
            </p>

            {/* Highlights List */}
            {rel.highlights && rel.highlights.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                {rel.highlights.map((h, hIdx) => (
                  <div
                    key={hIdx}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>
                      {h.title}
                    </div>
                    <div style={{ fontSize: '11.5px', lineHeight: '1.4', color: 'rgba(255, 255, 255, 0.6)' }}>
                      {h.description}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
