/**
 * File-type awareness for non-image files.
 *
 * Maps a file path (by extension) to a stable category used for icon tinting,
 * labels, and kind badges, with the labels translated. The kind tables live in
 * fileKind.ts (no i18n), which the main process imports directly.
 */

import { t } from '../i18n'
import { EXT_MAP, KIND_INFO, fileKindOf, type FileKind, type FileKindInfo } from './fileKind'

export { extOf, fileIconUrl, fileKindOf } from './fileKind'
export type { FileKind, FileKindInfo } from './fileKind'

const KEY_MAP: Record<FileKind, any> = {
  pdf: 'fileKinds.pdf',
  word: 'fileKinds.word',
  excel: 'fileKinds.excel',
  powerpoint: 'fileKinds.powerpoint',
  archive: 'fileKinds.archive',
  text: 'fileKinds.text',
  code: 'fileKinds.code',
  audio: 'fileKinds.audio',
  video: 'fileKinds.video',
  image: 'fileKinds.image',
  executable: 'fileKinds.executable',
  folder: 'fileKinds.folder',
  file: 'fileKinds.file'
}

function translateKind(key: string, fallback: string): string {
  const val = t(key)
  if (!val || val.startsWith('fileKinds.') || val === key) return fallback
  return val
}

/** Resolve a file path to its display metadata (kind / label / color). */
export function getFileKind(path: string, isDirectory?: boolean): FileKindInfo {
  if (isDirectory) {
    const base = KIND_INFO.folder
    return {
      ...base,
      label: translateKind('fileKinds.folder', base.label)
    }
  }
  const kind = fileKindOf(path)
  const base = KIND_INFO[kind]
  return {
    ...base,
    label: translateKind(KEY_MAP[kind], base.label)
  }
}

/** Resolve from an already-extracted extension string. */
export function getFileKindByExt(ext: string, isDirectory?: boolean): FileKindInfo {
  if (isDirectory || ext.toLowerCase() === 'folder') {
    const base = KIND_INFO.folder
    return {
      ...base,
      label: translateKind('fileKinds.folder', base.label)
    }
  }
  const kind = EXT_MAP[ext.toLowerCase()] ?? 'file'
  const base = KIND_INFO[kind]
  return {
    ...base,
    label: translateKind(KEY_MAP[kind], base.label)
  }
}
