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
import { takeSearchEngaged } from '../lib/searchFocus'
import { t } from '../i18n'
import { loadRecents } from '../lib/emoji/prefs'
import type { ClipboardItemDto, Settings, DragRequest } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'
import { playEdgeRetractSound, playEdgeBeaconAppearSound, playEdgeExpandSound, playButtonClickSound } from '../lib/soundEffects'

let flareTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Version dismissed this run. Session-only (never persisted): quitting and
 * relaunching clears it, so a skipped update prompts again next launch —
 * the "remind me next restart" contract. Manual checks bypass it entirely.
 */
let sessionSkippedVersion: string | null = null

export type EdgeTransitionStage =
  | 'retracting'
  | 'bar_fade_out'
  | 'bar_fade_in'
  | 'expanding'

export interface EdgeTransitionState {
  active: boolean
  from: 'left' | 'right' | 'top'
  to: 'left' | 'right' | 'top'
  stage: EdgeTransitionStage
}

/** A transient user-facing notice shown as a toast. */
export interface ToastMsg {
  id: string
  message: string
  tone: 'info' | 'error'
  params?: Record<string, string | number>
}

export interface UpdateProgress {
  percent: number
  bytesPerSecond?: number
  transferred?: number
  total?: number
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
  /** Emoji library view (replaces the clipboard list). */
  emojiOpen: boolean
  setEmojiOpen: (open: boolean) => void
  emojiCategory: import('../lib/emoji/catalog').EmojiCategoryId
  setEmojiCategory: (cat: import('../lib/emoji/catalog').EmojiCategoryId) => void
  /** True while an OS file drag is hovering the panel (prevents premature close). */
  dragActive: boolean
  /**
   * The one stack/bundle whose expanded sub-item list is open (accordion).
   * Single source of truth so expanding one stack collapses the previous,
   * and so Escape / outside-click / view switches can coordinate closure.
   */
  expandedStackId: string | null
  setExpandedStackId: (id: string | null) => void
  /** True if the active drag originated from within the app itself. Stores the drag request (which item/sub-item). */
  internalDragReq: import('../../shared/types').DragRequest | null
  /** Active toasts (auto-dismissed after a short delay). */
  toasts: ToastMsg[]
  tutorialStep: number
  currentVersion: string
  isStoreBuild: boolean
  updateInfo: {
    hasUpdate: boolean
    latestVersion: string
    downloaded: boolean
    downloadProgress?: UpdateProgress
  } | null
  /** Item ID currently being previewed in the flyout. */
  previewItemId: string | null
  previewItemRect: { x?: number; y?: number; width?: number; height?: number } | null

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
  /**
   * True while the user is driving an update flow by hand (check/download in
   * progress or a manual result on screen). Decides placement: manual flows
   * render in place where clicked; background finds promote to the top.
   */
  manualUpdateActive: boolean
  setUpdateAvailable: (info: { version: string }) => void
  setUpdateProgress: (progress: UpdateProgress) => void
  setUpdateDownloaded: (info: { version: string }) => void
  dismissUpdate: () => void
  installUpdate: () => Promise<void>
  setItems: (items: ClipboardItemDto[], meta?: { reason?: 'usage' | 'capture' }) => void
  setSettings: (next: Settings) => void

  /* UI */
  setQuery: (q: string) => void
  setOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  settingsTab: 'behaviour' | 'position' | 'appearance'
  setSettingsTab: (tab: 'behaviour' | 'position' | 'appearance') => void
  setDragActive: (active: boolean) => void
  setInternalDragReq: (req: import('../../shared/types').DragRequest | null) => void
  setPreviewItemId: (id: string | null, rect?: { x?: number; y?: number; width?: number; height?: number }) => void
  styleFlyoutOpen: boolean
  styleFlyoutAnchorRect: { x?: number; y?: number; width?: number; height?: number } | null
  setStyleFlyoutOpen: (open: boolean, rect?: { x?: number; y?: number; width?: number; height?: number } | null) => void
  languageFlyoutOpen: boolean
  languageFlyoutAnchorRect: { x?: number; y?: number; width?: number; height?: number } | null
  setLanguageFlyoutOpen: (open: boolean, rect?: { x?: number; y?: number; width?: number; height?: number } | null) => void
  previewFlyoutRect: { top: number; bottom: number; left?: number; right?: number } | null
  setPreviewFlyoutRect: (rect: { top: number; bottom: number; left?: number; right?: number } | null) => void
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
  copySubitem: (req: DragRequest) => Promise<void>
  paste: (id: string) => Promise<void>
  pasteSubitem: (req: DragRequest) => Promise<void>
  pasteEmoji: (text: string) => Promise<void>
  patchSettings: (patch: Partial<Settings>) => Promise<void>
  refreshLaunchAtLogin: () => Promise<void>
  setTutorialStep: (step: number) => void
  edgeTransition: EdgeTransitionState | null
  startEdgeTransition: (to: 'left' | 'right' | 'top') => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  items: [],
  settings: { ...DEFAULT_SETTINGS },
  hydrated: false,
  query: '',
  typeFilter: 'all',
  setTypeFilter: (typeFilter) => {
    if (get().typeFilter === typeFilter && !get().emojiOpen) return
    set({ typeFilter, emojiOpen: false, expandedStackId: null })
    // The list remounts on filter change; leave the flyout open and it
    // would float over a tab that no longer contains the source card.
    if (get().previewItemId) get().setPreviewItemId(null)
  },
  open: false,
  settingsOpen: false,
  settingsTab: 'behaviour',
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  emojiOpen: false,
  emojiCategory: 'smileys',
  setEmojiCategory: (emojiCategory) => set({ emojiCategory }),
  setEmojiOpen: (emojiOpen) => {
    if (emojiOpen) {
      // Every open lands on the first page: recents when any exist,
      // otherwise smileys. Scroll/budget reset happens in the picker.
      let landing: import('../lib/emoji/catalog').EmojiCategoryId = 'smileys'
      try {
        if (loadRecents().length > 0) landing = 'recents'
      } catch { /* ignore */ }
      set({
        emojiOpen: true,
        emojiCategory: landing,
        settingsOpen: false,
        previewItemId: null,
        previewItemRect: null,
        previewFlyoutRect: null,
        styleFlyoutOpen: false,
        styleFlyoutAnchorRect: null,
        languageFlyoutOpen: false,
        languageFlyoutAnchorRect: null,
        expandedStackId: null
      })
      edge.setPreviewMode(false)
    } else {
      set({ emojiOpen: false })
    }
  },
  dragActive: false,
  expandedStackId: null,
  setExpandedStackId: (expandedStackId) => set({ expandedStackId }),
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
  styleFlyoutAnchorRect: null,
  setStyleFlyoutOpen: (open, rect) => {
    const isHorizontal = get().settings.stickPosition === 'top'
    if (open && get().languageFlyoutOpen) {
      set({ languageFlyoutOpen: false, languageFlyoutAnchorRect: null })
    }
    set({
      styleFlyoutOpen: open,
      styleFlyoutAnchorRect: open && rect ? rect : null,
      ...(open ? {} : { previewFlyoutRect: null })
    })
    // In horizontal mode (top), the flyout fits natively inside the 480px dock bounds.
    // Resizing the Electron window to 720px across IPC takes ~1s in Windows DWM, which caused
    // the flyout to mount squeezed vertically at 240px and then expand 1s later when the resize event fired.
    if (open && !isHorizontal) {
      edge.setPreviewMode(true)
    }
    // NOTE: Do NOT call edge.setPreviewMode(false) here when closing.
    // If we do, Electron immediately shrinks the window, cutting the flyout exit
    // spring in half (the 25%/75% split the user sees). Instead, IndicatorStyleFlyout's
    // AnimatePresence.onExitComplete callback is the one that calls setPreviewMode(false)
    // after the exit animation has fully settled.
  },
  languageFlyoutOpen: false,
  languageFlyoutAnchorRect: null,
  setLanguageFlyoutOpen: (open, rect) => {
    const isHorizontal = get().settings.stickPosition === 'top'
    if (open && get().styleFlyoutOpen) {
      set({ styleFlyoutOpen: false, styleFlyoutAnchorRect: null })
    }
    set({
      languageFlyoutOpen: open,
      languageFlyoutAnchorRect: open && rect ? rect : null,
      ...(open ? {} : { previewFlyoutRect: null })
    })
    if (open && !isHorizontal) {
      edge.setPreviewMode(true)
    }
  },
  isInternalCopying: false,
  copyFlareActive: false,
  flareKey: 0,

  async hydrate() {
    const { items, settings, version, isStoreBuild, updateInfo } = await edge.loadState()
    const skipped = settings?.skippedUpdateVersion
    const validUpdateInfo = (updateInfo && (!skipped || updateInfo.latestVersion !== skipped)) ? updateInfo : null
    set({ 
      items, 
      settings, 
      currentVersion: version,
      isStoreBuild: isStoreBuild ?? false,
      updateInfo: validUpdateInfo ?? get().updateInfo,
      hydrated: true
    })
  },

  manualCheckState: { status: 'idle' },
  manualUpdateActive: false,

  startManualCheck: async () => {
    set({ manualCheckState: { status: 'checking' }, manualUpdateActive: true })
    try {
      const res = await edge.checkForUpdatesManual()
      if (res.status === 'available') {
        set({
          manualCheckState: { status: 'available', version: res.version },
          updateInfo: { hasUpdate: true, latestVersion: res.version || '', downloaded: false },
          manualUpdateActive: true
        })
      } else if (res.status === 'up-to-date') {
        set({
          manualCheckState: { status: 'up-to-date', version: res.version },
          manualUpdateActive: false
        })
      } else {
        set({
          manualCheckState: { status: 'error', error: res.error || 'Check failed' },
          manualUpdateActive: false
        })
      }
    } catch (err: any) {
      set({
        manualCheckState: { status: 'error', error: err?.message || 'Check failed' },
        manualUpdateActive: false
      })
    }
  },

  startManualDownload: async () => {
    set({ manualCheckState: { status: 'downloading' }, manualUpdateActive: true })
    try {
      await edge.startUpdateDownload()
    } catch {
      set({ manualCheckState: { status: 'error', error: 'Download failed' } })
    }
  },

  resetManualCheck: () => set({ manualCheckState: { status: 'idle' } }),

  setUpdateAvailable: (info) => {
    // Session skip: a version dismissed this run is not re-prompted by
    // background pushes, but WILL prompt again after the next launch (the
    // "remind me next restart" contract). A different version clears the
    // session skip and surfaces normally. Manual checks bypass this.
    if (sessionSkippedVersion && info.version === sessionSkippedVersion) {
      console.log(`[Updater] Suppressing prompt for session-skipped v${info.version}`)
      return
    }
    if (sessionSkippedVersion && info.version !== sessionSkippedVersion) {
      sessionSkippedVersion = null
    }
    // A background find arriving while no manual flow owns the UI resets the
    // manual marker, so placement below keys off fresh truth, not stale flags.
    if (get().manualCheckState.status === 'idle') {
      set({ manualUpdateActive: false })
    }
    // A background find for a DIFFERENT version than a settled manual result
    // retires the stale manual result — the top card then shows the newer
    // version instead of two disagreeing prompts.
    const mc = get().manualCheckState
    if ((mc.status === 'available' || mc.status === 'up-to-date' || mc.status === 'error') && mc.version && mc.version !== info.version) {
      set({ manualCheckState: { status: 'idle' }, manualUpdateActive: false })
    }
    set({
      updateInfo: {
        hasUpdate: true,
        latestVersion: info.version,
        downloaded: false
      }
    })
  },

  setUpdateProgress: (progress) => {
    const current = get().updateInfo
    if (!current) {
      set({
        updateInfo: {
          hasUpdate: true,
          latestVersion: '',
          downloaded: false,
          downloadProgress: progress
        }
      })
      return
    }
    set({
      updateInfo: {
        ...current,
        downloadProgress: progress
      }
    })
  },

  setUpdateDownloaded: (info) => {
    set({
      updateInfo: {
        hasUpdate: true,
        latestVersion: info.version,
        downloaded: true,
        downloadProgress: undefined
      },
      manualCheckState: { status: 'idle' }
    })
  },

  dismissUpdate: () => {
    // Skip = "not now": remember for this session only. The next launch
    // re-prompts (nothing persisted), a newer version always surfaces.
    const skipped = get().updateInfo?.latestVersion || get().manualCheckState.version
    sessionSkippedVersion = skipped || null
    set({ updateInfo: null, manualCheckState: { status: 'idle' }, manualUpdateActive: false })
  },

  async installUpdate() {
    await edge.installUpdate()
  },

  setItems: (items, _meta) => {
    const prevItems = get().items
    if (
      prevItems.length === items.length &&
      prevItems.every((it, i) => it.id === items[i]?.id && it.pinned === items[i]?.pinned && it.hitCount === items[i]?.hitCount && it.capturedAt === items[i]?.capturedAt)
    ) {
      return
    }
    // Copy confirmation is owned by `ui:copy-flare` (App.tsx). Firing it again
    // here replayed the indicator after a slow capture (large spreadsheet)
    // finished — the hint already showed it ~780ms earlier.
    set({ items })
  },
  setSettings: (next) => set({ settings: next }),

  setQuery: (query) => set({ query }),
  setOpen: (open) => {
    set({ open })
    if (!open) {
      // Release any focused control inside the blade. Without this, a button
      // left focused from a click keeps matching the card's :focus-within
      // rule and its action bar stays lit after the next open.
      // (Accessed via globalThis with structural typing so this module keeps
      // compiling under the DOM-less node tsconfig.)
      const active = (globalThis as { document?: { activeElement?: { blur?: () => void } } }).document?.activeElement
      try { active?.blur?.() } catch { /* ignore */ }
      // If search held temporary OS focusability + paused hotkey through a
      // close path that skipped the input's blur (tray toggle, cursor
      // leave), restore both exactly once. No-op when search was never used.
      try {
        if (takeSearchEngaged()) {
          void edge.focusWindow(false)?.catch?.(() => {})
          void edge.pauseHotkey(false)?.catch?.(() => {})
        }
      } catch { /* ignore */ }
      // NOTE: Do NOT reset styleFlyoutOpen here — closePanel() handles the
      // sequencing so the flyout exit animation completes before the panel closes.
      // Only reset previewItemId so the normal preview flyout clears correctly.
      set({ previewItemId: null, previewItemRect: null, expandedStackId: null })
      edge.setPreviewMode(false)
    }
  },
  setSettingsOpen: (settingsOpen) => {
    set({
      settingsOpen,
      settingsTab: 'behaviour',
      previewItemId: null,
      previewItemRect: null,
      previewFlyoutRect: null,
      styleFlyoutOpen: false,
      styleFlyoutAnchorRect: null,
      languageFlyoutOpen: false,
      languageFlyoutAnchorRect: null,
      expandedStackId: null,
      emojiOpen: settingsOpen ? false : get().emojiOpen
    })
  },
  setDragActive: (dragActive) => set({ dragActive }),
  setInternalDragReq: (internalDragReq) => {
    if (internalDragReq === null) {
      set({ internalDragReq: null, dragActive: false })
    } else {
      set({ internalDragReq })
    }
    edge.setInternalDrag?.(!!internalDragReq)
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
    // Already showing: only extend the hold. Restarting flareKey mid-flight
    // is what made the indicator look late (hint, then items-push retrigger).
    if (!get().copyFlareActive) {
      set({ copyFlareActive: true, flareKey: Date.now() })
      if (!get().open) {
        edge.setPreviewMode(true)
      }
    }
    flareTimer = setTimeout(() => {
      set({ copyFlareActive: false })
      if (!get().open && !get().previewItemId && !get().styleFlyoutOpen) {
        edge.setPreviewMode(false)
      }
      flareTimer = null
    }, 780)
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
      get().pushToast({ id: `delete-${Date.now()}`, message: t('toast.deleteFailed'), tone: 'error' })
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
        get().pushToast({ id: `clear-${Date.now()}`, message: t('toast.clearFailed'), tone: 'error' })
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
        get().pushToast({ id: `clear-${Date.now()}`, message: t('toast.clearFailed'), tone: 'error' })
      }
    }
  },

  async copy(id) {
    // Internal copy from the clipboard: write to OS clipboard with internal copy
    // guard active so the external edge copy indicator flare does not appear.
    set({ isInternalCopying: true })
    try {
      await edge.copyItem(id)
    } finally {
      setTimeout(() => set({ isInternalCopying: false }), 400)
    }
  },

  async copySubitem(req) {
    set({ isInternalCopying: true })
    try {
      await edge.copySubitem(req)
    } finally {
      setTimeout(() => set({ isInternalCopying: false }), 400)
    }
  },

  async paste(id) {
    set({ isInternalCopying: true })
    await edge.pasteItem(id)
    setTimeout(() => set({ isInternalCopying: false }), 600)
  },

  async pasteSubitem(req) {
    set({ isInternalCopying: true })
    try {
      await edge.pasteSubitem(req)
    } finally {
      setTimeout(() => set({ isInternalCopying: false }), 600)
    }
  },

  async pasteEmoji(text) {
    set({ isInternalCopying: true })
    try {
      await edge.pasteEmoji(text)
    } finally {
      setTimeout(() => set({ isInternalCopying: false }), 400)
    }
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
  },

  edgeTransition: null,
  async startEdgeTransition(to) {
    if (get().edgeTransition?.active) return
    const current = (get().settings.stickPosition || 'left') as 'left' | 'right' | 'top'
    if (current === to) return

    const reduceMotion = get().settings.reduceMotion

    if (reduceMotion) {
      playButtonClickSound()
      set({ settingsTab: 'position' })
      await get().patchSettings({ stickPosition: to })
      get().notifyPositionChanged()
      return
    }

    // 1. Edge-drop retracts into the bar (260ms)
    playEdgeRetractSound()
    set({
      edgeTransition: {
        active: true,
        from: current,
        to,
        stage: 'retracting'
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 260))

    // 2. Edge bar instantly fades away (100ms)
    set({
      edgeTransition: {
        active: true,
        from: current,
        to,
        stage: 'bar_fade_out'
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 3. Reposition window & patch settings to selected edge while invisible
    await get().patchSettings({ stickPosition: to })
    get().notifyPositionChanged()
    await new Promise((resolve) => setTimeout(resolve, 30))

    // 4. In selected edge, edge bar fades in (120ms)
    playEdgeBeaconAppearSound()
    set({
      settingsTab: 'position',
      edgeTransition: {
        active: true,
        from: current,
        to,
        stage: 'bar_fade_in'
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 120))

    // 5. Clipboard expands from the bar (300ms)
    playEdgeExpandSound()
    set({
      edgeTransition: {
        active: true,
        from: current,
        to,
        stage: 'expanding'
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 300))

    // 6. Reset transition state & start stay window from expansion completion
    set({ edgeTransition: null })
    get().notifyPositionChanged()
  }
}))
