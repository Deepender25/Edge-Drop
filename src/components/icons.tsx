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
  Star,
  Globe
} from 'lucide-react'
import { getFileKindByExt } from '../lib/fileType'

type P = SVGProps<SVGSVGElement>

export const CoffeeIcon = (p: P) => <Coffee size={p.width ?? 16} strokeWidth={2.2} {...(p as any)} />
export const HeartIcon = (p: P) => <Heart size={p.width ?? 16} strokeWidth={2.2} {...(p as any)} />
export const StarIcon = (p: P) => <Star size={p.width ?? 16} strokeWidth={2.2} {...(p as any)} />
export const GlobeIcon = (p: P) => <Globe size={p.width ?? 16} {...(p as any)} />

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
