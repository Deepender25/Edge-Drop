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
    // Bottom manual card and horizontal status card hide while promoted.
    expect(src).toContain('if (isStoreBuild || hasPromotedTopUpdate) return null')
    expect(src).toContain('{!isStoreBuild && !hasPromotedTopUpdate && (')
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
