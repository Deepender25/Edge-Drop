import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { fileIconUrl, type FileKind } from '../src/lib/fileType'
import { resolveIconAsset } from '../electron/main/imageProtocol'

const ALL_KINDS: FileKind[] = [
  'pdf', 'word', 'excel', 'powerpoint', 'archive', 'text', 'code',
  'audio', 'video', 'image', 'executable', 'folder', 'file'
]

describe('vintage PNG file icons', () => {
  it('fileIconUrl points every kind at its edgelocal icon', () => {
    for (const kind of ALL_KINDS) {
      expect(fileIconUrl(kind)).toBe(`edgelocal://icon/${kind}.png`)
    }
  })

  it('resolveIconAsset accepts the 13 icon names in resources/file-icons', () => {
    const dir = join(process.cwd(), 'resources', 'file-icons')
    for (const kind of ALL_KINDS) {
      const resolved = resolveIconAsset(dir, `${kind}.png`)
      expect(resolved).toBeTruthy()
      expect(resolved?.toLowerCase().endsWith(`${kind}.png`)).toBe(true)
    }
  })

  it('resolveIconAsset rejects traversal, wrong types, and unknown names', () => {
    const dir = join(process.cwd(), 'resources', 'file-icons')
    expect(resolveIconAsset(dir, '../settings.json')).toBeNull()
    expect(resolveIconAsset(dir, '..\\settings.json')).toBeNull()
    expect(resolveIconAsset(dir, 'evil.svg')).toBeNull()
    expect(resolveIconAsset(dir, 'nope.png')).toBeNull()
    expect(resolveIconAsset(dir, '')).toBeNull()
  })
})
