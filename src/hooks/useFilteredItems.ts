/**
 * useFilteredItems — derives the visible, grouped item list from raw state.
 *
 * Split into Pinned (favorites) and Recent (everything else), then apply the
 * search query. Kept as a selector so components stay presentational.
 */
import { useMemo } from 'react'
import { useStore } from '../store/appStore'
import type { ClipboardItemDto } from '../../shared/types'
import { basename } from '../lib/format'

function matches(it: ClipboardItemDto, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  switch (it.data.kind) {
    case 'text':
      return it.data.text.toLowerCase().includes(needle)
    case 'files':
      return it.data.paths.some((p) => basename(p).toLowerCase().includes(needle))
    case 'image':
      // images have no searchable text; hidden by query
      return false
    case 'image-collection':
      // image collections have no searchable text; hidden by query
      return false
  }
}

export interface GroupedItems {
  pinned: ClipboardItemDto[]
  recent: ClipboardItemDto[]
}

export function useFilteredItems(): GroupedItems {
  const items = useStore((s) => s.items)
  const query = useStore((s) => s.query)

  return useMemo(() => {
    const pinned: ClipboardItemDto[] = []
    const recent: ClipboardItemDto[] = []
    for (const it of items) {
      if (!matches(it, query.trim())) continue
      ;(it.pinned ? pinned : recent).push(it)
    }
    return { pinned, recent }
  }, [items, query])
}
