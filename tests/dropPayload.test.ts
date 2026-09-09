import { describe, expect, it } from 'vitest'
import { filePathsFromUriList, hasExternalDragPayload } from '../shared/dropPayload'

describe('external drop payloads', () => {
  it('recognizes Finder URI-list drags as external content', () => {
    expect(hasExternalDragPayload(['text/uri-list'])).toBe(true)
    expect(hasExternalDragPayload(['public.file-url'])).toBe(true)
    expect(hasExternalDragPayload(['application/octet-stream'])).toBe(false)
  })

  it('decodes macOS Finder file URLs and ignores comments', () => {
    expect(filePathsFromUriList(
      '# Finder item\nfile:///Users/demo/Pictures/photo%20one.png\nhttps://example.com',
      'darwin'
    )).toEqual(['/Users/demo/Pictures/photo one.png'])
  })

  it('supports multiple unique files in one drop', () => {
    expect(filePathsFromUriList(
      'file:///tmp/one.png\r\nfile:///tmp/two.png\r\nfile:///tmp/one.png',
      'darwin'
    )).toEqual(['/tmp/one.png', '/tmp/two.png'])
  })

  it('normalizes Windows drive-letter file URLs', () => {
    expect(filePathsFromUriList('file:///C:/Users/demo/photo.png', 'win32'))
      .toEqual(['C:\\Users\\demo\\photo.png'])
  })
})
