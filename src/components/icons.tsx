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
export const ClockIcon = (p: P) => {
  const size = Number(p.width ?? p.height ?? 16)
  return (
    <svg
      viewBox="15.3 18 64 64"
      width={size}
      height={size}
      fill="currentColor"
      {...(p as any)}
    >
      <path d="M28.1,48C28,48.7,28,49.3,28,50h-6c0-0.7,0-1.3,0.1-2H28.1z" />
      <path d="M51.5,36h-3c-0.8,0-1.5,0.7-1.5,1.5v13.1c0,0.4,0.2,0.8,0.4,1.1l8.4,8.4c0.6,0.6,1.5,0.6,2.1,0l2.1-2.1c0.6-0.6,0.6-1.5,0-2.1L53,48.8V37.5C53,36.7,52.3,36,51.5,36z" />
      <path d="M50,22c-14.8,0-26.9,11.5-27.9,26c0,0.3-0.1,0.7-0.1,1h-4.5c-1.3,0-2,1.5-1.2,2.4l7.5,9.1c0.6,0.7,1.7,0.7,2.3,0l7.5-9.1c0.8-1,0.1-2.4-1.2-2.4H28c0-0.3,0-0.7,0-1c1-11.2,10.5-20,21.9-20c13,0,23.3,11.3,21.9,24.5C70.8,62,61.8,71,52.2,71.9c-7.1,0.7-13.8-1.9-18.5-7c-0.6-0.7-1.4-1.1-2.2-0.1l-2.4,2.9c-0.5,0.6-0.1,1,0.4,1.5c5.4,5.7,12.8,8.9,20.8,8.8c14.4-0.2,26.5-11.6,27.5-26C79.1,35.7,66.1,22,50,22z" />
    </svg>
  )
}
export const RecentIcon = ClockIcon
export const TypeIcon = uiIcon(Type)
export const FilesIcon = uiIcon(Files)

export const EmojiSmileIcon = uiIcon(Smile, 18)
export const EmojiClockIcon = (p: P) => <ClockIcon width={p.width ?? 18} height={p.height ?? 18} {...(p as any)} />
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
