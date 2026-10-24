/**
 * File kind by extension: the pure, dependency-free part of fileType.ts.
 *
 * Kept separate because the main process needs the kind (drag icons) and
 * nothing else; fileType.ts adds translated labels, and importing it would
 * pull the i18n module and with it the renderer's whole store (and sound,
 * emoji, ...) into the main-process bundle.
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
export const EXT_MAP: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'word', docx: 'word', docm: 'word', odt: 'word', rtf: 'word', pages: 'word',
  xls: 'excel', xlsx: 'excel', xlsm: 'excel', csv: 'excel', ods: 'excel', numbers: 'excel',
  ppt: 'powerpoint', pptx: 'powerpoint', pptm: 'powerpoint', odp: 'powerpoint', key: 'powerpoint',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive', bz2: 'archive', xz: 'archive', iso: 'archive',
  txt: 'text', md: 'text', markdown: 'text', log: 'text', rtf2: 'text',
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code', json: 'code', html: 'code', css: 'code', scss: 'code',
  py: 'code', java: 'code', c: 'code', cpp: 'code', cs: 'code', go: 'code', rs: 'code', rb: 'code',
  php: 'code', sh: 'code', yml: 'code', yaml: 'code', xml: 'code', sql: 'code', vue: 'code', svelte: 'code',
  mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', ogg: 'audio', m4a: 'audio', wma: 'audio',
  mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', wmv: 'video', flv: 'video', webm: 'video', m4v: 'video',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image', avif: 'image', ico: 'image',
  tif: 'image', tiff: 'image', jfif: 'image', pjpeg: 'image', pjp: 'image',
  exe: 'executable', msi: 'executable', bat: 'executable', cmd: 'executable', ps1: 'executable', apk: 'executable', app: 'executable', dll: 'executable', dmg: 'executable', pkg: 'executable', deb: 'executable', rpm: 'executable', appx: 'executable', msix: 'executable', appinstaller: 'executable',
  folder: 'folder'
}

export const KIND_INFO: Record<FileKind, FileKindInfo> = {
  pdf: { kind: 'pdf', label: 'PDF', color: '#EF4444' },
  word: { kind: 'word', label: 'Word', color: '#3B9CFF' },
  excel: { kind: 'excel', label: 'Excel', color: '#10B981' },
  powerpoint: { kind: 'powerpoint', label: 'Slides', color: '#FF6B35' },
  archive: { kind: 'archive', label: 'Archive', color: '#F59E0B' },
  text: { kind: 'text', label: 'Text', color: '#94A3B8' },
  code: { kind: 'code', label: 'Code', color: '#818CF8' },
  audio: { kind: 'audio', label: 'Audio', color: '#F43F5E' },
  video: { kind: 'video', label: 'Video', color: '#A855F7' },
  image: { kind: 'image', label: 'Image', color: '#06B6D4' },
  executable: { kind: 'executable', label: 'Installer', color: '#F59E0B' },
  folder: { kind: 'folder', label: 'Folder', color: '#FFDA44' },
  file: { kind: 'file', label: 'File', color: '#CBD5E1' }
}

/** Extract the lowercase extension (no dot) from a path. */
export function extOf(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return ''
  // Guard against directory-ish trailing dots and keep it lowercase.
  return path.slice(dot + 1).toLowerCase()
}

/** The kind alone (same answer as `getFileKind(path, isDirectory).kind`). */
export function fileKindOf(path: string, isDirectory?: boolean): FileKind {
  if (isDirectory) return 'folder'
  return EXT_MAP[extOf(path)] ?? 'file'
}

/**
 * edgelocal:// URL for a file-kind folder icon (SVG, see resources/file-icons).
 * Same hardcoded-scheme convention as the emoji catalog (`edgelocal://emoji/…`).
 */
export function fileIconUrl(kind: FileKind): string {
  return `edgelocal://icon/${kind}.svg`
}
