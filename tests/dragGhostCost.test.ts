import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Drag ghosts used to be rasterized on the main thread on every hover: Resvg
// loaded every installed font and re-ran each piece of file art's filters,
// freezing the shelf (every frame of its window passes through the main
// thread) for 200-550ms while scrolling or before a drag. These pin the fix.

const getItem = vi.fn((_id: string) => undefined)
const motionLeft = { ms: 0 }
vi.mock('../electron/main/state', () => ({ getStore: () => ({ get: getItem, getImagePath: () => '' }) }))
vi.mock('../electron/main/thumbnailCache', () => ({ uiMotionLeftMs: () => motionLeft.ms }))

const { prestageDrag } = await import('../electron/main/drag')
const { buildDragSvgFromArt, buildFileDragSvg, setFileIconAssetDir } = await import('../electron/main/fileSvg')

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('hover prestaging waits for the pointer to rest', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    getItem.mockClear()
    motionLeft.ms = 0
  })
  afterEach(() => vi.useRealTimers())

  it('cards crossed on the way (or scrolled past) are never prepared, only the one the pointer settles on', () => {
    for (const id of ['a', 'b', 'c', 'd']) {
      prestageDrag({ id })
      vi.advanceTimersByTime(60)
    }
    expect(getItem).not.toHaveBeenCalled()
    vi.advanceTimersByTime(150)
    expect(getItem).toHaveBeenCalledTimes(1)
    expect(getItem).toHaveBeenCalledWith('d')
  })

  it('waits out an opening or closing panel before doing the work', () => {
    motionLeft.ms = 300
    prestageDrag({ id: 'x' })
    vi.advanceTimersByTime(150)
    expect(getItem).not.toHaveBeenCalled()
    motionLeft.ms = 0
    vi.advanceTimersByTime(300)
    expect(getItem).toHaveBeenCalledWith('x')
  })
})

describe('ghosts are composed from art rasterized once', () => {
  setFileIconAssetDir(join(process.cwd(), 'resources', 'file-icons'))

  it('places the given bitmaps in the same layout as the vector ghost', () => {
    const png = (n: number) => `data:image/png;base64,ART${n}`
    const single = buildDragSvgFromArt([png(1)], 1)
    expect(single.match(/<image /g)?.length).toBe(1)
    expect(single).toContain('width="122" height="122"')
    expect(single).not.toContain('<text')

    const stack = buildDragSvgFromArt([png(1), png(2), png(3)], 7)
    expect(stack.match(/<image /g)?.length).toBe(3)
    expect(stack).toContain('width="142" height="142"')
    expect(stack).toContain('+7')
    // same transforms as the vector stack, bitmaps swapped in
    const strip = (s: string) => s.replace(/href="[^"]*"/g, 'href=""')
    expect(strip(stack)).toBe(strip(buildFileDragSvg(['pdf', 'excel', 'image'], 7)))
    expect(strip(single)).toBe(strip(buildFileDragSvg(['pdf'], 1)))
  })

  it('never loads every installed font, and keeps each kind\'s art on disk outside Chromium\'s Cache folder', () => {
    const drag = src('electron/main/drag.ts')
    const renders = drag.match(/new Resvg\([^)]*\)/g) ?? []
    expect(renders.length).toBeGreaterThanOrEqual(3)
    for (const r of renders) expect(r).toMatch(/font: /)
    // the full font scan stays only as the fallback for a missing Segoe UI file
    expect(drag.match(/loadSystemFonts: true/g)?.length).toBe(1)
    expect(drag).toMatch(/files\.every\(\(f\) => existsSync\(f\)\)[\s\S]{0,160}: \{ loadSystemFonts: true \}/)
    expect(drag).toMatch(/const BADGE_FONTS = \['segoeuib\.ttf'\]/)
    expect(drag).toMatch(/readFileSync\(join\(dir, name\)\)/)
    expect(src('electron/store/paths.ts')).toMatch(/dragArtDir: \(\) => join\(root\(\), 'drag-art'\)/)
  })

  it('pre-renders missing art only while the shelf is closed and still', () => {
    expect(src('electron/main/drag.ts')).toMatch(/if \(isBusy\(\) \|\| uiMotionLeftMs\(\) > 0\) \{/)
    expect(src('electron/main/index.ts')).toMatch(/prewarmDragIcons\(isInteractive\)/)
  })
})
