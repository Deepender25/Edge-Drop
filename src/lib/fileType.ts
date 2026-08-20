/**
 * File-type awareness for non-image files.
 *
 * Maps a file path (by extension) to a stable category used for icon tinting,
 * labels, and kind badges. Kept dependency-free: one small lookup table plus a
 * tinted-file-icon renderer, no per-format rendering libs.
 */

/** Semantic category a file falls into for display purposes. */
export type FileKind =
  | 'pdf'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'archive'
  | 'text'
  | 'code'
  | 'audio'
  | 'video'
  | 'image'
  | 'executable'
  | 'folder'
  | 'file' // generic fallback

export interface FileKindInfo {
  kind: FileKind
  /** Short human label, e.g. "PDF", "Word". */
  label: string
  /** Hex color used to tint the file icon / badge. */
  color: string
}

/** Extension sets per category. Compared case-insensitively. */
const EXT_MAP: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'word', docx: 'word', docm: 'word', odt: 'word', rtf: 'word', pages: 'word',
  xls: 'excel', xlsx: 'excel', xlsm: 'excel', csv: 'excel', ods: 'excel', numbers: 'excel',
  ppt: 'powerpoint', pptx: 'powerpoint', pptm: 'powerpoint', odp: 'powerpoint', key: 'powerpoint',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive', bz2: 'archive', xz: 'archive', iso: 'archive', dmg: 'archive',
  txt: 'text', md: 'text', markdown: 'text', log: 'text', rtf2: 'text',
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code', json: 'code', html: 'code', css: 'code', scss: 'code',
  py: 'code', java: 'code', c: 'code', cpp: 'code', cs: 'code', go: 'code', rs: 'code', rb: 'code',
  php: 'code', sh: 'code', yml: 'code', yaml: 'code', xml: 'code', sql: 'code', vue: 'code', svelte: 'code',
  mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', ogg: 'audio', m4a: 'audio', wma: 'audio',
  mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', wmv: 'video', flv: 'video', webm: 'video', m4v: 'video',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image', avif: 'image', ico: 'image',
  tif: 'image', tiff: 'image', jfif: 'image', pjpeg: 'image', pjp: 'image',
  exe: 'executable', msi: 'executable', bat: 'executable', cmd: 'executable', ps1: 'executable', apk: 'executable', app: 'executable', dll: 'executable'
}

const KIND_INFO: Record<FileKind, FileKindInfo> = {
  pdf: { kind: 'pdf', label: 'PDF', color: '#FF7C8E' },
  word: { kind: 'word', label: 'Word', color: '#7BAFF8' },
  excel: { kind: 'excel', label: 'Excel', color: '#52D7A4' },
  powerpoint: { kind: 'powerpoint', label: 'Slides', color: '#FFA25B' },
  archive: { kind: 'archive', label: 'Archive', color: '#FBBF24' },
  text: { kind: 'text', label: 'Text', color: '#8CA77B' },
  code: { kind: 'code', label: 'Code', color: '#53CAF7' },
  audio: { kind: 'audio', label: 'Audio', color: '#C495FD' },
  video: { kind: 'video', label: 'Video', color: '#64748B' },
  image: { kind: 'image', label: 'Image', color: '#BA9B7B' },
  executable: { kind: 'executable', label: 'App', color: '#93A4FC' },
  folder: { kind: 'folder', label: 'Folder', color: '#FBBF24' },
  file: { kind: 'file', label: 'File', color: '#B0C0D0' }
}

/** Extract the lowercase extension (no dot) from a path. */
export function extOf(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return ''
  // Guard against directory-ish trailing dots and keep it lowercase.
  return path.slice(dot + 1).toLowerCase()
}

import { t } from '../i18n'

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
  executable: 'fileKinds.file',
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
  const ext = extOf(path)
  const kind = EXT_MAP[ext] ?? 'file'
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
