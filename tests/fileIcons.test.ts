import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileIconUrl, type FileKind } from '../src/lib/fileType'
import { resolveIconAsset } from '../electron/main/imageProtocol'
import { FILE_ICON_MASK } from '../src/components/CustomFileIcon'

const ALL_KINDS: FileKind[] = [
  'pdf', 'word', 'excel', 'powerpoint', 'archive', 'text', 'code',
  'audio', 'video', 'image', 'executable', 'folder', 'file'
]
const dir = join(process.cwd(), 'resources', 'file-icons')

describe('SVG file icons', () => {
  it('fileIconUrl points every kind at its edgelocal icon', () => {
    for (const kind of ALL_KINDS) {
      expect(fileIconUrl(kind)).toBe(`edgelocal://icon/${kind}.svg`)
    }
  })

  it('the folder holds exactly the 13 icons', () => {
    expect(readdirSync(dir).sort()).toEqual(ALL_KINDS.map((k) => `${k}.svg`).sort())
  })

  it('resolveIconAsset accepts the 13 icon names in resources/file-icons', () => {
    for (const kind of ALL_KINDS) {
      const resolved = resolveIconAsset(dir, `${kind}.svg`)
      expect(resolved).toBeTruthy()
      expect(resolved?.toLowerCase().endsWith(`${kind}.svg`)).toBe(true)
    }
  })

  it('resolveIconAsset rejects traversal, wrong types, and unknown names', () => {
    expect(resolveIconAsset(dir, '../settings.json')).toBeNull()
    expect(resolveIconAsset(dir, '..\\settings.json')).toBeNull()
    expect(resolveIconAsset(dir, 'evil.svg')).toBeNull()
    expect(resolveIconAsset(dir, 'pdf.png')).toBeNull()
    expect(resolveIconAsset(dir, 'nope.svg')).toBeNull()
    expect(resolveIconAsset(dir, '')).toBeNull()
  })

  it('every icon is self-contained art: no script, events, external links or foreign content', () => {
    for (const kind of ALL_KINDS) {
      const svg = readFileSync(join(dir, `${kind}.svg`), 'utf8')
      expect(svg, kind).not.toMatch(/<script|<foreignObject|<image|\son[a-z]+\s*=|javascript:|@import/i)
      // every reference is to an id inside the same file
      for (const m of svg.matchAll(/(?:href|url\()\s*=?\s*["(]?([^")\s]+)/g)) {
        expect(m[1].startsWith('#'), `${kind}: ${m[1]}`).toBe(true)
      }
    }
  })

  it('every icon is square and cropped to the folder the same way', () => {
    for (const kind of ALL_KINDS) {
      const root = readFileSync(join(dir, `${kind}.svg`), 'utf8').match(/<svg[^>]*>/)![0]
      expect(root, kind).toContain('viewBox="64 60 384 384"')
      expect(root, kind).toContain('width="384" height="384"')
    }
  })

  it('the photo mask uses the same frame and the folder outline from the art', () => {
    expect(FILE_ICON_MASK).toContain("viewBox='64 60 384 384'")
    const folder = readFileSync(join(dir, 'folder.svg'), 'utf8')
    const front = folder.match(/<path id="folder-front" d="([^"]+)"/)![1]
    expect(FILE_ICON_MASK).toContain(front)
    expect(folder).toContain('<rect id="folder-panel" x="120" y="118" width="272" height="246" rx="24"/>')
    expect(FILE_ICON_MASK).toContain("<rect x='120' y='118' width='272' height='246' rx='24'/>")
    expect(folder).toContain('<g transform="translate(0 14)">')
    expect(FILE_ICON_MASK).toContain("translate(0 14)")
  })
})
