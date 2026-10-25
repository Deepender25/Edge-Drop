/**
 * useFilteredItems — derives the visible, grouped item list from raw state.
 *
 * Split into Pinned (favorites) and Recent (everything else), then apply the
 * search query. Kept as a selector so components stay presentational.
 */
import { useMemo } from 'react'
import { useStore } from '../store/appStore'
import type { ClipboardItemDto, TypeFilter } from '../../shared/types'
import { basename, isImagePath } from '../lib/format'
import { parseColor } from '../lib/colorUtils'
import { matchesWords, queryWords, searchText, type SearchText, type SearchWord } from '../lib/search'

// Each item's searchable text, folded once per item object (items are
// replaced, never mutated, when they change), so typing doesn't redo it.
const textCache = new WeakMap<ClipboardItemDto, SearchText>()

function itemText(it: ClipboardItemDto): SearchText {
  let text = textCache.get(it)
  if (!text) {
    const d = it.data
    // Images have no text of their own: they are found through their note.
    const content = d.kind === 'text' ? d.text : d.kind === 'files' ? d.paths.map((p) => basename(p)).join('\n') : ''
    // a link is also found by the page title copied with it
    text = searchText([content, d.kind === 'text' ? d.linkTitle : undefined, it.note])
    textCache.set(it, text)
  }
  return text
}

export function matches(it: ClipboardItemDto, words: readonly SearchWord[]): boolean {
  return words.length === 0 || matchesWords(itemText(it), words)
}

/**
 * Explorer-copied photos are stored as `files` but belong in Images, not Files.
 * Mixed stacks (photo + PDF) stay in Files only.
 */
export function isImageOnlyFileItem(it: ClipboardItemDto): boolean {
  if (it.data.kind !== 'files') return false
  const paths = it.data.paths
  if (paths.length === 0) return false
  if (it.data.entries?.some((en) => en.isDirectory)) return false
  return paths.every((p) => isImagePath(p))
}

export function itemMatchesTypeFilter(it: ClipboardItemDto, filter: TypeFilter): boolean {
  if (filter === 'all') return true
  switch (filter) {
    case 'text':
      return it.data.kind === 'text' && !it.data.isUrl && !it.data.isColor && !parseColor(it.data.text)
    case 'links':
      return it.data.kind === 'text' && !!it.data.isUrl
    case 'images':
      if (it.data.kind === 'image' || it.data.kind === 'image-collection') return true
      return isImageOnlyFileItem(it)
    case 'files':
      return it.data.kind === 'files' && !isImageOnlyFileItem(it)
    case 'colors':
      return it.data.kind === 'text' && (!!it.data.isColor || !!parseColor(it.data.text))
  }
}

export interface GroupedItems {
  pinned: ClipboardItemDto[]
  recent: ClipboardItemDto[]
}

export function useFilteredItems(): GroupedItems {
  const items = useStore((s) => s.items)
  const query = useStore((s) => s.query)
  const typeFilter = useStore((s) => s.typeFilter)
  const tutorialStep = useStore((s) => s.tutorialStep)

  return useMemo(() => {
    const pinned: ClipboardItemDto[] = []
    const recent: ClipboardItemDto[] = []

    const filteredByTutorial = items.filter((it) => {
      if (tutorialStep <= 0) return true
      switch (tutorialStep) {
        case 1:
          return it.id === 'onboarding-welcome'
        case 2:
          return false
        case 3:
          return it.id === 'onboarding-image' || !it.id.startsWith('onboarding-')
        case 4:
          return it.id === 'onboarding-files'
        case 5:
          return true
        default:
          return true
      }
    })

    const words = queryWords(query)
    for (const it of filteredByTutorial) {
      if (!matches(it, words)) continue
      if (!itemMatchesTypeFilter(it, typeFilter)) continue
      ;(it.pinned ? pinned : recent).push(it)
    }
    return { pinned, recent }
  }, [items, query, typeFilter, tutorialStep])
}
