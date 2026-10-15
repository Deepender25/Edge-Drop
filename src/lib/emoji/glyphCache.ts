/**
 * Emoji glyph images for the picker, loaded a screen at a time.
 *
 * Every image request through the edgelocal:// protocol costs ~1.7ms on the
 * main process's UI thread, the same thread that puts this transparent
 * window's frames on screen. A category switch shows ~90-170 new glyphs, so
 * one request each kept that thread busy for most of the category bar's
 * thumb slide, and the thumb stuttered. Chromium also forgets an image once
 * no element shows it, so every revisit asked again.
 *
 * Instead, glyphs are fetched with one IPC call per screen (emoji:glyphs)
 * and kept as data: URLs: only the small PNG file as text (~3.6KB each).
 * Decoded pixels are still freed when a glyph leaves the screen. An <img>
 * with a data: URL needs nothing from the main process.
 *
 * The cap keeps this under ~3MB. It must stay above what can be on screen
 * at once (a top-dock window with overscan is ~340 glyphs) plus a
 * hover-warmed screen, since a glyph dropped while shown would lose its
 * image. Beyond that, a revisit to a dropped category is one more call.
 */
import { edge } from '../edge'
import { emojiGlyphUrl } from './catalog'

export const GLYPH_CACHE_CAP = 800
/** Glyphs per IPC call (EMOJI_BATCH_MAX in the main process). */
const BATCH = 400

const srcs = new Map<string, string>()
const inflight = new Set<string>()
const listeners = new Set<() => void>()
let version = 0

/** The glyph's image URL once loaded, otherwise undefined. */
export function glyphSrc(file: string): string | undefined {
  return srcs.get(file)
}

/** Load the glyphs not loaded yet (one call per BATCH) and mark all as recently used. */
export function loadGlyphs(files: readonly string[]): void {
  const want: string[] = []
  for (const file of files) {
    const src = srcs.get(file)
    if (src !== undefined) {
      srcs.delete(file)
      srcs.set(file, src)
      continue
    }
    if (inflight.has(file)) continue
    inflight.add(file)
    want.push(file)
  }
  for (let i = 0; i < want.length; i += BATCH) void fetchBatch(want.slice(i, i + BATCH))
}

async function fetchBatch(files: string[]): Promise<void> {
  let got: Record<string, string> | undefined
  try {
    const pending = edge.emojiGlyphs(files) as Promise<Record<string, string>> | undefined
    got = pending && typeof pending.then === 'function' ? await pending : undefined
  } catch {
    got = undefined
  }
  for (const file of files) {
    inflight.delete(file)
    const b64 = got?.[file]
    // No answer for it: fall back to the per-file protocol URL so it still shows.
    srcs.set(file, b64 ? `data:image/png;base64,${b64}` : emojiGlyphUrl(file))
  }
  while (srcs.size > GLYPH_CACHE_CAP) {
    const oldest = srcs.keys().next().value
    if (oldest === undefined) break
    srcs.delete(oldest)
  }
  version++
  for (const listener of listeners) listener()
}

/** useSyncExternalStore pair: re-render when a batch lands. */
export function subscribeGlyphs(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function glyphsVersion(): number {
  return version
}

let screenGlyphs = 48

/** How many glyphs one screen of the grid shows (the picker keeps this current). */
export function setScreenGlyphCount(n: number): void {
  if (Number.isFinite(n) && n > 0) screenGlyphs = Math.min(BATCH, Math.ceil(n))
}

export function screenGlyphCount(): number {
  return screenGlyphs
}
