/**
 * Staged-temp artifact lifecycle manager.
 *
 * WHY THIS EXISTS
 * ---------------
 * Drag-out and image paste stage copies of clipboard content into the temp
 * dirs (pretty-named screenshots, snippet .txt files, Store-interop copies).
 * Historically `cleanTemp()` wiped ALL of those on every app start, which:
 *   1. Broke external references to recently staged files (e.g. a Word doc
 *      holding the file reference written by paste).
 *   2. Let files accumulate for items that were deleted from history while
 *      the app kept running.
 *
 * This module ties every staged file's lifetime to its owner's lifetime:
 *   - `recordStagedFiles()`     — staging registers what it created.
 *   - `forgetStagedItems()`     — ItemStore removal hooks evict the artifacts
 *                                 of dead items immediately.
 *   - `reconcileTempOnStartup()`— one cheap launch-time sweep removes crash
 *                                 orphans and anything no living item owns,
 *                                 replacing the old wipe-everything pass.
 *
 * RESOURCE CONTRACT: everything here is event-driven. The only recurring cost
 * is a debounced (150 ms) tiny JSON write after user-triggered staging, plus
 * one directory scan at startup. No timers, no watchers, no polling.
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PATHS, getUnpackagedTempDir, isStagedTempPath } from '../store/paths'
import { contentSignature } from '../store/signature'
import type { ItemData } from '../../shared/types'

interface RegistryEntry {
  /** Content signature of the owning history item. */
  sig: string
  /** Absolute paths of generated artifacts we may delete. */
  files: string[]
}

const REGISTRY_VERSION = 1
/** Hard cap so a pathological session cannot grow the file unboundedly. */
const MAX_REGISTRY_ENTRIES = 512

let entries: RegistryEntry[] = []
let loaded = false
let persistTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Lazy, failure-tolerant load. A missing/corrupt registry yields an empty
 * list; reconcileTempOnStartup then treats every temp artifact as unowned and
 * clears it once (identical to the legacy cleanTemp behaviour), after which
 * the registry rebuilds from fresh staging. Self-healing by construction.
 */
function ensureLoaded(): void {
  if (loaded) return
  loaded = true
  try {
    const raw = readFileSync(PATHS.stagedTempRegistryFile(), 'utf8')
    const parsed = JSON.parse(raw) as { v?: number; entries?: unknown }
    if (parsed && Array.isArray(parsed.entries)) {
      entries = parsed.entries.filter(
        (e): e is RegistryEntry =>
          !!e &&
          typeof (e as RegistryEntry).sig === 'string' &&
          Array.isArray((e as RegistryEntry).files) &&
          (e as RegistryEntry).files.every((f) => typeof f === 'string')
      )
    }
  } catch {
    entries = []
  }
}

function persistSync(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  try {
    writeFileSync(
      PATHS.stagedTempRegistryFile(),
      JSON.stringify({ v: REGISTRY_VERSION, entries }, null, 2),
      'utf8'
    )
  } catch {
    /* non-fatal: worst case the next startup sweep reaps orphans */
  }
}

function schedulePersist(): void {
  if (persistTimer !== null) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistSync()
  }, 150)
  // Never keep the process alive just for a registry flush.
  ;(persistTimer as unknown as { unref?: () => void }).unref?.()
}

/**
 * Register the artifacts produced by a successful `stageDragFile` call.
 * Only paths inside our managed temp roots are recorded — original user
 * files exposed by `files` bundles are NEVER tracked (deleting those would
 * destroy real user data).
 */
export function recordStagedFiles(data: ItemData, stagedFiles: string[]): void {
  try {
    const ours = stagedFiles.filter((p) => p && isStagedTempPath(p))
    if (ours.length === 0) return
    ensureLoaded()
    const sig = contentSignature(data)
    const existing = entries.find((e) => e.sig === sig)
    if (existing) {
      const merged = new Set(existing.files)
      for (const f of ours) merged.add(f)
      existing.files = [...merged]
    } else {
      entries.push({ sig, files: ours })
      if (entries.length > MAX_REGISTRY_ENTRIES) {
        // Drop the oldest entry. Its artifacts become sweep-managed: they are
        // removed at the next startup reconciliation unless restaged first.
        entries.shift()
      }
    }
    schedulePersist()
  } catch {
    /* ignore — staging itself already succeeded */
  }
}

/**
 * Delete every registered artifact owned by the given (just-removed) history
 * items. Called from the ItemStore removal hook, which fires only after the
 * IPC layer has already resolved system-clipboard ownership (either the live
 * clipboard was cleared because it held this exact content, or it holds
 * something else entirely), so removing the shadow is always safe here.
 */
export function forgetStagedItems(removed: readonly { data: ItemData }[]): void {
  if (!removed || removed.length === 0) return
  try {
    ensureLoaded()
    let changed = false
    for (const item of removed) {
      const sig = contentSignature(item.data)
      const idx = entries.findIndex((e) => e.sig === sig)
      if (idx === -1) continue
      const [dead] = entries.splice(idx, 1)
      changed = true
      for (const f of dead.files) {
        try {
          if (existsSync(f)) rmSync(f, { force: true })
        } catch {
          /* individual file errors must not block siblings */
        }
      }
    }
    if (changed) schedulePersist()
  } catch {
    /* ignore */
  }
}

/**
 * Startup reconciliation. Keeps every artifact whose owning signature is
 * still alive in history; deletes all other managed-temp contents (crash
 * orphans, leftovers of deleted items, legacy pre-registry junk). Runs once
 * per launch — a few milliseconds even with hundreds of files.
 */
export function reconcileTempOnStartup(liveItems: readonly { data: ItemData }[]): void {
  ensureLoaded()
  const liveSigs = new Set(liveItems.map((it) => contentSignature(it.data)))

  const protectedFiles = new Set<string>()
  const survivingEntries: RegistryEntry[] = []
  for (const entry of entries) {
    if (liveSigs.has(entry.sig)) {
      survivingEntries.push(entry)
      for (const f of entry.files) protectedFiles.add(f)
    }
  }
  entries = survivingEntries

  const roots = new Set([PATHS.tempDir(), getUnpackagedTempDir()])
  for (const rootDir of roots) {
    if (!rootDir) continue
    let names: string[] = []
    try {
      names = readdirSync(rootDir)
    } catch {
      continue /* dir missing is fine */
    }
    for (const name of names) {
      const full = join(rootDir, name)
      if (protectedFiles.has(full)) continue
      try {
        rmSync(full, { recursive: true, force: true })
      } catch {
        /* ignore individual failures */
      }
    }
  }

  persistSync()
}

/** Flush pending debounce writes synchronously (app shutdown). */
export function flushStagedTempRegistry(): void {
  ensureLoaded()
  persistSync()
}
