import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..')

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

describe('update prompt placement contracts (promoted lifecycle, bottom hides while active)', () => {
  it('promoted gate includes downloading and downloaded states seamlessly', () => {
    const src = read('src/components/Settings.tsx')
    // Top card shows all active update lifecycle stages.
    expect(src).toContain('hasPromotedTopUpdate = !isStoreBuild && (')
    // The manual "check for updates" row hides while promoted, in both docks.
    expect(src).toContain('if (isStoreBuild || hasPromotedTopUpdate) return null')
    expect(src).toContain('...(updateCheck ? [updateCheck] : [])')
  })

  it('the check row keeps its title and reports the state underneath', () => {
    const src = read('src/components/Settings.tsx')
    const row = src.slice(src.indexOf('const renderUpdateCheckRow'), src.indexOf('// ── Building blocks shared by both layouts'))
    expect(row).toContain("title: t('behaviour.checkForUpdates'),")
    expect(row).toContain("t('behaviour.checkingForUpdates')")
    expect(row).toContain("t('behaviour.isUpToDate')")
    // a failure is said in the user's language (the raw, English error is only logged)
    expect(row).toContain("t(checkState.error === 'download' ? 'behaviour.updateDownloadFailed' : 'behaviour.updateCheckFailed')")
    // the refresh arrow spins while checking (no coloured dot)
    expect(row).toContain("status === 'checking' ? ' is-busy' : ''")
    const css = read('src/styles/settings.css')
    expect(css).toMatch(/\.set-row-icon-btn\.is-busy svg \{[^}]*animation: setRowSpin/)
    expect(css).toMatch(/\.update-dot \{[^}]*background: #ffffff;/)
    expect(css).not.toContain('updateBtnGlow')
  })

  it('store tracks manual-flow ownership across check, download, and dismiss', () => {
    const src = read('src/store/appStore.ts')
    expect(src).toContain('manualUpdateActive: boolean')
    expect(src).toContain('manualUpdateActive: true')
    // Dismiss and stale-result paths release ownership.
    expect(src).toContain('manualUpdateActive: false')
  })

  it('a background find for a newer version retires stale manual results', () => {
    const src = read('src/store/appStore.ts')
    expect(src).toContain("mc.version !== info.version")
  })
})
