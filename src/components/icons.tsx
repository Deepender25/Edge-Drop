/**
 * UI icons: Phosphor (https://phosphoricons.com, MIT), one family for the
 * whole app. Paths are vendored in phosphorPaths.ts (Bold weight, plus Fill
 * for "on" states) so only what the app draws is shipped.
 *
 * Line weight: Phosphor Bold draws its lines 24/256 of the icon wide, which
 * is only ~1.1px at the 11-12px the action pills use and read as thin and
 * small next to the old Lucide set. So each outline gets a matching stroke
 * that brings the line to exactly what Lucide drew: 1.55px up to 14px, 1.7px
 * above (computed from the icon's size prop, as Lucide's absolute stroke
 * was). Filled "on" icons (weight="fill": pin, star) are left as drawn.
 *
 * Size: Phosphor leaves more empty margin inside its grid than Lucide did,
 * so glyphs looked a little small. The view box trims 10 units from each
 * side (glyphs ~8.5% larger in the same box); overflow stays visible so the
 * few icons that reach the grid edge (coffee, users) are never clipped.
 */
import type { SVGProps } from 'react'
import { PHOSPHOR_BOLD, PHOSPHOR_FILL, type PhosphorName } from './phosphorPaths'

type P = SVGProps<SVGSVGElement> & { weight?: 'bold' | 'fill' }

/** Line thickness in px the icon should read at (matches the old Lucide set). */
const linePx = (size: number) => (size <= 14 ? 1.55 : 1.7)
/** Phosphor Bold's own line width on its 256 grid. */
const BOLD_LINE = 24
/** Margin trimmed from each side of the 256 grid, and the resulting view box. */
const TRIM = 10
const VIEW = 256 - TRIM * 2

function uiIcon(name: PhosphorName, fallback = 16) {
  return (p: P) => {
    const size = Number(p.width ?? p.height ?? fallback)
    const { weight, ...rest } = p
    const fillPath = weight === 'fill' ? (PHOSPHOR_FILL as Record<string, string>)[name] : undefined
    // Extra outline (in grid units) so Bold's 24-unit line becomes linePx on screen.
    const extra = fillPath ? 0 : Math.max(0, (linePx(size) * VIEW) / size - BOLD_LINE)
    const color = (rest as { fill?: string }).fill ?? 'currentColor'
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${TRIM} ${TRIM} ${VIEW} ${VIEW}`}
        width={size}
        height={size}
        fill="currentColor"
        overflow="visible"
        aria-hidden="true"
        focusable="false"
        {...(rest as any)}
      >
        <path
          d={fillPath ?? PHOSPHOR_BOLD[name]}
          {...(extra > 0 ? { stroke: color, strokeWidth: +extra.toFixed(2), strokeLinejoin: 'round' as const } : {})}
        />
      </svg>
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

export const MicrosoftStoreLogo = (p: P) => {
  const size = Number(p.width ?? p.height ?? 14)
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" style={{ flexShrink: 0 }} {...(p as any)}>
      <rect x="1" y="1" width="6.5" height="6.5" rx="0.5" fill="#f25022" />
      <rect x="8.5" y="1" width="6.5" height="6.5" rx="0.5" fill="#7fba00" />
      <rect x="1" y="8.5" width="6.5" height="6.5" rx="0.5" fill="#00a4ef" />
      <rect x="8.5" y="8.5" width="6.5" height="6.5" rx="0.5" fill="#ffb900" />
    </svg>
  )
}

export const RotateCcwIcon = uiIcon('arrowCounterClockwise')
export const CoffeeIcon = uiIcon('coffee')
export const HeartIcon = uiIcon('heart')
export const StarIcon = uiIcon('star')
export const GlobeIcon = uiIcon('globe')
export const LogOutIcon = uiIcon('signOut')
export const InfoIcon = uiIcon('info')
export const SparklesIcon = uiIcon('sparkle')
export const WhatsNewIcon = InfoIcon
export const ChevronLeftIcon = uiIcon('caretLeft')
export const ChevronRightIcon = uiIcon('caretRight')
export const ChevronUpIcon = uiIcon('caretUp')
export const ChevronDownIcon = uiIcon('caretDown')
export const ExternalLinkIcon = uiIcon('arrowSquareOut')
export const SearchIcon = uiIcon('magnifyingGlass')
export const PinIcon = uiIcon('pushPin')
const PinBase = uiIcon('pushPin')
export const PinFillIcon = (p: P) => <PinBase {...p} weight="fill" />
export const TrashIcon = uiIcon('trash')
export const CopyIcon = uiIcon('copy')
export const GearIcon = uiIcon('gearSix')
export const GripIcon = uiIcon('dotsSixVertical')
export const ImageIcon = uiIcon('image')
export const LinkIcon = uiIcon('link')
export const CloseIcon = uiIcon('x')
export const MinusIcon = uiIcon('minus')
export const DropIcon = uiIcon('arrowLineDown')
export const BundleIcon = uiIcon('stack')
export const ExpandIcon = uiIcon('arrowsOutSimple')
export const ContractIcon = uiIcon('arrowsInSimple')
export const FolderOpenIcon = uiIcon('folderOpen')
export const CheckIcon = uiIcon('check')
export const ClipboardIcon = uiIcon('clipboard')
export const ClockIcon = uiIcon('clockCounterClockwise')
export const RecentIcon = ClockIcon
export const TypeIcon = uiIcon('textT')
export const FilesIcon = uiIcon('files')
export const PaletteIcon = uiIcon('palette')
export const NoteIcon = uiIcon('pencilSimple')
export const PasteIcon = uiIcon('clipboardText')
export const DownloadIcon = uiIcon('downloadSimple')

export const ArrowsClockwiseIcon = uiIcon('arrowsClockwise')

export const EmojiSmileIcon = uiIcon('smiley', 18)
export const EmojiClockIcon = (p: P) => <ClockIcon width={p.width ?? 18} height={p.height ?? 18} {...(p as any)} />
export const EmojiUserIcon = uiIcon('users', 18)
export const EmojiPawIcon = uiIcon('pawPrint', 18)
export const EmojiFoodIcon = uiIcon('forkKnife', 18)
export const EmojiPlaneIcon = uiIcon('globe', 18)
export const EmojiTrophyIcon = uiIcon('trophy', 18)
export const EmojiBulbIcon = uiIcon('lightbulb', 18)
export const EmojiShapesIcon = uiIcon('shapes', 18)
export const EmojiFlagIcon = uiIcon('flag', 18)
import { CustomFileIcon, FileStackPhoto } from './CustomFileIcon'
export { CustomFileIcon, CustomFileIcon as FileKindIcon, FileStackPhoto }

export const FileIcon = (p: P) => <CustomFileIcon width={p.width ?? 16} height={p.height ?? 16} {...(p as any)} />
export const FileIconGlyph = FileIcon
