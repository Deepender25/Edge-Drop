import { describe, expect, it, vi } from 'vitest'

// Minimal electron mock: signatureMatchesItem is pure string logic and never
// touches the clipboard itself; formats.ts only needs the module to resolve.
vi.mock('electron', () => ({
  clipboard: {
    availableFormats: vi.fn(() => []),
    readText: vi.fn(() => ''),
    readHTML: vi.fn(() => ''),
    readImage: vi.fn(() => ({ isEmpty: () => true })),
    readBuffer: vi.fn(() => Buffer.alloc(0))
  }
}))

import { signatureMatchesItem } from '../electron/clipboard/formats'
import type { ItemData } from '../shared/types'

describe('signatureMatchesItem — ownership matching with seq prefixes', () => {
  it('matches TEXT content even when the Win32 sequence prefix is present', () => {
    // THE REGRESSION: GetClipboardSequenceNumber() is virtually always > 0 on
    // Windows, so real signatures carry `seq:<n>:`. The old raw comparison
    // could therefore NEVER match text — deleted items whose content sat on
    // the clipboard were never cleared and could reappear later.
    const data: ItemData = { kind: 'text', text: 'secret token 123', isUrl: false }
    expect(signatureMatchesItem('seq:4821:text:secret token 123', data)).toBe(true)
    expect(signatureMatchesItem('text:secret token 123', data)).toBe(true) // no-prefix fallback
    expect(signatureMatchesItem('seq:4821:text:different', data)).toBe(false)
    expect(signatureMatchesItem('seq:4821:empty', data)).toBe(false)
  })

  it('matches URL text items the same as plain text', () => {
    const data: ItemData = { kind: 'text', text: 'https://example.com/a', isUrl: true }
    expect(signatureMatchesItem('seq:9:text:https://example.com/a', data)).toBe(true)
  })

  it('matches FILES by exact path list, ignoring the sequence number', () => {
    const data: ItemData = { kind: 'files', paths: ['C:\\a.pdf', 'C:\\b.txt'] }
    expect(signatureMatchesItem('seq:7:files:C:\\a.pdf\nC:\\b.txt', data)).toBe(true)
    expect(signatureMatchesItem('seq:7:files:C:\\a.pdf', data)).toBe(false)
    expect(signatureMatchesItem('seq:8:files:C:\\a.pdf\nC:\\b.txt', data)).toBe(true) // new seq, same content
  })

  it('matches IMAGE by dimension prefix (documented heuristic, no pixel read)', () => {
    const data: ItemData = { kind: 'image', imageId: 'x', width: 1920, height: 1080, bytes: 10 }
    expect(signatureMatchesItem('seq:3:image:1920x1080:abc123', data)).toBe(true)
    expect(signatureMatchesItem('image:1920x1080:abc123', data)).toBe(true)
    expect(signatureMatchesItem('seq:3:image:800x600:abc123', data)).toBe(false)
  })

  it('treats any image on the clipboard as owned by an image-collection (conservative)', () => {
    const data: ItemData = { kind: 'image-collection', images: [] }
    expect(signatureMatchesItem('seq:3:image:100x100:zzz', data)).toBe(true)
    expect(signatureMatchesItem('seq:3:text:hello', data)).toBe(false)
  })
})
