/**
 * Reports genuinely new clipboard content.
 *
 * Windows Explorer delay-renders formats after a copy (paths, then bitmap,
 * then extra shell data). Each render bumps the sequence number. Reading the
 * clipboard inside WM_CLIPBOARDUPDATE forces the next render and looks like
 * many copies of the same files. We therefore:
 *   1. Detect change via GetClipboardSequenceNumber only (no OpenClipboard).
 *   2. Reset a settle window on every bump and capture once it is quiet.
 *   3. Ignore a second capture of the same content for a short coalescing
 *      window so late Explorer thumbnails do not bump hitCount.
 *   4. Never re-read a just-captured file list during that window — another
 *      OpenClipboard restarts Explorer's delay-render and hitCount climbs.
 *   5. If the path list is unchanged, ignore later sequence bumps entirely.
 *      Closing Explorer flushes delayed formats (WM_RENDERALLFORMATS) seconds
 *      later and would otherwise look like a second copy.
 * A slow interval remains as a fallback if the OS message is missed.
 */
import { clipboard } from 'electron'
import { createId } from '../store/ids'
import {
  readClipboard,
  clipboardSignature,
  getClipboardSequenceNumber,
  clipboardHasFileNameW,
  clipboardTextContent,
  clipboardFilesContentKey
} from './formats'
import { contentSignature } from '../store/signature'
import type { ItemData } from '../../shared/types'

/**
 * Fired when genuinely new clipboard content lands on the clipboard. For image captures
 * the raw PNG bytes are handed over as the second argument so the store can
 * persist them without re-reading the clipboard.
 */
export type NewItemHandler = (data: ItemData, imagePng?: Buffer) => void

/** Ignore a second capture of identical content this soon (Explorer late formats). */
const COALESCE_MS = 500
/** Extra settles to wait when Explorer advertised files that are not readable yet. */
const MAX_INCOMPLETE_RETRIES = 4

export class ClipboardWatcher {
  private timer: NodeJS.Timeout | null = null
  private settleTimer: NodeJS.Timeout | null = null
  private lastSig = 'empty'
  private lastSeq = 0
  private lastCapturedKey = ''
  private lastCapturedAt = 0
  private paused = false
  private reading = false
  private incompleteTries = 0
  private readonly intervalMs: number
  private readonly settleMs: number
  private onNew: NewItemHandler | null = null
  private onHint: (() => void) | null = null

  constructor(intervalMs = 300, settleMs = 220) {
    this.intervalMs = intervalMs
    this.settleMs = settleMs
  }

  /**
   * Start watching. `onNew` fires once content is stable.
   * `onHint` fires on the same tick the OS sequence number changes so the
   * copy indicator can appear without waiting for settle + persist.
   */
  start(onNew: NewItemHandler, onHint?: () => void): void {
    if (this.timer) return
    this.onNew = onNew
    this.onHint = onHint ?? null
    // Seed the signature so we don't re-fire for whatever is already on the
    // clipboard at startup (the user didn't "just" copy it).
    this.lastSeq = getClipboardSequenceNumber()
    this.lastSig = this.lastSeq > 0 ? `seq:${this.lastSeq}` : clipboardSignature()

    this.timer = setInterval(() => this.pollTick(), this.intervalMs)
  }

  /** Run one poll immediately (WM_CLIPBOARDUPDATE). Safe if not started. */
  nudge(): void {
    if (!this.onNew || this.paused || this.reading) return
    this.pollTick()
  }

  private inCoalesceWindow(now = Date.now()): boolean {
    return this.lastCapturedKey !== '' && now - this.lastCapturedAt < COALESCE_MS
  }

  /**
   * Explorer keeps bumping the sequence number as delayed formats appear,
   * and again when the source window closes (WM_RENDERALLFORMATS).
   * Reading the clipboard to inspect them retriggers that pipeline.
   *
   * Same file list: absorb with no time limit — closing Explorer is not a copy.
   * Text/image: absorb only inside the short coalesce window so a real re-copy
   * of the same text still counts.
   */
  private absorbLateExplorerFormats(now: number): boolean {
    if (!this.lastCapturedKey) return false
    if (this.lastCapturedKey.startsWith('files|')) {
      const next = clipboardFilesContentKey()
      if (next === null) return false
      if (next === this.lastCapturedKey) return true
      // FileNameW is first-file-only when CF_UNICODETEXT is missing. Explorer
      // close still has that first path; a different drop does not.
      const lastPaths = this.lastCapturedKey.slice('files|'.length).split('\n')
      const nextPaths = next.slice('files|'.length).split('\n')
      return nextPaths.length === 1 && lastPaths.includes(nextPaths[0])
    }
    if (!this.inCoalesceWindow(now)) return false
    if (this.lastCapturedKey.startsWith('image|')) return !clipboardHasFileNameW()
    if (this.lastCapturedKey.startsWith('text|')) {
      const t = clipboardTextContent()
      return t !== null && this.lastCapturedKey === `text|${t}`
    }
    return false
  }

  private pollTick(): void {
    if (this.paused || !this.onNew || this.reading) return

    const seq = getClipboardSequenceNumber()
    if (seq > 0) {
      if (seq === this.lastSeq) return
      this.lastSeq = seq
    } else {
      const sig = clipboardSignature()
      if (sig === this.lastSig) return
      this.lastSig = sig
    }

    const now = Date.now()
    if (this.absorbLateExplorerFormats(now)) {
      this.lastCapturedAt = now
      if (this.settleTimer) {
        clearTimeout(this.settleTimer)
        this.settleTimer = null
      }
      return
    }

    const alreadySettling = this.settleTimer !== null
    if (this.settleTimer) clearTimeout(this.settleTimer)
    if (!alreadySettling && !this.inCoalesceWindow(now)) {
      try {
        this.onHint?.()
      } catch (err) {
        console.error('[ClipboardWatcher] onHint failed:', err)
      }
    }

    this.settleTimer = setTimeout(() => {
      void this.commitCapture()
    }, this.settleMs)
  }

  private async commitCapture(): Promise<void> {
    this.settleTimer = null
    if (this.paused || !this.onNew) return

    const seqWhenSettled = this.lastSeq
    this.reading = true
    try {
      const data = await readClipboard()
      // Absorb sequence bumps caused by our own OpenClipboard / format requests.
      this.lastSeq = getClipboardSequenceNumber()
      this.lastSig = this.lastSeq > 0 ? `seq:${this.lastSeq}` : clipboardSignature()
      if (!data) {
        if (this.incompleteTries < MAX_INCOMPLETE_RETRIES) {
          this.incompleteTries++
          this.settleTimer = setTimeout(() => {
            void this.commitCapture()
          }, this.settleMs)
        } else {
          this.incompleteTries = 0
        }
        return
      }
      this.incompleteTries = 0

      let png: Buffer | undefined
      if (data.kind === 'image') {
        const img = clipboard.readImage()
        png = img.toPNG()
        data.imageId = createId()
        data.bytes = png.length
        data.ext = 'png'
        this.lastSeq = getClipboardSequenceNumber()
      }

      const key = contentSignature(data)
      const now = Date.now()
      const sameAsLast = key === this.lastCapturedKey
      const filesUnchanged = sameAsLast && data.kind === 'files'
      if (sameAsLast && (filesUnchanged || now - this.lastCapturedAt < COALESCE_MS)) {
        // Same payload. Files stay absorbed for as long as the path list is
        // unchanged (Explorer window close is not a copy). Other kinds only
        // coalesce briefly so a real re-copy of the same text still counts.
        this.lastCapturedAt = now
        return
      }
      this.lastCapturedKey = key
      this.lastCapturedAt = now

      if (data.kind === 'image') this.onNew(data, png)
      else this.onNew(data)
    } finally {
      this.reading = false
      const seqNow = getClipboardSequenceNumber()
      if (this.settleTimer) {
        // Incomplete file list: retry is already scheduled. Only restart if
        // a newer copy landed after that read.
        if (seqNow !== this.lastSeq) this.pollTick()
        return
      }
      if (seqNow !== this.lastSeq) {
        this.pollTick()
      } else if (seqNow !== seqWhenSettled) {
        // Seq moved during our read. Explorer delay-renders of a file list
        // are absorbed without another OpenClipboard; a real new copy is not.
        this.lastSeq = seqWhenSettled
        this.pollTick()
      }
    }
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
      this.lastSeq = getClipboardSequenceNumber()
      this.lastSig = this.lastSeq > 0 ? `seq:${this.lastSeq}` : clipboardSignature()
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
    this.incompleteTries = 0
    this.lastSeq = getClipboardSequenceNumber()
    this.lastSig = this.lastSeq > 0 ? `seq:${this.lastSeq}` : clipboardSignature()
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
    this.incompleteTries = 0
    this.lastSig = '__post-paste__'
    this.lastSeq = -1
    this.lastCapturedKey = ''
    this.lastCapturedAt = 0
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
