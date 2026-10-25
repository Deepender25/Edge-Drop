import { afterAll, describe, expect, it } from 'vitest'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildFileDragSvg, dragSvgHasArt, setFileIconAssetDir } from '../electron/main/fileSvg'

const real = join(process.cwd(), 'resources', 'file-icons')
const tmp = mkdtempSync(join(tmpdir(), 'edge-drag-art-'))
afterAll(() => {
  setFileIconAssetDir(real)
  rmSync(tmp, { recursive: true, force: true })
})

describe('drag ghost art loading', () => {
  it('real icons: every ghost carries art', () => {
    setFileIconAssetDir(real)
    expect(dragSvgHasArt(buildFileDragSvg(['pdf'], 1))).toBe(true)
    expect(dragSvgHasArt(buildFileDragSvg(['pdf', 'excel', 'folder'], 3))).toBe(true)
  })

  it('a missing file is not remembered: art that appears later is used on the next drag', () => {
    setFileIconAssetDir(tmp) // empty folder
    expect(dragSvgHasArt(buildFileDragSvg(['pdf'], 1))).toBe(false)
    copyFileSync(join(real, 'pdf.svg'), join(tmp, 'pdf.svg'))
    // no cache reset: the earlier miss must not stick
    expect(dragSvgHasArt(buildFileDragSvg(['pdf'], 1))).toBe(true)
  })

  it('a kind without its own file borrows the generic file art', () => {
    copyFileSync(join(real, 'file.svg'), join(tmp, 'file.svg'))
    const svg = buildFileDragSvg(['audio'], 1)
    expect(dragSvgHasArt(svg)).toBe(true)
    const generic = buildFileDragSvg(['file'], 1)
    expect(svg).toBe(generic)
  })

  it('the drag code never rasterizes or caches a ghost without art', async () => {
    const { readFileSync } = await import('node:fs')
    const drag = readFileSync(join(process.cwd(), 'electron', 'main', 'drag.ts'), 'utf8')
    expect(drag).toMatch(/const svg = buildDragSvgFromArt\(kinds\.map\(\(kind\) => pngUri\(kindArtPng\(kind\)\)\), count\)\s+[\s\S]{0,200}if \(!dragSvgHasArt\(svg\)\) return getFileDragIcon\(\)\s+try \{\s+const resvg = new Resvg/)
    // a kind's art is only rasterized (and cached) when it has art
    expect(drag).toMatch(/const svg = buildFileDragSvg\(\[kind\], 1\)\s+if \(!dragSvgHasArt\(svg\)\) return null/)
  })
})
