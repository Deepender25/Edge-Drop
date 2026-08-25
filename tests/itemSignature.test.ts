import { describe, expect, it } from 'vitest'
import { itemRenderKey } from '../src/lib/itemSignature'
import type { ClipboardItemDto } from '../shared/types'

function textItem(over: Partial<Extract<ClipboardItemDto['data'], { kind: 'text' }>> = {}): ClipboardItemDto {
  return {
    id: 't1',
    capturedAt: 111,
    hitCount: 1,
    pinned: false,
    data: { kind: 'text', text: 'hello world', isUrl: false, ...over }
  }
}

function imageItem(over: Partial<Extract<ClipboardItemDto['data'], { kind: 'image' }>> = {}): ClipboardItemDto {
  return {
    id: 'i1',
    capturedAt: 222,
    hitCount: 1,
    pinned: false,
    data: {
      kind: 'image',
      imageId: 'img-1',
      width: 1920,
      height: 1080,
      bytes: 50000,
      ext: 'png',
      preview: 'edgelocal://thumb/img-1',
      ...over
    }
  }
}

describe('itemRenderKey — memo comparator foundation', () => {
  it('produces identical keys for identical content with DIFFERENT object identities', () => {
    // This is the exact production scenario: every state:items push rebuilds
    // all DTO objects; identity-based memo compare used to defeat React.memo.
    const a = imageItem()
    const b = JSON.parse(JSON.stringify(imageItem())) as ClipboardItemDto
    expect(a === b).toBe(false)
    expect(itemRenderKey(a)).toBe(itemRenderKey(b))
  })

  it('text: any rendered field change flips the key', () => {
    const base = itemRenderKey(textItem())
    expect(itemRenderKey(textItem({ text: 'changed' }))).not.toBe(base)
    expect(itemRenderKey(textItem({ isUrl: true }))).not.toBe(base)
  })

  it('image: thumbnail/dimension/size changes flip the key', () => {
    const base = itemRenderKey(imageItem())
    expect(itemRenderKey(imageItem({ preview: 'edgelocal://thumb/other' }))).not.toBe(base)
    expect(itemRenderKey(imageItem({ bytes: 123456 }))).not.toBe(base)
    expect(itemRenderKey(imageItem({ width: 800, height: 600 }))).not.toBe(base)
    expect(itemRenderKey(imageItem({ fileName: 'shot.png' }))).not.toBe(base)
  })

  it('collection: adding/removing/replacing an image flips the key', () => {
    const make = (ids: string[]): ClipboardItemDto => ({
      id: 'c1',
      capturedAt: 1,
      hitCount: 1,
      pinned: false,
      data: {
        kind: 'image-collection',
        images: ids.map((imageId) => ({ imageId, width: 10, height: 10, bytes: 5, preview: `u/${imageId}` }))
      }
    })
    const base = itemRenderKey(make(['a', 'b']))
    expect(itemRenderKey(make(['a']))).not.toBe(base)
    expect(itemRenderKey(make(['a', 'b', 'c']))).not.toBe(base)
    expect(itemRenderKey(make(['b', 'a']))).not.toBe(base) // order matters visually
    expect(itemRenderKey(make(['a', 'b']))).toBe(base)
  })

  it('files: path or entry metadata changes flip the key; identical bundles do not', () => {
    const make = (
      paths: string[] = ['/docs/a.pdf', '/docs/b.txt'],
      entryOverrides: Partial<{ size: number; preview: string }> = {}
    ): ClipboardItemDto => ({
      id: 'f1',
      capturedAt: 1,
      hitCount: 1,
      pinned: false,
      data: {
        kind: 'files',
        paths,
        entries: paths.map((p) => ({
          name: p,
          ext: 'pdf',
          size: 10,
          isImage: false,
          ...entryOverrides
        }))
      }
    })
    const base = itemRenderKey(make())
    expect(itemRenderKey(make())).toBe(base)
    expect(itemRenderKey(make(undefined, { size: 999 }))).not.toBe(base)
    expect(itemRenderKey(make(undefined, { preview: 'edgelocal://thumb/file/x' }))).not.toBe(base)
    expect(itemRenderKey(make(['/docs/b.txt', '/docs/a.pdf']))).not.toBe(base)
  })

  it('top-level card fields are compared by the memo wrapper, key stays data-only by design', () => {
    // The comparator checks pinned/hitCount/capturedAt/id separately from the
    // render key, so the key itself intentionally ignores them.
    const a = imageItem()
    const b = imageItem()
    b.pinned = true
    b.hitCount = 7
    expect(itemRenderKey(a)).toBe(itemRenderKey(b))
  })
})
