/** Local, renderer-only emoji picker preferences. Not part of Settings IPC. */

const RECENTS_KEY = 'edge-drop.emoji.recents'
const TONE_KEY = 'edge-drop.emoji.skinTone'

function storage(): Storage | null {
  try {
    const g = globalThis as { localStorage?: Storage }
    return g.localStorage ?? null
  } catch {
    return null
  }
}

export function loadRecents(): string[] {
  const raw = storage()?.getItem(RECENTS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length < 80)
  } catch {
    return []
  }
}

export function saveRecents(unifieds: readonly string[]): void {
  try {
    storage()?.setItem(RECENTS_KEY, JSON.stringify(unifieds))
  } catch {
    /* quota / private mode */
  }
}

export function loadSkinToneId(): number {
  const raw = storage()?.getItem(TONE_KEY)
  const n = raw == null ? 0 : Number(raw)
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0
}

export function saveSkinToneId(id: number): void {
  try {
    storage()?.setItem(TONE_KEY, String(id))
  } catch {
    /* ignore */
  }
}
