/**
 * App — root component.
 *
 * Wires up:
 *   - hydration (load items + settings on mount)
 *   - main->renderer event subscriptions (items/settings pushed from main)
 *   - theme application (accent + reduce-motion)
 *   - the edge-hover controller (open/close the blade)
 *   - the Panel itself
 */
import { useEffect, useRef } from 'react'
import { Panel } from './components/Panel'
import { useStore } from './store/appStore'
import { edge } from './lib/edge'
import { applyReduceMotion } from './lib/theme'
import { useEdgeHover } from './hooks/useEdgeHover'

export default function App() {
  const hydrate = useStore((s) => s.hydrate)
  const setItems = useStore((s) => s.setItems)
  const setSettings = useStore((s) => s.setSettings)
  const pushToast = useStore((s) => s.pushToast)
  const settings = useStore((s) => s.settings)
  const hydrated = useStore((s) => s.hydrated)
  const panelOpen = useStore((s) => s.open)
  const warmupDone = useRef(false)
  const audioWarmed = useRef(false)

  // Drive the edge open/close behavior.
  useEdgeHover()

  // Cold-start warmup (no visual / feature change).
  // The first shelf open and first emoji open jank because one-time init
  // (font raster, emoji JSON parse, AudioContext creation, thumbnail decode,
  // framer-motion JIT) lands inside the open animation. Warm each once, idle,
  // after hydration so later opens reuse warm caches. Steady-state RAM/CPU
  // are unchanged: every artifact warmed here is created on first use anyway.
  useEffect(() => {
    if (!hydrated || warmupDone.current) return
    warmupDone.current = true
    let cancelled = false
    let idleHandle: any = null
    let timeoutHandle: any = null

    const warm = () => {
      if (cancelled) return
      // 1. Fonts declared in main.tsx — rasterize off the animation path.
      try {
        const doc = (globalThis as any)?.document
        const fonts = doc?.fonts
        if (fonts?.load) {
          void Promise.allSettled([
            fonts.load('400 12px "Plus Jakarta Sans"'),
            fonts.load('500 12px "Plus Jakarta Sans"'),
            fonts.load('600 12px "Plus Jakarta Sans"'),
            fonts.load('700 12px "Plus Jakarta Sans"'),
            fonts.load('400 12px "JetBrains Mono"'),
            fonts.load('500 12px "JetBrains Mono"')
          ]).catch(() => {})
        }
      } catch { /* ignore */ }
      // 2. Emoji catalog JSON parse + build — cached in load.ts `pending`
      // so the first emoji click reuses it instead of parsing on click.
      // Then pre-warm the first screen of the default (smileys) category:
      // ~48 glyph PNGs fetched through the same edgelocal:// URLs the grid
      // uses, so the click finds warm main-process stats + Chromium cache
      // instead of causing a ~100-file burst. Same images, same cache —
      // just filled idle instead of on click.
      try {
        void Promise.all([import('./lib/emoji/load'), import('./lib/emoji/catalog')])
          .then(([loadMod, catalogMod]) =>
            loadMod.loadEmojiCatalog().then((catalog) => {
              if (cancelled || !catalog) return
              try {
                const smileys = catalogMod.CATEGORY_ORDER.find((c) => c.id === 'smileys')
                const sources = (smileys as { sources?: readonly string[] } | undefined)?.sources ?? []
                const files: string[] = []
                for (const src of sources) {
                  const list = (catalog.byCategory as Record<string, Array<{ file?: string }>>)[src] ?? []
                  for (const entry of list) {
                    if (typeof entry?.file === 'string' && entry.file) files.push(entry.file)
                    if (files.length >= 48) break
                  }
                  if (files.length >= 48) break
                }
                const ImgCtor = (globalThis as any)?.Image
                if (typeof ImgCtor !== 'function') return
                for (const file of files) {
                  if (cancelled) break
                  try {
                    const im = new ImgCtor() as HTMLImageElement
                    try { (im as any).decoding = 'async' } catch { /* ignore */ }
                    im.src = catalogMod.emojiGlyphUrl(file)
                  } catch { /* ignore */ }
                }
              } catch { /* ignore */ }
            }).catch(() => undefined)
          )
          .catch(() => undefined)
      } catch { /* ignore */ }
      // 3. Shared AudioContext singleton — creation/resume off the gesture.
      try {
        void import('./lib/soundEffects')
          .then((m) => {
            try { m.warmAudioContext() } catch { /* ignore */ }
          })
          .catch(() => undefined)
      } catch { /* ignore */ }
      // 4. Framer-motion solver JIT (module already bundled via Panel).
      try {
        void import('framer-motion')
          .then((m) => {
            try {
              const animate = (m as any)?.animate
              if (typeof animate === 'function') void animate(0, 0, { duration: 0.01 } as any)
            } catch { /* ignore */ }
          })
          .catch(() => undefined)
      } catch { /* ignore */ }
      // 5. First viewport thumbnails — prefetch through the same
      // edgelocal/data URLs the cards use, warming both the main-process
      // thumbnail cache and Chromium's decoded-image cache.
      try {
        const items = useStore.getState().items ?? []
        const urls: string[] = []
        for (const it of items) {
          const d = (it as any)?.data
          if (!d) continue
          if (typeof d.preview === 'string' && d.preview) urls.push(d.preview)
          if (Array.isArray(d.images)) {
            for (const im of d.images) {
              if (typeof im?.preview === 'string' && im.preview) urls.push(im.preview)
            }
          }
          if (Array.isArray(d.previews)) {
            for (const p of d.previews) {
              if (typeof p === 'string' && p) urls.push(p)
            }
          }
          if (Array.isArray(d.entries)) {
            for (const e of d.entries) {
              if (typeof e?.preview === 'string' && e.preview) urls.push(e.preview)
            }
          }
          if (urls.length >= 12) break
        }
        const ImgCtor = (globalThis as any)?.Image
        if (typeof ImgCtor === 'function') {
          for (const u of urls.slice(0, 12)) {
            try {
              const im = new ImgCtor() as HTMLImageElement
              try { (im as any).decoding = 'async' } catch { /* ignore */ }
              im.src = u
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }

    try {
      const ric = (globalThis as any)?.requestIdleCallback
      if (typeof ric === 'function') {
        idleHandle = ric(() => warm(), { timeout: 3000 })
      } else {
        timeoutHandle = setTimeout(warm, 1500)
      }
    } catch {
      try { timeoutHandle = setTimeout(warm, 1500) } catch { /* ignore */ }
    }
    return () => {
      cancelled = true
      try {
        const cic = (globalThis as any)?.cancelIdleCallback
        if (idleHandle != null && typeof cic === 'function') cic(idleHandle)
      } catch { /* ignore */ }
      try {
        if (timeoutHandle != null) clearTimeout(timeoutHandle)
      } catch { /* ignore */ }
    }
  }, [hydrated])

  // Warm the shared AudioContext shortly after the first panel open, via
  // idle callback so it never lands inside the blade spring. First-click
  // sounds otherwise pay full AudioContext construction on the click frame.
  useEffect(() => {
    if (!panelOpen || audioWarmed.current) return
    audioWarmed.current = true
    let idleHandle: any = null
    let timeoutHandle: any = null
    const warmAudio = () => {
      try {
        void import('./lib/soundEffects')
          .then((m) => {
            try { m.warmAudioContext() } catch { /* ignore */ }
          })
          .catch(() => undefined)
      } catch { /* ignore */ }
    }
    try {
      const ric = (globalThis as any)?.requestIdleCallback
      if (typeof ric === 'function') {
        idleHandle = ric(() => warmAudio(), { timeout: 2000 })
      } else {
        timeoutHandle = setTimeout(warmAudio, 800)
      }
    } catch {
      try { timeoutHandle = setTimeout(warmAudio, 800) } catch { /* ignore */ }
    }
    return () => {
      try {
        const cic = (globalThis as any)?.cancelIdleCallback
        if (idleHandle != null && typeof cic === 'function') cic(idleHandle)
      } catch { /* ignore */ }
      try {
        if (timeoutHandle != null) clearTimeout(timeoutHandle)
      } catch { /* ignore */ }
    }
  }, [panelOpen])

  // Hydrate once + subscribe to pushed updates.
  useEffect(() => {
    void hydrate()
    const offItems = edge.onItems((items, meta) => setItems(items, meta))
    const offSettings = edge.onSettings((next) => setSettings(next))
    const offToast = edge.onToast((t) => pushToast(t))
    const offToggle = edge.onToggle((forceOpen) => {
      const next = forceOpen !== undefined ? forceOpen : !useStore.getState().open
      if (!next) {
        const state = useStore.getState()
        // If the indicator style flyout is open, let its exit spring play first
        // before collapsing the main panel — same sequencing as useEdgeHover's
        // closePanel(). Without this, both animate simultaneously and it looks broken.
        if (state.styleFlyoutOpen) {
          state.setStyleFlyoutOpen(false)
          window.setTimeout(() => {
            const s = useStore.getState()
            if (s.previewItemId) {
              s.setPreviewItemId(null)
              edge.setInteractive(false)
              window.setTimeout(() => { useStore.getState().setOpen(false) }, 240)
            } else {
              s.setOpen(false)
              edge.setInteractive(false)
            }
          }, 300)
        } else if (state.previewItemId) {
          state.setPreviewItemId(null)
          edge.setInteractive(false)
          window.setTimeout(() => {
            useStore.getState().setOpen(false)
          }, 240)
        } else {
          state.setOpen(false)
          edge.setInteractive(false)
        }
      } else {
        useStore.getState().setOpen(next)
        edge.setInteractive(next)
      }
    })
    const offOpenSettings = edge.onOpenSettings(() => {
      useStore.getState().setOpen(true)
      useStore.getState().setSettingsOpen(true)
      edge.setInteractive(true)
    })
    const offTutorialStep = edge.onTutorialStep((step) => {
      useStore.getState().setTutorialStep(step)
    })
    const offUpdateAvailable = edge.onUpdateAvailable((info) => {
      useStore.getState().setUpdateAvailable(info)
    })
    const offUpdateProgress = edge.onUpdateProgress((progress) => {
      useStore.getState().setUpdateProgress(progress)
    })
    const offUpdateDownloaded = edge.onUpdateDownloaded((info) => {
      useStore.getState().setUpdateDownloaded(info)
    })
    const offCopyFlare = edge.onCopyFlare(() => {
      if (useStore.getState().isInternalCopying) return
      useStore.getState().triggerCopyFlare()
    })
    // Recover any update findings that landed before we subscribed (slow
    // first load can miss the startup check's fire-and-forget push).
    // Skip-filtering applies automatically inside setUpdateAvailable.
    void edge.getUpdateState().then((s) => {
      if (!s) return
      const st = useStore.getState()
      if (s.downloaded) {
        st.setUpdateDownloaded({ version: s.latestVersion })
      } else if (s.hasUpdate) {
        st.setUpdateAvailable({ version: s.latestVersion })
        if (s.downloadProgress) st.setUpdateProgress(s.downloadProgress)
      }
    }).catch(() => {})
    return () => {
      offItems()
      offSettings()
      offToast()
      offToggle()
      offOpenSettings()
      offTutorialStep()
      offUpdateAvailable()
      offUpdateProgress()
      offUpdateDownloaded()
      offCopyFlare()
    }
  }, [hydrate, setItems, setSettings, pushToast])

  // Apply theme whenever settings change.
  useEffect(() => {
    applyReduceMotion(settings.reduceMotion)
    const scale = settings.fontSizeScale ?? 1.0
    document.documentElement.style.setProperty('--font-scale', String(scale))
  }, [settings.reduceMotion, settings.fontSizeScale])

  return <Panel />
}
