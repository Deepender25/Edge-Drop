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
    version: 'v0.2.9',
    date: 'Aug 20, 2026',
    isLatest: true,
    summary: 'Customizable shortcut, selective history clearing, pastel file icons, and smoother deletion animations.',
    highlights: [
      {
        title: 'Custom Global Shortcut',
        description: 'Customize the shelf toggle hotkey (defaults to Alt+C) directly in Settings.'
      },
      {
        title: 'Selective History Clearing',
        description: 'Clear history by time window (1h, 6h, 24h) or clear only the active category (Images, Files, etc.).'
      },
      {
        title: 'Pastel File Icons',
        description: 'New vector icons for folders, code, spreadsheets, PDFs, documents, and media files.'
      },
      {
        title: 'Smoother Item Removal',
        description: 'Deleting items now collapses smoothly without leaving empty gaps.'
      },
      {
        title: 'Windows Snipping Tool Integration',
        description: 'Screenshots taken with Win+Shift+S are automatically captured with clean file names.'
      }
    ]
  },
  {
    version: 'v0.2.7',
    date: 'Aug 13, 2026',
    isLatest: false,
    summary: 'Lower memory usage, instant link previews, and improved desktop drag-and-drop.',
    highlights: [
      {
        title: 'Lower Memory Usage',
        description: 'Optimized storage so the app stays fast and lightweight in the background.'
      },
      {
        title: 'Rich Link Previews',
        description: 'Copied URLs automatically display website titles and icons.'
      },
      {
        title: 'Desktop Drag & Drop',
        description: 'Drag items directly into or out of the shelf into any desktop application.'
      },
      {
        title: 'Better Fullscreen Handling',
        description: 'Improved detection so the shelf stays hidden during games and videos.'
      }
    ]
  },
  {
    version: 'v0.2.6',
    date: 'Aug 05, 2026',
    isLatest: false,
    summary: 'Cleaner settings interface, smoother scrolling, and improved translations.',
    highlights: [
      {
        title: 'Redesigned Settings',
        description: 'Simpler navigation with categorized tabs and a cleaner layout.'
      },
      {
        title: 'Smoother Performance',
        description: 'Faster panel opening and responsive scrolling.'
      },
      {
        title: 'Support & Feedback',
        description: 'Easy links to support the project and share feedback.'
      }
    ]
  },
  {
    version: 'v0.2.5',
    date: 'Aug 03, 2026',
    isLatest: false,
    summary: '30+ language translations, sleep/wake protection, and font size controls.',
    highlights: [
      {
        title: '30+ Languages',
        description: 'Full translations including right-to-left layout support for Arabic and Hebrew.'
      },
      {
        title: 'Adjustable Font Size',
        description: 'Choose between Small, Normal, Medium, and Large text scaling.'
      },
      {
        title: 'Multi-File Selection',
        description: 'Select multiple files at once to copy, paste, or clear them together.'
      }
    ]
  },
  {
    version: 'v0.2.0',
    date: 'Jul 26, 2026',
    isLatest: false,
    summary: 'Background updates, one-click link opening, and pinned items shelf.',
    highlights: [
      {
        title: 'Background Updates',
        description: 'Seamless auto-updates with a single-click restart button.'
      },
      {
        title: 'One-Click Link Launcher',
        description: 'Open copied links directly in your default browser.'
      },
      {
        title: 'Pinned Items Section',
        description: 'Keep your favorite clips safely pinned at the top.'
      }
    ]
  },
  {
    version: 'v0.1.5',
    date: 'Jul 24, 2026',
    isLatest: false,
    summary: 'Customizable copy indicator styles and hover zone improvements.',
    highlights: [
      {
        title: 'Custom Copy Indicators',
        description: 'Choose between Logo, Tick, Copy, and Sparkle indicator styles.'
      },
      {
        title: 'Hover Stability',
        description: 'Smoother hover detection when accessing settings on taller shelves.'
      }
    ]
  },
  {
    version: 'v0.1.4',
    date: 'Jul 23, 2026',
    isLatest: false,
    summary: 'Fullscreen game and presentation protection.',
    highlights: [
      {
        title: 'Fullscreen Protection',
        description: 'Shelf pauses hover triggers while playing games or presenting.'
      },
      {
        title: 'Quick Hotkey Access',
        description: 'Toggle the shelf at any time using Alt+C.'
      }
    ]
  },
  {
    version: 'v0.1.3',
    date: 'Jul 23, 2026',
    isLatest: false,
    summary: 'Multi-monitor support and quick click-to-paste.',
    highlights: [
      {
        title: 'Multi-Monitor Support',
        description: 'Place the shelf on any connected monitor with automatic recovery.'
      },
      {
        title: 'Click to Paste',
        description: 'Click any item in the preview flyout to paste it directly into your active app.'
      }
    ]
  },
  {
    version: 'v0.1.2',
    date: 'Jul 22, 2026',
    isLatest: false,
    summary: 'Encrypted local history and drag-to-stack grouping.',
    highlights: [
      {
        title: 'Secure Storage',
        description: 'Clipboard history is encrypted securely on your device.'
      },
      {
        title: 'Drag to Stack',
        description: 'Drag items onto the preview window to group them into stacks.'
      }
    ]
  },
  {
    version: 'v0.1.1',
    date: 'Jul 18, 2026',
    isLatest: false,
    summary: 'Screen edge selection and performance improvements.',
    highlights: [
      {
        title: 'Left or Right Screen Edge',
        description: 'Position the shelf on either the left or right side of your display.'
      },
      {
        title: 'Faster Performance',
        description: 'Lower memory footprint and improved responsiveness.'
      }
    ]
  },
  {
    version: 'v0.1.0',
    date: 'Jul 10, 2026',
    isLatest: false,
    summary: 'Initial release of Edge-Drop, a zero-click clipboard shelf living on your screen edge.',
    highlights: [
      {
        title: 'Zero-Click Edge Hover',
        description: 'Slide your mouse to the screen edge to open your clipboard.'
      },
      {
        title: 'Drag & Drop Support',
        description: 'Drag clips directly into your desktop apps.'
      },
      {
        title: 'Smart Stacks',
        description: 'Group multiple copied files and images into organized stacks.'
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
