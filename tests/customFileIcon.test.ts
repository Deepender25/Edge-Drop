import { describe, it, expect } from 'vitest'
import { getFileKindByExt, getFileKind } from '../src/lib/fileType'

describe('Custom File Category & Pastel Theme Palette', () => {
  it('correctly maps document formats with authentic pastel colors', () => {
    const pdf = getFileKindByExt('pdf')
    expect(pdf.kind).toBe('pdf')
    expect(pdf.color).toBe('#FF7C8E')

    const docx = getFileKindByExt('docx')
    expect(docx.kind).toBe('word')
    expect(docx.color).toBe('#7BAFF8')

    const xlsx = getFileKindByExt('xlsx')
    expect(xlsx.kind).toBe('excel')
    expect(xlsx.color).toBe('#52D7A4')

    const pptx = getFileKindByExt('pptx')
    expect(pptx.kind).toBe('powerpoint')
    expect(pptx.color).toBe('#FFA25B')

    const txt = getFileKindByExt('txt')
    expect(txt.kind).toBe('text')
    expect(txt.color).toBe('#8CA77B')
  })

  it('correctly maps code and developer formats with cyan pastel', () => {
    const ts = getFileKindByExt('ts')
    expect(ts.kind).toBe('code')
    expect(ts.color).toBe('#53CAF7')

    const py = getFileKindByExt('py')
    expect(py.kind).toBe('code')
    expect(py.color).toBe('#53CAF7')
  })

  it('correctly maps media formats with respective pastel tones', () => {
    const png = getFileKindByExt('png')
    expect(png.kind).toBe('image')
    expect(png.color).toBe('#BA9B7B')

    const mp4 = getFileKindByExt('mp4')
    expect(mp4.kind).toBe('video')
    expect(mp4.color).toBe('#64748B')

    const mp3 = getFileKindByExt('mp3')
    expect(mp3.kind).toBe('audio')
    expect(mp3.color).toBe('#C495FD')
  })

  it('correctly maps archives with warm honey amber pastel', () => {
    const zip = getFileKindByExt('zip')
    expect(zip.kind).toBe('archive')
    expect(zip.color).toBe('#FBBF24')
  })

  it('correctly maps folders with warm golden pastel', () => {
    const folder = getFileKindByExt('folder', true)
    expect(folder.kind).toBe('folder')
    expect(folder.color).toBe('#FBBF24')

    const folderPath = getFileKind('C:\\my\\folder', true)
    expect(folderPath.kind).toBe('folder')
    expect(folderPath.color).toBe('#FBBF24')
  })

  it('correctly maps executables and system binaries', () => {
    const exe = getFileKindByExt('exe')
    expect(exe.kind).toBe('executable')
    expect(exe.color).toBe('#93A4FC')

    const msi = getFileKindByExt('msi')
    expect(msi.kind).toBe('executable')
    expect(msi.color).toBe('#93A4FC')
  })

  it('resolves unknown files to neutral slate fallback', () => {
    const unknown = getFileKind('C:\\file\\mystery.xyz123')
    expect(unknown.kind).toBe('file')
    expect(unknown.color).toBe('#B0C0D0')

    const noExtFile = getFileKind('C:\\file\\mysteryfile', false)
    expect(noExtFile.kind).toBe('file')
    expect(noExtFile.color).toBe('#B0C0D0')
  })

  it('resolves directory path with or without dots as folder when isDirectory is true', () => {
    const dotFolder = getFileKind('C:\\Projects\\my.folder.name', true)
    expect(dotFolder.kind).toBe('folder')
    expect(dotFolder.color).toBe('#FBBF24')

    const plainFolder = getFileKind('C:\\Projects\\myFolder', true)
    expect(plainFolder.kind).toBe('folder')
    expect(plainFolder.color).toBe('#FBBF24')
  })
})
