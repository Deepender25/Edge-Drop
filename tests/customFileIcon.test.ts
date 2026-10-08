import { describe, it, expect } from 'vitest'
import { getFileKindByExt, getFileKind } from '../src/lib/fileType'

describe('Custom File Category & 3D Folder Theme Palette', () => {
  it('correctly maps document formats with authentic 3D folder colors', () => {
    const pdf = getFileKindByExt('pdf')
    expect(pdf.kind).toBe('pdf')
    expect(pdf.color).toBe('#EF4444')

    const docx = getFileKindByExt('docx')
    expect(docx.kind).toBe('word')
    expect(docx.color).toBe('#3B9CFF')

    const xlsx = getFileKindByExt('xlsx')
    expect(xlsx.kind).toBe('excel')
    expect(xlsx.color).toBe('#10B981')

    const pptx = getFileKindByExt('pptx')
    expect(pptx.kind).toBe('powerpoint')
    expect(pptx.color).toBe('#FF6B35')

    const txt = getFileKindByExt('txt')
    expect(txt.kind).toBe('text')
    expect(txt.color).toBe('#94A3B8')
  })

  it('correctly maps code and developer formats with indigo highlight', () => {
    const ts = getFileKindByExt('ts')
    expect(ts.kind).toBe('code')
    expect(ts.color).toBe('#818CF8')

    const py = getFileKindByExt('py')
    expect(py.kind).toBe('code')
    expect(py.color).toBe('#818CF8')
  })

  it('correctly maps media formats with respective tones', () => {
    const png = getFileKindByExt('png')
    expect(png.kind).toBe('image')
    expect(png.color).toBe('#06B6D4')

    const mp4 = getFileKindByExt('mp4')
    expect(mp4.kind).toBe('video')
    expect(mp4.color).toBe('#A855F7')

    const mp3 = getFileKindByExt('mp3')
    expect(mp3.kind).toBe('audio')
    expect(mp3.color).toBe('#F43F5E')
  })

  it('correctly maps archives with warm amber tone', () => {
    const zip = getFileKindByExt('zip')
    expect(zip.kind).toBe('archive')
    expect(zip.color).toBe('#F59E0B')
  })

  it('correctly maps folders with warm radiant golden tone', () => {
    const folder = getFileKindByExt('folder', true)
    expect(folder.kind).toBe('folder')
    expect(folder.color).toBe('#FFDA44')

    const folderPath = getFileKind('C:\\my\\folder', true)
    expect(folderPath.kind).toBe('folder')
    expect(folderPath.color).toBe('#FFDA44')
  })

  it('correctly maps executables and system binaries', () => {
    const exe = getFileKindByExt('exe')
    expect(exe.kind).toBe('executable')
    expect(exe.color).toBe('#F59E0B')

    const msi = getFileKindByExt('msi')
    expect(msi.kind).toBe('executable')
    expect(msi.color).toBe('#F59E0B')
  })

  it('resolves unknown files to neutral slate fallback', () => {
    const unknown = getFileKind('C:\\file\\mystery.xyz123')
    expect(unknown.kind).toBe('file')
    expect(unknown.color).toBe('#CBD5E1')

    const noExtFile = getFileKind('C:\\file\\mysteryfile', false)
    expect(noExtFile.kind).toBe('file')
    expect(noExtFile.color).toBe('#CBD5E1')
  })

  it('resolves directory path with or without dots as folder when isDirectory is true', () => {
    const dotFolder = getFileKind('C:\\Projects\\my.folder.name', true)
    expect(dotFolder.kind).toBe('folder')
    expect(dotFolder.color).toBe('#FFDA44')

    const plainFolder = getFileKind('C:\\Projects\\myFolder', true)
    expect(plainFolder.kind).toBe('folder')
    expect(plainFolder.color).toBe('#FFDA44')
  })
})
