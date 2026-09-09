/** Clipboard/HTML drag payload helpers shared by the renderer and preload. */

/**
 * macOS Finder commonly exposes a drag as `text/uri-list` even when Chromium
 * does not populate DataTransfer.files. Recognize all useful external payloads
 * so the edge panel opens and stays interactive during the gesture.
 */
export function hasExternalDragPayload(types: Iterable<string>): boolean {
  const normalized = new Set(Array.from(types, (type) => type.toLowerCase()))
  return normalized.has('files') ||
    normalized.has('text/uri-list') ||
    normalized.has('public.file-url') ||
    normalized.has('text/plain') ||
    normalized.has('text/html') ||
    normalized.has('url')
}

/** Decode local file URLs from an RFC 2483/Chromium URI-list payload. */
export function filePathsFromUriList(raw: string, platform: string): string[] {
  const paths: string[] = []
  const seen = new Set<string>()

  for (const line of raw.split(/\r?\n/)) {
    const value = line.trim()
    if (!value || value.startsWith('#')) continue

    try {
      const url = new URL(value)
      if (url.protocol !== 'file:') continue

      let path = decodeURIComponent(url.pathname)
      if (platform === 'win32') {
        path = path.replace(/^\/([a-zA-Z]:)/, '$1').replace(/\//g, '\\')
        if (url.hostname && url.hostname !== 'localhost') {
          path = `\\\\${url.hostname}${path.startsWith('\\') ? '' : '\\'}${path}`
        }
      } else if (url.hostname && url.hostname !== 'localhost') {
        path = `//${url.hostname}${path}`
      }

      if (path && !seen.has(path)) {
        seen.add(path)
        paths.push(path)
      }
    } catch {
      // Ignore malformed or non-URL lines; callers may still handle them as text.
    }
  }

  return paths
}
