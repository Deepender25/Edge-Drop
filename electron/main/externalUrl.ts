/**
 * Which URLs the renderer may hand to the OS (window.open -> shell.openExternal).
 *
 * Links come from clipboard history, i.e. from anything the user ever copied,
 * so only web links, mail and phone links and the Microsoft Store review link
 * the settings page uses are passed on. Everything else (file:, javascript:,
 * custom protocol handlers) is refused.
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:', 'ms-windows-store:'])

export function isSafeExternalUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 8192) return false
  try {
    return ALLOWED_PROTOCOLS.has(new URL(raw).protocol)
  } catch {
    return false
  }
}
