import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const fsRoots = vi.hoisted(() => ({
  home: '',
  userData: ''
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => join(fsRoots.userData, 'app'),
    getPath: (name: string) => (name === 'userData' ? fsRoots.userData : join(fsRoots.userData, name))
  }
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: () => fsRoots.home
  }
})

type StagedTempModule = typeof import('../electron/main/stagedTemp')

let mod: StagedTempModule

/** Image capture whose bytes live in the permanent images dir. */
function imageData(id: string) {
  return { kind: 'image' as const, imageId: id, width: 10, height: 10, bytes: 8, ext: 'png' }
}

describe('staged temp lifecycle (registry + ownership cleanup)', () => {
  beforeEach(async () => {
    delete process.env.APP_BUILD_TARGET
    fsRoots.userData = join(tmpdir(), `ed-staged-ud-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    fsRoots.home = join(tmpdir(), `ed-staged-home-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(join(fsRoots.userData, 'temp'), { recursive: true })
    mkdirSync(fsRoots.home, { recursive: true })
    // Fresh module instance per test (registry state is module-scoped).
    vi.resetModules()
    mod = await import('../electron/main/stagedTemp')
  })

  afterEach(() => {
    delete process.env.APP_BUILD_TARGET
    try { rmSync(fsRoots.userData, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(fsRoots.home, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  function stageArtifact(name: string): string {
    const p = join(fsRoots.userData, 'temp', name)
    writeFileSync(p, `bytes-${name}`)
    return p
  }

  function registryOnDisk(): { v: number; entries: Array<{ sig: string; files: string[] }> } {
    return JSON.parse(readFileSync(join(fsRoots.userData, 'temp-staged.json'), 'utf8'))
  }

  it('keeps owned artifacts through startup reconciliation and reaps unknown strays', () => {
    const owned = stageArtifact('Screenshot 2026-08-24 10.00.00.png')
    const stray = stageArtifact('Screenshot 2026-08-24 09.00.00.png')
    const data = imageData('img_live')

    mod.recordStagedFiles(data, [owned])
    mod.flushStagedTempRegistry()

    expect(existsSync(join(fsRoots.userData, 'temp-staged.json'))).toBe(true)
    expect(registryOnDisk().entries).toHaveLength(1)

    mod.reconcileTempOnStartup([ { id: 'a', data, capturedAt: Date.now(), hitCount: 1, pinned: false } ])

    expect(existsSync(owned)).toBe(true)
    expect(existsSync(stray)).toBe(false)
  })

  it('deletes registered artifacts immediately when their owning item is removed', () => {
    const f1 = stageArtifact('Image 2026-08-24 11.00.00.png')
    const f2 = stageArtifact('Snippet_abc.txt')
    const img = imageData('img_dead')
    const text = { kind: 'text' as const, text: 'note', isUrl: false }

    mod.recordStagedFiles(img, [f1])
    mod.recordStagedFiles(text, [f2])

    mod.forgetStagedItems([
      { id: 'x', data: img, capturedAt: 1, hitCount: 1, pinned: false },
      { id: 'y', data: text, capturedAt: 1, hitCount: 1, pinned: false }
    ])

    expect(existsSync(f1)).toBe(false)
    expect(existsSync(f2)).toBe(false)
  })

  it('never tracks or deletes original user files exposed by files bundles', () => {
    const docs = join(fsRoots.home, 'Documents')
    mkdirSync(docs, { recursive: true })
    const userDoc = join(docs, 'report.pdf')
    writeFileSync(userDoc, 'pdf-bytes')

    const data = { kind: 'files' as const, paths: [userDoc] }
    mod.recordStagedFiles(data, [userDoc])
    mod.flushStagedTempRegistry()

    // Outside the managed temp roots -> nothing may be registered.
    expect(registryOnDisk().entries).toHaveLength(0)

    mod.forgetStagedItems([{ id: 'z', data, capturedAt: 1, hitCount: 1, pinned: false }])
    expect(existsSync(userDoc)).toBe(true)
  })

  it('persists the registry so a restart protects recently used artifacts', async () => {
    const kept = stageArtifact('Screenshot 2026-08-24 12.00.00.png')
    const data = imageData('img_persist')

    mod.recordStagedFiles(data, [kept])
    mod.flushStagedTempRegistry()

    // Simulate an app restart: brand-new module instance, same userData.
    vi.resetModules()
    mod = await import('../electron/main/stagedTemp')
    mod.reconcileTempOnStartup([ { id: 'p', data, capturedAt: Date.now(), hitCount: 1, pinned: false } ])

    expect(existsSync(kept)).toBe(true)
  })

  it('treats a missing/corrupt registry as unowned and clears managed temp once (legacy parity)', () => {
    const junk1 = stageArtifact('Screenshot 2026-08-01 00.00.00.png')
    const junk2 = stageArtifact('Snippet_old.txt')
    writeFileSync(join(fsRoots.userData, 'temp-staged.json'), '{not json!')

    mod.reconcileTempOnStartup([])

    expect(existsSync(junk1)).toBe(false)
    expect(existsSync(junk2)).toBe(false)
  })

  it('removes registry entries of dead items during reconciliation', () => {
    const dead = stageArtifact('Screenshot 2026-08-24 13.00.00.png')
    const deadData = imageData('img_gone')
    mod.recordStagedFiles(deadData, [dead])
    mod.flushStagedTempRegistry()

    // Reconcile where the owning item no longer exists.
    mod.reconcileTempOnStartup([])

    expect(existsSync(dead)).toBe(false)
    expect(registryOnDisk().entries).toHaveLength(0)
  })
})
