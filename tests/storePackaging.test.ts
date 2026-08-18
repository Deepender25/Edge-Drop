import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STORE_STARTUP_TASK_ID } from '../electron/main/config'

const root = join(__dirname, '..')

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

describe('GitHub vs Store packaging contracts (on-disk, not assumed)', () => {
  const pkg = JSON.parse(read('package.json')) as {
    scripts: Record<string, string>
    dependencies: Record<string, string>
    build: {
      asarUnpack: string[]
      extraResources?: Array<{ from: string; to: string }>
      files?: string[]
      appx: {
        identityName: string
        publisher: string
        applicationId: string
        displayName: string
        capabilities: string[]
        customExtensionsPath: string
        addAutoLaunchExtension?: boolean
      }
      publish: { provider: string; owner: string; repo: string }
      nsis: { artifactName: string }
    }
  }

  it('stamps buildTarget=github on the NSIS script and buildTarget=store on the AppX scripts', () => {
    expect(pkg.scripts['build:github']).toContain('--win nsis')
    expect(pkg.scripts['build:github']).toContain('buildTarget=github')
    expect(pkg.scripts['build:store']).toContain('--win appx')
    expect(pkg.scripts['build:store']).toContain('buildTarget=store')
    expect(pkg.scripts['build:msix']).toContain('--win appx')
    expect(pkg.scripts['build:msix']).toContain('buildTarget=store')
    expect(pkg.scripts['build:win']).toBe('npm run build:github')
  })

  it('declares the Store identity and required capabilities', () => {
    expect(pkg.build.appx.identityName).toBe('Deepender.EdgeDrop')
    expect(pkg.build.appx.publisher).toMatch(/^CN=/)
    expect(pkg.build.appx.applicationId).toBe('EdgeDrop')
    expect(pkg.build.appx.capabilities).toEqual(expect.arrayContaining(['runFullTrust', 'internetClient']))
    expect(pkg.build.appx.capabilities).not.toContain('broadFileSystemAccess')
  })

  it('points customExtensionsPath at a file that actually exists', () => {
    const rel = pkg.build.appx.customExtensionsPath
    expect(rel).toBeTruthy()
    expect(existsSync(join(root, rel))).toBe(true)
  })

  it('does not enable electron-builder SlackStartup auto-launch (we own the TaskId)', () => {
    expect(pkg.build.appx.addAutoLaunchExtension).not.toBe(true)
    expect(pkg.dependencies['electron-winstore-auto-launch']).toBeUndefined()
    expect(pkg.dependencies['@nodert-win10-au/windows.applicationmodel']).toBeUndefined()
  })

  it('ships the windowless StartupTask helper outside the asar', () => {
    expect(pkg.build.files).toEqual(expect.arrayContaining(['!resources/startup/**/*.exe']))
    expect(pkg.build.extraResources).toEqual(expect.arrayContaining([
      { from: 'resources/startup/EdgeDropStartup.exe', to: 'startup/EdgeDropStartup.exe' }
    ]))
    expect(existsSync(join(root, 'resources/startup/EdgeDropStartup.exe'))).toBe(true)
    expect(existsSync(join(root, 'resources/startup/EdgeDropStartup.cs'))).toBe(true)
  })

  it('unpacks native addons the Store package must load from disk', () => {
    const unpack = pkg.build.asarUnpack.join('\n')
    expect(unpack).toMatch(/koffi/)
    expect(unpack).toMatch(/@resvg/)
    expect(unpack).toMatch(/\{node,dll\}/)
  })

  it('keeps GitHub Releases as the NSIS publish source and NSIS artifact name', () => {
    expect(pkg.build.publish).toEqual({
      provider: 'github',
      owner: 'Deepender25',
      repo: 'Edge-Drop'
    })
    expect(pkg.build.nsis.artifactName).toContain('${version}')
    expect(pkg.build.nsis.artifactName).toMatch(/\.\$\{ext\}$/)
  })

  it('StartupTask XML uses the same TaskId as STORE_STARTUP_TASK_ID and launches Edge-Drop.exe', () => {
    const xml = read('resources/appx/startup-extensions.xml')
    expect(xml).toContain('Category="windows.startupTask"')
    expect(xml).toContain('EntryPoint="Windows.FullTrustApplication"')
    expect(xml).toContain('Executable="app\\Edge-Drop.exe"')
    expect(xml).toContain(`TaskId="${STORE_STARTUP_TASK_ID}"`)
    expect(xml).not.toContain('SlackStartup')
    expect(xml).toContain('Enabled="true"')
    expect(xml).toContain('DisplayName="Edge-Drop"')
  })

  it('electron-builder still injects customExtensionsPath into the AppX Extensions block', () => {
    const target = read('node_modules/app-builder-lib/out/targets/AppxTarget.js')
    expect(target).toContain('customExtensionsPath')
    expect(target).toContain('windows.startupTask')
    expect(target).toMatch(/extensions \+= await/)
  })

  it('main process only sets the custom AUMID on the GitHub build', () => {
    const src = read('electron/main/index.ts')
    expect(src).toMatch(/if\s*\(\s*!isStoreBuild\(\)\s*\)\s*\{[\s\S]*setAppUserModelId\('com\.edgedrop\.app'\)/)
    expect(src).not.toMatch(/setAppUserModelId\([\s\S]*isStoreBuild\(\)/)
  })

  it('Settings hides the in-app updater on Store builds', () => {
    const src = read('src/components/Settings.tsx')
    expect(src).toContain('{!isStoreBuild && (')
    expect(src).toContain('behaviour.autoUpdatesTitle')
    expect(src).toContain('hasUpdatePrompt = !isStoreBuild &&')
  })

  it('updater module hard-returns on Store for every public entry', () => {
    const src = read('electron/main/updater.ts')
    expect(src).toMatch(/export function quitAndInstallUpdate[\s\S]*if \(isStoreBuild\(\)\) return/)
    expect(src).toMatch(/export function syncAutoUpdaterState[\s\S]*if \(isStoreBuild\(\)/)
    expect(src).toMatch(/export async function checkForUpdatesManual[\s\S]*if \(isStoreBuild\(\)\)/)
    expect(src).toMatch(/export async function startUpdateDownload[\s\S]*if \(isStoreBuild\(\)/)
    expect(src).toMatch(/export function initAutoUpdater[\s\S]*if \(isStoreBuild\(\)\)/)
  })
})
