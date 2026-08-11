/**
 * Official Lucide React Icon Suite for Edge-Drop.
 * Powered by lucide-react — ultra-crisp 24x24 vector icons.
 */
import type { SVGProps, JSX } from 'react'
import {
  Info,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Search,
  Pin,
  Trash2,
  Copy,
  Settings as SettingsGear,
  GripVertical,
  File,
  Image as ImageGraphic,
  Link,
  X,
  Minus,
  ArrowDownToLine,
  Layers,
  Maximize2,
  Minimize2,
  FolderOpen,
  Check,
  FileText,
  FileCode,
  FileArchive,
  FileSpreadsheet,
  Music,
  Video,
  Presentation,
  LogOut,
  Coffee,
  Heart,
  Star
} from 'lucide-react'
import { getFileKindByExt } from '../lib/fileType'

type P = SVGProps<SVGSVGElement>

export const CoffeeIcon = (p: P) => <Coffee size={p.width ?? 16} strokeWidth={2.2} {...(p as any)} />
export const HeartIcon = (p: P) => <Heart size={p.width ?? 16} strokeWidth={2.2} {...(p as any)} />
export const StarIcon = (p: P) => <Star size={p.width ?? 16} strokeWidth={2.2} {...(p as any)} />
export const GlobeIcon = (p: P) => (
  <svg viewBox="0 0 32 32" width={p.width ?? 16} height={p.height ?? 16} fill="currentColor" {...(p as any)}>
    <path d="M32.032 16c0-8.501-6.677-15.472-15.072-15.969-0.173-0.019-0.346-0.032-0.523-0.032-0.052 0-0.104 0.005-0.156 0.007-0.093-0.002-0.186-0.007-0.281-0.007-8.84 0-16.032 7.178-16.032 16.001s7.192 16.001 16.032 16.001c0.094 0 0.188-0.006 0.281-0.008 0.052 0.002 0.104 0.008 0.156 0.008 0.176 0 0.349-0.012 0.523-0.032 8.395-0.497 15.072-7.468 15.072-15.969zM29.049 21.151c-0.551-0.16-1.935-0.507-4.377-0.794 0.202-1.381 0.313-2.84 0.313-4.357 0-1.196-0.069-2.354-0.197-3.469 3.094-0.37 4.45-0.835 4.54-0.867l-0.372-1.050c0.695 1.659 1.080 3.478 1.080 5.386 0 1.818-0.352 3.555-0.987 5.151zM8.921 16c0-1.119 0.074-2.212 0.21-3.263 1.621 0.127 3.561 0.222 5.839 0.243v6.939c-2.219 0.021-4.114 0.111-5.709 0.234-0.22-1.319-0.34-2.715-0.34-4.154zM16.967 2.132c2.452 0.711 4.552 4.115 5.492 8.628-1.512 0.12-3.332 0.209-5.492 0.229v-8.857zM14.971 2.156v8.832c-2.136-0.021-3.965-0.109-5.502-0.226 0.96-4.457 3.076-7.836 5.502-8.606zM14.971 21.913l0 7.929c-2.263-0.718-4.256-3.705-5.293-7.719 1.492-0.11 3.253-0.189 5.292-0.21zM16.967 29.868l-0-7.955c2.061 0.020 3.814 0.102 5.288 0.217-1.019 4.067-3 7.076-5.288 7.738zM16.967 19.92l0-6.939c2.291-0.021 4.218-0.118 5.818-0.25 0.131 1.053 0.203 2.147 0.203 3.268 0 1.442-0.116 2.84-0.329 4.16-1.575-0.128-3.462-0.219-5.692-0.24zM28.588 9.81c-0.302 0.094-1.564 0.453-4.094 0.751-0.564-2.998-1.584-5.561-2.91-7.412 3.048 1.325 5.535 3.697 7.005 6.661zM11.213 2.831c-1.632 1.873-2.963 4.568-3.691 7.754-2.265-0.245-3.623-0.534-4.166-0.665 1.585-3.27 4.407-5.836 7.856-7.088zM2.614 11.787c0.385 0.104 1.841 0.467 4.549 0.766-0.155 1.107-0.24 2.26-0.24 3.447 0 1.509 0.136 2.96 0.383 4.334-2.325 0.251-3.755 0.552-4.396 0.706-0.607-1.566-0.944-3.264-0.944-5.041 0-1.467 0.228-2.883 0.649-4.213zM3.784 22.886c0.727-0.154 2.029-0.39 3.956-0.591 0.759 2.803 1.993 5.175 3.473 6.874-3.16-1.148-5.79-3.398-7.429-6.282v0zM21.583 28.849c1.195-1.665 2.14-3.907 2.728-6.525 1.982 0.227 3.226 0.494 3.853 0.652-1.5 2.596-3.808 4.669-6.581 5.873z" />
  </svg>
)

export const KofiLogo = (p: P) => (
  <svg viewBox="0 0 24 24" width={p.width ?? 18} height={p.height ?? 18} fill="currentColor" {...(p as any)}>
    <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z" />
  </svg>
)

export const GithubOctocatLogo = (p: P) => (
  <svg viewBox="0 0 24 24" width={p.width ?? 15} height={p.height ?? 15} fill="currentColor" {...(p as any)}>
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
  </svg>
)

export const LogOutIcon = (p: P) => <LogOut size={p.width ?? 16} {...(p as any)} />
export const InfoIcon = (p: P) => <Info size={p.width ?? 16} strokeWidth={2} {...(p as any)} />
export const SparklesIcon = (p: P) => <Sparkles size={p.width ?? 16} {...(p as any)} />
export const WhatsNewIcon = InfoIcon
export const ChevronLeftIcon = (p: P) => <ChevronLeft size={p.width ?? 16} {...(p as any)} />
export const ChevronRightIcon = (p: P) => <ChevronRight size={p.width ?? 16} {...(p as any)} />
export const ChevronUpIcon = (p: P) => <ChevronUp size={p.width ?? 16} {...(p as any)} />
export const ChevronDownIcon = (p: P) => <ChevronDown size={p.width ?? 16} {...(p as any)} />
export const ExternalLinkIcon = (p: P) => <ExternalLink size={p.width ?? 16} {...(p as any)} />
export const SearchIcon = (p: P) => <Search size={p.width ?? 16} {...(p as any)} />
export const PinIcon = (p: P) => <Pin size={p.width ?? 16} {...(p as any)} />
export const PinFillIcon = (p: P) => <Pin size={p.width ?? 16} fill="currentColor" {...(p as any)} />
export const TrashIcon = (p: P) => <Trash2 size={p.width ?? 16} {...(p as any)} />
export const CopyIcon = (p: P) => <Copy size={p.width ?? 16} {...(p as any)} />
export const GearIcon = (p: P) => <SettingsGear size={p.width ?? 16} {...(p as any)} />
export const GripIcon = (p: P) => <GripVertical size={p.width ?? 16} {...(p as any)} />
export const FileIcon = (p: P) => <File size={p.width ?? 16} {...(p as any)} />
export const ImageIcon = (p: P) => <ImageGraphic size={p.width ?? 16} {...(p as any)} />
export const LinkIcon = (p: P) => <Link size={p.width ?? 16} {...(p as any)} />
export const CloseIcon = (p: P) => <X size={p.width ?? 16} {...(p as any)} />
export const MinusIcon = (p: P) => <Minus size={p.width ?? 16} {...(p as any)} />
export const DropIcon = (p: P) => <ArrowDownToLine size={p.width ?? 16} {...(p as any)} />
export const BundleIcon = (p: P) => <Layers size={p.width ?? 16} {...(p as any)} />
export const ExpandIcon = (p: P) => <Maximize2 size={p.width ?? 16} {...(p as any)} />
export const ContractIcon = (p: P) => <Minimize2 size={p.width ?? 16} {...(p as any)} />
export const FolderOpenIcon = (p: P) => <FolderOpen size={p.width ?? 16} {...(p as any)} />
export const CheckIcon = (p: P) => <Check size={p.width ?? 16} {...(p as any)} />
export const FileIconGlyph = FileIcon

const PdfGlyph = (p: P) => <FileText size={p.width ?? 16} {...(p as any)} />
const ArchiveGlyph = (p: P) => <FileArchive size={p.width ?? 16} {...(p as any)} />
const CodeGlyph = (p: P) => <FileCode size={p.width ?? 16} {...(p as any)} />
const TextGlyph = (p: P) => <FileText size={p.width ?? 16} {...(p as any)} />
const DocGlyph = TextGlyph
const SheetGlyph = (p: P) => <FileSpreadsheet size={p.width ?? 16} {...(p as any)} />
const SlideGlyph = (p: P) => <Presentation size={p.width ?? 16} {...(p as any)} />
const AudioGlyph = (p: P) => <Music size={p.width ?? 16} {...(p as any)} />
const VideoGlyph = (p: P) => <Video size={p.width ?? 16} {...(p as any)} />
const PhotoGlyph = ImageIcon

const GLYPHS: Record<string, (p: P) => JSX.Element> = {
  pdf: PdfGlyph,
  archive: ArchiveGlyph,
  code: CodeGlyph,
  text: TextGlyph,
  word: DocGlyph,
  excel: SheetGlyph,
  powerpoint: SlideGlyph,
  audio: AudioGlyph,
  video: VideoGlyph,
  image: PhotoGlyph,
  file: FileIconGlyph
}

/**
 * A file icon that picks the right glyph *and* color for the path's extension.
 * Pass `ext` when you already have it (cheaper than re-parsing a full path).
 */
export function FileKindIcon({ ext, path, ...rest }: P & { ext?: string; path?: string }) {
  const info = ext ? getFileKindByExt(ext) : path ? getFileKindByExt(path.split('.').pop() ?? '') : null
  const kind = info?.kind ?? 'file'
  const Glyph = GLYPHS[kind] ?? FileIconGlyph
  return <Glyph {...rest} style={{ color: info?.color ?? 'currentColor', ...(rest.style ?? {}) }} />
}
