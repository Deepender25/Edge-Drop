/**
 * Polls the system clipboard and reports genuinely new content.
 *
 * Electron has no native clipboard-changed event, so we sample on an interval.
 * To avoid creating duplicate items (and to avoid re-reading the expensive
 * image bytes every tick) we keep a cheap signature of the last seen state and
 * only do the full `readClipboard()` work when it changes.
 */
import { clipboard } from 'electron'
import { createId } from '../store/ids'
import { readClipboard, clipboardSignature } from './formats'
import type { ItemData } from '../../shared/types'

/**
 * Fired when genuinely new content lands on the clipboard. For image captures
 * the raw PNG bytes are handed over as the second argument so the store can
 * persist them without re-reading the clipboard.
 */
export type NewItemHandler = (data: ItemData, imagePng?: Buffer) => void

function getContentSignature(sig: string): string {
  return sig.replace(/^seq:\d+:/, '')
}

export class ClipboardWatcher {
  private timer: NodeJS.Timeout | null = null
  private settleTimer: NodeJS.Timeout | null = null
  private lastSig = 'empty'
  private paused = false
  private readonly intervalMs: number

  constructor(intervalMs = 300) {
    this.intervalMs = intervalMs
  }

  /** Start watching. `onNew` fires for every genuinely new piece of content. */
  start(onNew: NewItemHandler): void {
    if (this.timer) return
    // Seed the signature so we don't re-fire for whatever is already on the
    // clipboard at startup (the user didn't "just" copy it).
    this.lastSig = clipboardSignature()

    this.timer = setInterval(() => {
      if (this.paused) return
      const sig = clipboardSignature()
      // If the full signature (including sequence number) has not changed, do nothing.
      if (sig === this.lastSig) {
        return
      }

      // We detected a change (new content OR OS sequence number incremented from a re-copy of identical content).
      // Update lastSig immediately so subsequent poll intervals don't spawn duplicate settling timers.
      this.lastSig = sig

      if (this.settleTimer) {
        clearTimeout(this.settleTimer)
      }

      // Wait a short moment to ensure multi-format streams (e.g. text + html + bitmaps) have finished writing.
      this.settleTimer = setTimeout(async () => {
        this.settleTimer = null
        if (this.paused) return
        const stableSig = clipboardSignature()
        
        // Ensure content is stable (not transient injection by an app that immediately reverted)
        if (getContentSignature(stableSig) !== getContentSignature(sig) && stableSig !== sig) {
          return
        }

        this.lastSig = stableSig

        // readClipboard is async: on Windows it awaits a PowerShell
        // GetFileDropList() call to retrieve ALL selected files.
        const data = await readClipboard()
        if (!data) {
          return
        }

        // Images need their bytes persisted + an id assigned before publishing.
        if (data.kind === 'image') {
          const img = clipboard.readImage()
          const png = img.toPNG()       // encode once — reuse for both bytes count and file write
          data.imageId = createId()
          data.bytes = png.length
          data.ext = 'png'              // always set so cache key is 'id.png', never 'id.undefined'
          onNew(data, png)
        } else {
          onNew(data)
        }
      }, 150)
    }, this.intervalMs)
  }

  /** Temporarily stop recording (incognito mode or self-copy) without tearing down the timer. */
  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused && this.settleTimer) {
      clearTimeout(this.settleTimer)
      this.settleTimer = null
    }
    // When resuming, refresh the signature so we ignore whatever was copied
    // during the paused state (e.g. self-copies or incognito copies).
    if (!paused) {
      this.lastSig = clipboardSignature()
    }
  }

  /**
   * Resync the watcher's last-seen signature to the current clipboard state.
   *
   * Call this after deleting or clearing items. The goal is dual:
   *
   * 1. Prevent "zombie" re-appearances: if the deleted content is still on the
   *    system clipboard, the watcher must NOT re-add it on the next poll. By
   *    re-seeding lastSig from the live clipboard, the next tick sees no change
   *    and stays quiet.
   *
   * 2. Allow re-capture after genuine re-copy: when the user later copies
   *    something different and then copies the original content again, the
   *    clipboard WILL change (different → original), so the watcher will detect
   *    the change and re-capture it correctly.
   *
   * NOTE: The one edge case this does NOT solve is: user copies X, deletes X
   * from Edge-Drop, then immediately copies X again WITHOUT copying anything
   * else in between (system clipboard never changed). In that narrow case we
   * cannot detect the re-copy because the OS clipboard didn't change. This is
   * an acceptable limitation — the common-case fix (zombie prevention) is far
   * more important.
   */
  resyncSignature(): void {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer)
      this.settleTimer = null
    }
    this.lastSig = clipboardSignature()
  }

  /**
   * Invalidate the watcher's last-seen signature by setting it to a sentinel
   * that can never match a real clipboard signature.
   *
   * Call this after a paste action completes. Unlike resyncSignature(), which
   * would seed lastSig to the current clipboard content (blocking re-detection
   * of the same content), this ensures that the VERY NEXT genuine Ctrl+C —
   * even of the exact same text/image — is always detected and counted.
   *
   * Without this, paste → re-copy same content would be invisible to the watcher
   * (clipboard never changed), so hitCount would never increment on re-copy.
   */
  invalidateSignature(): void {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer)
      this.settleTimer = null
    }
    this.lastSig = '__post-paste__'
  }

  stop(): void {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer)
      this.settleTimer = null
    }
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
