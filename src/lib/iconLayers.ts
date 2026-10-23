/**
 * Pre-rendered layers for the folder icons' hover "opening".
 *
 * Each icon is cut into back panel, three papers and front pocket
 * (shared/fileIconLayers.ts) and every layer is drawn ONCE, by this window's
 * own renderer, into a bitmap at the exact device-pixel size it is shown at,
 * then kept as a small PNG blob URL. A set is only built when a card with
 * that icon is first hovered (building ahead for every card on screen held
 * ~+29MB). Measured against the alternatives:
 * - live SVG layers cost +27-53MB (one SVG document per layer) and redrew
 *   their blur/grain filters on every hover;
 * - Resvg in main differs visibly from Chrome's rendering.
 * A bitmap drawn by the same engine at the same size matches the SVG <img>
 * (mean 0.05 of 255, same sharpness), costs ~15ms per layer once, ~20-40KB
 * per layer, and moving it is a plain copy. One set per (kind, device size),
 * re-drawn if the display scale changes.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { edge } from './edge'
import { fileIconLayers, ICON_LAYER_PARTS, type IconLayerPart } from '../../shared/fileIconLayers'

export type IconLayerUrls = Record<IconLayerPart, string>

/* ---------------------------- display scale ---------------------------- */

let ratio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
const ratioListeners = new Set<() => void>()

function watchRatio(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  window.matchMedia(`(resolution: ${ratio}dppx)`).addEventListener(
    'change',
    () => {
      ratio = window.devicePixelRatio || 1
      ratioListeners.forEach((l) => l())
      watchRatio()
    },
    { once: true }
  )
}
watchRatio()

function subscribeRatio(l: () => void): () => void {
  ratioListeners.add(l)
  return () => ratioListeners.delete(l)
}

/* ------------------------------- building ------------------------------ */

const sources = new Map<string, Promise<string | null>>()

function sourceOf(kind: string): Promise<string | null> {
  let p = sources.get(kind)
  if (!p) {
    p = Promise.resolve()
      .then(() => edge.iconSvg?.(kind))
      .then((s) => (typeof s === 'string' ? s : null))
      .catch(() => null)
    sources.set(kind, p)
  }
  return p
}

/** Yield between layers so building never holds a frame (~15ms each). */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function rasterize(svg: string, px: number): Promise<string | null> {
  const src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = src
    await img.decode()
    const canvas = new OffscreenCanvas(px, px)
    const g = canvas.getContext('2d')
    if (!g) return null
    g.drawImage(img, 0, 0, px, px)
    return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/png' }))
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(src)
  }
}

function revokeAll(urls: Partial<IconLayerUrls>): void {
  for (const u of Object.values(urls)) if (u) URL.revokeObjectURL(u)
}

async function build(kind: string, px: number): Promise<IconLayerUrls | null> {
  const svg = await sourceOf(kind)
  const layers = svg ? fileIconLayers(svg) : null
  if (!layers) return null
  const out: Partial<IconLayerUrls> = {}
  for (const part of ICON_LAYER_PARTS) {
    await nextTask()
    const url = await rasterize(layers[part], px)
    if (!url) {
      revokeAll(out)
      return null
    }
    out[part] = url
  }
  return out as IconLayerUrls
}

/* -------------------------------- cache -------------------------------- */

/** Sets kept (each ~100-200KB of PNG); the oldest is dropped past this. */
const MAX_SETS = 32
const pending = new Map<string, Promise<IconLayerUrls | null>>()
const done = new Map<string, IconLayerUrls>()

function request(kind: string, px: number): Promise<IconLayerUrls | null> {
  const key = `${kind}|${px}`
  const hit = pending.get(key)
  if (hit) return hit
  const p = build(kind, px).then((urls) => {
    if (urls) {
      done.set(key, urls)
      while (done.size > MAX_SETS) {
        const [oldKey, oldUrls] = done.entries().next().value as [string, IconLayerUrls]
        done.delete(oldKey)
        pending.delete(oldKey)
        revokeAll(oldUrls)
      }
    } else {
      pending.delete(key) // a failed build may be retried later
    }
    return urls
  })
  pending.set(key, p)
  return p
}

/**
 * The layer bitmaps for an icon kind shown `cssSize` CSS px wide: ready ones
 * at once; otherwise built when `build` turns true (null until then, or when
 * the icon cannot be layered).
 */
export function useIconLayers(kind: string, cssSize: number | null, build: boolean): IconLayerUrls | null {
  const r = useSyncExternalStore(subscribeRatio, () => ratio, () => 1)
  const px = cssSize && cssSize > 16 ? Math.round(cssSize * r) : 0
  const key = px ? `${kind}|${px}` : ''
  const [state, setState] = useState<{ key: string; urls: IconLayerUrls | null }>(() => ({ key, urls: (key && done.get(key)) || null }))

  useEffect(() => {
    if (!key) return
    const hit = done.get(key)
    if (hit) {
      setState({ key, urls: hit })
      return
    }
    if (!build) return
    let live = true
    void request(kind, px).then((urls) => {
      if (live) setState({ key, urls })
    })
    return () => {
      live = false
    }
  }, [key, kind, px, build])

  return state.key === key ? state.urls : null
}
