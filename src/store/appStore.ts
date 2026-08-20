/**
 * Renderer state store (Zustand).
 *
 * Holds the item list + settings and exposes thin actions that call the bridge
 * and update local state optimistically where it's safe. The main process is
 * always the source of truth; it pushes a fresh DTO list after every mutation,
 * so we mostly just *apply* what it sends us.
 */
import { create } from 'zustand'
import { edge } from '../lib/edge'
import type { ClipboardItemDto, Settings, DragRequest } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'

let flareTimer: ReturnType<typeof setTimeout> | null = null

/** A transient user-facing notice shown as a toast. */
export interface ToastMsg {
  id: string
  message: string
  tone: 'info' | 'error'
}

interface AppState {
  items: ClipboardItemDto[]
  settings: Settings
  /** True until the first `state:load` resolves. */
  hydrated: boolean
  /** Free-text search filter (UI-only state). */
  query: string
  typeFilter: import('../../shared/types').TypeFilter
  setTypeFilter: (filter: import('../../shared/types').TypeFilter) => void
  /** Whether the panel blade is expanded. */
  open: boolean
  /** Settings sheet visibility. */
  settingsOpen: boolean
  /** Active view mode within settings ('main' | 'changelog'). */
  settingsSubView: 'main' | 'changelog'
  setSettingsSubView: (subView: 'main' | 'changelog') => void
  /** True while an OS file drag is hovering the panel (prevents premature close). */
  dragActive: boolean
  /** True if the active drag originated from within the app itself. Stores the drag request (which item/sub-item). */
  internalDragReq: import('../../shared/types').DragRequest | null
  /** Active toasts (auto-dismissed after a short delay). */
  toasts: ToastMsg[]
  tutorialStep: number
  currentVersion: string
  isStoreBuild: boolean
  updateInfo: { hasUpdate: boolean; latestVersion: string; downloaded: boolean } | null
  /** Item ID currently being previewed in the flyout. */
  previewItemId: string | null
  previewItemRect: { y: number; height: number } | null

  sliderActive: boolean
  sliderReleasedTime: number
  setSliderActive: (active: boolean) => void
  notifyPositionChanged: () => void
  resetPositionChangedTime: () => void
  edgeHintActive: boolean
  setEdgeHintActive: (active: boolean) => void

  /* hydration + sync */
  hydrate: () => Promise<void>
  manualCheckState: {
    status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'error'
    version?: string
    error?: string
  }
  startManualCheck: () => Promise<void>
  startManualDownload: () => Promise<void>
  resetManualCheck: () => void
  setUpdateAvailable: (info: { version: string }) => void
  setUpdateDownloaded: (info: { version: string }) => void
  dismissUpdate: () => void
  installUpdate: () => Promise<void>
  setItems: (items: ClipboardItemDto[]) => void
  setSettings: (next: Settings) => void

  /* UI */
  setQuery: (q: string) => void
  setOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setDragActive: (active: boolean) => void
  setInternalDragReq: (req: import('../../shared/types').DragRequest | null) => void
  setPreviewItemId: (id: string | null, rect?: { y: number; height: number }) => void
  styleFlyoutOpen: boolean
  setStyleFlyoutOpen: (open: boolean) => void
  previewFlyoutRect: { top: number; bottom: number } | null
  setPreviewFlyoutRect: (rect: { top: number; bottom: number } | null) => void
  isInternalCopying: boolean
  copyFlareActive: boolean
  flareKey: number
  triggerCopyFlare: () => void

  /* toasts */
  pushToast: (toast: ToastMsg) => void
  dismissToast: (id: string) => void

  /* mutations (delegate to main) */
  togglePin: (id: string, pinned: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
  clear: (ids?: string[]) => Promise<void>
  copy: (id: string) => Promise<void>
  paste: (id: string) => Promise<void>
  pasteSubitem: (req: DragRequest) => Promise<void>
  patchSettings: (patch: Partial<Settings>) => Promise<void>
  refreshLaunchAtLogin: () => Promise<void>
  setTutorialStep: (step: number) => void
}

export const useStore = create<AppState>((set, get) => ({
  items: [],
  settings: { ...DEFAULT_SETTINGS },
  hydrated: false,
  query: '',
  typeFilter: 'all',
  setTypeFilter: (typeFilter) => set({ typeFilter }),
  open: false,
  settingsOpen: false,
  settingsSubView: 'main',
  setSettingsSubView: (subView) => set({ settingsSubView: subView }),
  dragActive: false,
  internalDragReq: null,
  toasts: [],
  tutorialStep: 0,
  currentVersion: '',
  isStoreBuild: false,
  updateInfo: null,
  previewItemId: null,
  previewItemRect: null,
  sliderActive: false,
  sliderReleasedTime: 0,
  setSliderActive: (active) => set({
    sliderActive: active,
    sliderReleasedTime: active ? 0 : Date.now()
  }),
  notifyPositionChanged: () => set({ sliderReleasedTime: Date.now() }),
  resetPositionChangedTime: () => set({ sliderReleasedTime: 0 }),
  edgeHintActive: false,
  setEdgeHintActive: (active) => set({ edgeHintActive: active }),
  styleFlyoutOpen: false,
  setStyleFlyoutOpen: (open) => {
    set({ styleFlyoutOpen: open, ...(open ? {} : { previewFlyoutRect: null }) })
    if (open) {
      edge.setPreviewMode(true)
    }
    // NOTE: Do NOT call edge.setPreviewMode(false) here when closing.
    // If we do, Electron immediately shrinks the window, cutting the flyout exit
    // spring in half (the 25%/75% split the user sees). Instead, IndicatorStyleFlyout's
    // AnimatePresence.onExitComplete callback is the one that calls setPreviewMode(false)
    // after the exit animation has fully settled.
  },
  isInternalCopying: false,
  copyFlareActive: false,
  flareKey: 0,

  async hydrate() {
    const { items, settings, version, isStoreBuild } = await edge.loadState()
    set({ 
      items, 
      settings, 
      currentVersion: version,
      isStoreBuild: isStoreBuild ?? false,
      hydrated: true
    })
    edge.onCopyFlare(() => {
      if (!get().isInternalCopying) {
        console.log('[appStore] OS copy event detected! Triggering copy flare indicator')
        get().triggerCopyFlare()
      }
    })
  },

  manualCheckState: { status: 'idle' },

  startManualCheck: async () => {
    set({ manualCheckState: { status: 'checking' } })
    try {
      const res = await edge.checkForUpdatesManual()
      if (res.status === 'available') {
        set({
          manualCheckState: { status: 'available', version: res.version },
          updateInfo: { hasUpdate: true, latestVersion: res.version || '', downloaded: false }
        })
      } else if (res.status === 'up-to-date') {
        set({
          manualCheckState: { status: 'up-to-date', version: res.version }
        })
      } else {
        set({
          manualCheckState: { status: 'error', error: res.error || 'Check failed' }
        })
      }
    } catch (err: any) {
      set({
        manualCheckState: { status: 'error', error: err?.message || 'Check failed' }
      })
    }
  },

  startManualDownload: async () => {
    set({ manualCheckState: { status: 'downloading' } })
    try {
      await edge.startUpdateDownload()
    } catch {
      set({ manualCheckState: { status: 'error', error: 'Download failed' } })
    }
  },

  resetManualCheck: () => set({ manualCheckState: { status: 'idle' } }),

  setUpdateAvailable: (info) => {
    set({
      updateInfo: {
        hasUpdate: true,
        latestVersion: info.version,
        downloaded: false
      }
    })
  },

  setUpdateDownloaded: (info) => {
    set({
      updateInfo: {
        hasUpdate: true,
        latestVersion: info.version,
        downloaded: true
      },
      manualCheckState: { status: 'idle' }
    })
  },

  dismissUpdate: () => set({ updateInfo: null, manualCheckState: { status: 'idle' } }),

  async installUpdate() {
    await edge.installUpdate()
  },

  setItems: (items) => {
    const prevItems = get().items
    if (
      prevItems.length === items.length &&
      prevItems.every((it, i) => it.id === items[i]?.id && it.pinned === items[i]?.pinned && it.hitCount === items[i]?.hitCount && it.capturedAt === items[i]?.capturedAt)
    ) {
      return
    }
    const prevTop = prevItems.length > 0 ? prevItems[0] : null
    const newTop = items.length > 0 ? items[0] : null

    if (get().hydrated && newTop) {
      const isDifferentId = !prevTop || newTop.id !== prevTop.id
      const isNewCapturedAt = prevTop && newTop.capturedAt !== prevTop.capturedAt
      if ((isDifferentId || isNewCapturedAt) && !get().isInternalCopying) {
        get().triggerCopyFlare()
      }
    }
    set({ items })
  },
  setSettings: (next) => set({ settings: next }),

  setQuery: (query) => set({ query }),
  setOpen: (open) => {
    set({ open })
    if (!open) {
      // NOTE: Do NOT reset styleFlyoutOpen here — closePanel() handles the
      // sequencing so the flyout exit animation completes before the panel closes.
      // Only reset previewItemId so the normal preview flyout clears correctly.
      set({ previewItemId: null, previewItemRect: null })
      edge.setPreviewMode(false)
    }
  },
  setSettingsOpen: (settingsOpen) => {
    set({
      settingsOpen,
      settingsSubView: 'main',
      previewItemId: null,
      previewItemRect: null,
      previewFlyoutRect: null,
      styleFlyoutOpen: false
    })
  },
  setDragActive: (dragActive) => set({ dragActive }),
  setInternalDragReq: (internalDragReq) => {
    if (internalDragReq === null) {
      set({ internalDragReq: null, dragActive: false })
    } else {
      set({ internalDragReq })
    }
    edge.setInternalDrag(!!internalDragReq)
  },
  previewFlyoutRect: null,
  setPreviewFlyoutRect: (rect) => set({ previewFlyoutRect: rect }),
  setPreviewItemId: (id, rect) => {
    set({ previewItemId: id, previewItemRect: rect || null, ...(id ? {} : { previewFlyoutRect: null }) })
    if (id) {
      edge.setPreviewMode(true)
    }
  },
  triggerCopyFlare: () => {
    if (get().settings.showCopyIndicator === false) return
    if (flareTimer) clearTimeout(flareTimer)
    set({ copyFlareActive: true, flareKey: Date.now() })
    if (!get().open) {
      edge.setPreviewMode(true)
    }
    flareTimer = setTimeout(() => {
      set({ copyFlareActive: false })
      if (!get().open && !get().previewItemId && !get().styleFlyoutOpen) {
        edge.setPreviewMode(false)
      }
      flareTimer = null
    }, 1400)
  },

  pushToast: (toast) => {
    set({ toasts: [...get().toasts, toast] })
    // Auto-dismiss after 2.6s. Errors linger slightly longer for readability.
    const ttl = toast.tone === 'error' ? 3400 : 2600
    setTimeout(() => get().dismissToast(toast.id), ttl)
  },

  dismissToast: (id) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },

  async togglePin(id, pinned) {
    // Optimistic: flip locally, then let the pushed list confirm.
    set({
      items: get().items.map((it) => (it.id === id ? { ...it, pinned } : it))
    })
    const items = await edge.setPinned(id, pinned)
    const current = get().items
    if (items.length !== current.length || items.some((it, i) => it.id !== current[i]?.id || it.pinned !== current[i]?.pinned)) {
      set({ items })
    }
  },

  async remove(id) {
    const previousItems = get().items
    set({ items: previousItems.filter((it) => it.id !== id) })
    try {
      const items = await edge.deleteItem(id)
      const current = get().items
      if (items.length !== current.length || items.some((it, i) => it.id !== current[i]?.id)) {
        set({ items })
      }
    } catch {
      // Do not leave the UI claiming an item was deleted when the main-process
      // persistence request failed (for example during a renderer reload).
      set({ items: previousItems })
      get().pushToast({ id: `delete-${Date.now()}`, message: 'Could not delete this item. Please try again.', tone: 'error' })
    }
  },

  async clear(ids?: string[]) {
    if (!ids || ids.length === 0) {
      const previousItems = get().items
      set({ items: previousItems.filter((it) => it.pinned) })
      try {
        const items = await edge.clearItems()
        const current = get().items
        if (items.length !== current.length || items.some((it, i) => it.id !== current[i]?.id)) {
          set({ items })
        }
      } catch {
        set({ items: previousItems })
        get().pushToast({ id: `clear-${Date.now()}`, message: 'Could not clear history. Please try again.', tone: 'error' })
      }
    } else {
      const previousItems = get().items
      const idSet = new Set(ids)
      set({ items: previousItems.filter((it) => !idSet.has(it.id)) })
      try {
        const items = await edge.deleteBatchItems(ids)
        const current = get().items
        if (items.length !== current.length || items.some((it, i) => it.id !== current[i]?.id)) {
          set({ items })
        }
      } catch {
        set({ items: previousItems })
        get().pushToast({ id: `clear-${Date.now()}`, message: 'Could not clear history. Please try again.', tone: 'error' })
      }
    }
  },

  async copy(id) {
    set({ isInternalCopying: true })
    await edge.copyItem(id)
    setTimeout(() => set({ isInternalCopying: false }), 400)
  },

  async paste(id) {
    set({ isInternalCopying: true })
    await edge.pasteItem(id)
    setTimeout(() => set({ isInternalCopying: false }), 600)
  },

  async pasteSubitem(req) {
    await edge.pasteSubitem(req)
  },

  async patchSettings(patch) {
    const next = await edge.updateSettings(patch)
    set({ settings: next })
  },

  async refreshLaunchAtLogin() {
    try {
      const next = await edge.refreshLaunchAtLogin()
      if (next) set({ settings: next })
    } catch {
      /* ignore */
    }
  },

  setTutorialStep: (step) => {
    set({ tutorialStep: step })
    edge.broadcastTutorialStep(step)
  }
}))
