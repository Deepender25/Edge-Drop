/**
 * UI icons. Lucide strokes at 16px with width 2.2 rasterize into boxes on
 * the software compositor — keep a hairline weight and let size scale the
 * path, not the stroke.
 */
import type { LucideIcon } from 'lucide-react'
import type { SVGProps } from 'react'
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
  LogOut,
  Coffee,
  Heart,
  Star,
  RotateCcw,
  Clipboard,
  Type,
  Files,
  Globe,
  Smile,
  Clock,
  Users,
  PawPrint,
  Utensils,
  Trophy,
  Lightbulb,
  Shapes,
  Flag
} from 'lucide-react'

type P = SVGProps<SVGSVGElement>

function uiIcon(Icon: LucideIcon, fallback = 16) {
  return (p: P) => {
    const size = Number(p.width ?? p.height ?? fallback)
    return (
      <Icon
        size={size}
        strokeWidth={size <= 14 ? 1.55 : 1.7}
        absoluteStrokeWidth
        {...(p as any)}
      />
    )
  }
}

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

export const RotateCcwIcon = uiIcon(RotateCcw)
export const CoffeeIcon = uiIcon(Coffee)
export const HeartIcon = uiIcon(Heart)
export const StarIcon = uiIcon(Star)
export const GlobeIcon = uiIcon(Globe)
export const LogOutIcon = uiIcon(LogOut)
export const InfoIcon = uiIcon(Info)
export const SparklesIcon = uiIcon(Sparkles)
export const WhatsNewIcon = InfoIcon
export const ChevronLeftIcon = uiIcon(ChevronLeft)
export const ChevronRightIcon = uiIcon(ChevronRight)
export const ChevronUpIcon = uiIcon(ChevronUp)
export const ChevronDownIcon = uiIcon(ChevronDown)
export const ExternalLinkIcon = uiIcon(ExternalLink)
export const SearchIcon = uiIcon(Search)
export const PinIcon = uiIcon(Pin)
export const PinFillIcon = (p: P) => {
  const size = Number(p.width ?? p.height ?? 16)
  return <Pin size={size} strokeWidth={size <= 14 ? 1.55 : 1.7} absoluteStrokeWidth fill="currentColor" {...(p as any)} />
}
export const TrashIcon = uiIcon(Trash2)
export const CopyIcon = uiIcon(Copy)
export const GearIcon = uiIcon(SettingsGear)
export const GripIcon = uiIcon(GripVertical)
export const ImageIcon = uiIcon(ImageGraphic)
export const LinkIcon = uiIcon(Link)
export const CloseIcon = uiIcon(X)
export const MinusIcon = uiIcon(Minus)
export const DropIcon = uiIcon(ArrowDownToLine)
export const BundleIcon = uiIcon(Layers)
export const ExpandIcon = uiIcon(Maximize2)
export const ContractIcon = uiIcon(Minimize2)
export const FolderOpenIcon = uiIcon(FolderOpen)
export const CheckIcon = uiIcon(Check)
export const ClipboardIcon = uiIcon(Clipboard)
export const ClockIcon = uiIcon(Clock)
export const TypeIcon = uiIcon(Type)
export const FilesIcon = uiIcon(Files)

export const EmojiSmileIcon = uiIcon(Smile, 18)
export const EmojiClockIcon = uiIcon(Clock, 18)
export const EmojiUserIcon = uiIcon(Users, 18)
export const EmojiPawIcon = uiIcon(PawPrint, 18)
export const EmojiFoodIcon = uiIcon(Utensils, 18)
export const EmojiPlaneIcon = uiIcon(Globe, 18)
export const EmojiTrophyIcon = uiIcon(Trophy, 18)
export const EmojiBulbIcon = uiIcon(Lightbulb, 18)
export const EmojiShapesIcon = uiIcon(Shapes, 18)
export const EmojiFlagIcon = uiIcon(Flag, 18)
import { CustomFileIcon, FileStackPhoto } from './CustomFileIcon'
export { CustomFileIcon, CustomFileIcon as FileKindIcon, FileStackPhoto }

export const FileIcon = (p: P) => <CustomFileIcon width={p.width ?? 16} height={p.height ?? 16} {...(p as any)} />
export const FileIconGlyph = FileIcon
