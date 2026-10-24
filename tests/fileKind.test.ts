import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { EXT_MAP, fileKindOf } from '../src/lib/fileKind'
import { getFileKind } from '../src/lib/fileType'

describe('fileKind (the i18n-free half of fileType)', () => {
  it('gives the same kind as getFileKind for every known extension, unknown ones and folders', () => {
    const paths = [...Object.keys(EXT_MAP).map((ext) => `C:/x/file.${ext}`), 'C:/x/FILE.PDF', 'C:/x/noext', 'C:/x/a.unknownext', 'C:/x/dir.']
    for (const p of paths) {
      expect(fileKindOf(p), p).toBe(getFileKind(p).kind)
      expect(fileKindOf(p, true), p).toBe(getFileKind(p, true).kind)
    }
  })

  it('the main process never imports renderer-only modules (i18n, store) through fileType', () => {
    const dir = join(__dirname, '..', 'electron', 'main')
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src, f).not.toMatch(/from '\.\.\/\.\.\/src\/lib\/fileType'/)
      expect(src, f).not.toMatch(/from '\.\.\/\.\.\/src\/(i18n'|i18n\/index|store\/)/)
    }
  })
})
