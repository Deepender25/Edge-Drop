import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..')
const read = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8')

describe('macOS port contracts', () => {
  const pkg = JSON.parse(read('package.json'))

  it('provides dedicated development, packaging, and release commands', () => {
    expect(pkg.scripts['dev:mac']).toContain('build:mac-helper')
    expect(pkg.scripts['build:mac']).toContain('electron-builder --mac')
    expect(pkg.scripts['build:mac:release']).toContain('electron-builder --mac')
  })

  it('packages a menu-bar app and only the macOS native helper', () => {
    expect(pkg.build.mac.extendInfo.LSUIElement).toBe(true)
    expect(pkg.build.mac.extraResources).toContainEqual({
      from: 'resources/macos/bin/EdgeDropMacHelper',
      to: 'macos/EdgeDropMacHelper'
    })
    expect(pkg.build.mac.extraResources).not.toContainEqual(expect.objectContaining({
      from: expect.stringContaining('EdgeDropStartup.exe')
    }))
    expect(existsSync(join(root, pkg.build.mac.icon))).toBe(true)
  })

  it('uses native pasteboard, Command+V, and fullscreen APIs', () => {
    const source = read('resources/macos/EdgeDropMacHelper.swift')
    expect(source).toContain('NSPasteboard.general')
    expect(source).toContain('.urlReadingFileURLsOnly')
    expect(source).toContain('pasteboard.writeObjects')
    expect(source).toContain('down.flags = .maskCommand')
    expect(source).toContain('CGWindowListCopyWindowInfo')
  })

  it('keeps the panel across Spaces and out of Mission Control', () => {
    const source = read('electron/main/window.ts')
    expect(source).toContain('setVisibleOnAllWorkspaces(true')
    expect(source).toContain('visibleOnFullScreen: true')
    expect(source).toContain('setHiddenInMissionControl(true)')
  })

  it('allows packaged data fonts under the renderer CSP', () => {
    expect(read('index.html')).toContain("font-src 'self' data:")
  })
})
