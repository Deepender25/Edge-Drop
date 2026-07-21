/**
 * Input path validation and sanitization helpers for file operations and PowerShell transactions.
 */
import { existsSync } from 'node:fs'

/**
 * Validates a file path string before passing to child processes or OS transactions.
 * Rejects non-strings, empty paths, control characters, NUL bytes, and invalid structures.
 */
export function isValidFilePath(p: unknown): p is string {
  if (typeof p !== 'string') return false
  const trimmed = p.trim()
  if (!trimmed || trimmed.length > 32767) return false

  // Reject NUL bytes and ASCII control characters (0x00-0x1F, 0x7F)
  if (/[\x00-\x1F\x7F]/.test(trimmed)) return false

  // Reject invalid Windows path characters like wildcard chars in concrete file operations
  if (/[*?<>|"]/.test(trimmed)) return false

  return true
}

/**
 * Validates that a path string is safe and points to an existing file on disk.
 */
export function isExistingFilePath(p: unknown): p is string {
  return isValidFilePath(p) && existsSync(p)
}

/**
 * Filter an array of path inputs, returning only valid, existing file paths.
 */
export function filterValidPaths(paths: unknown[]): string[] {
  if (!Array.isArray(paths)) return []
  return paths.filter((p): p is string => isExistingFilePath(p))
}
