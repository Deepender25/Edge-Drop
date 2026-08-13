import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveStoredImage, thumbnailUrlForFile, thumbnailUrlForStoredImage } from '../electron/main/imageProtocol'

describe('resolveStoredImage', () => {
  let imagesDir: string

  beforeEach(() => {
    imagesDir = join(tmpdir(), `edge-drop-image-protocol-${process.pid}-${Date.now()}`)
    mkdirSync(imagesDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(imagesDir, { recursive: true, force: true })
  })

  it('resolves a non-PNG image staged with its original extension', () => {
    const id = 'image-abc123'
    const filePath = join(imagesDir, `${id}.jpg`)
    writeFileSync(filePath, Buffer.from([0xff, 0xd8, 0xff]))

    expect(resolveStoredImage(imagesDir, id)).toEqual({
      filePath,
      contentType: 'image/jpeg'
    })
  })

  it('continues to resolve PNG clipboard captures', () => {
    const id = 'image-def456'
    const filePath = join(imagesDir, `${id}.png`)
    writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    expect(resolveStoredImage(imagesDir, id)).toEqual({
      filePath,
      contentType: 'image/png'
    })
  })

  it('rejects malformed ids instead of normalizing them to another image', () => {
    writeFileSync(join(imagesDir, 'secret.png'), Buffer.from('secret'))

    expect(resolveStoredImage(imagesDir, '../secret')).toBeNull()
    expect(resolveStoredImage(imagesDir, 'secret.png')).toBeNull()
  })

  it('uses the bounded thumbnail endpoint for staged images', () => {
    expect(thumbnailUrlForStoredImage('image-abc123')).toBe('edgelocal://thumb/image-abc123')
  })

  it('encodes file thumbnail paths without exposing a raw Windows path', () => {
    expect(thumbnailUrlForFile('C:\\Pictures\\image one.png'))
      .toBe('edgelocal://thumb/file/C%3A%2FPictures%2Fimage%20one.png')
  })
})
