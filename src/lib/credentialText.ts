/**
 * Heuristic detector for credential-shaped clipboard text.
 *
 * Two shapes qualify for the Accounts category:
 *   1. A standalone email address (people copy an account handle all the time).
 *   2. A multi-line block that mentions BOTH an account-ish word and a
 *      secret-ish word (e.g. "username: demo\npassword: ********").
 * Anything else stays out — the user can still move items in manually.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/
const ACCOUNT_RE = /user(?:name)?|akun|account|login|email|@|\bhp\b|nomor/i
const SECRET_RE = /\bpass\w*|kata sandi|\bsandi\b|\bpin\b|\botp\b|token/i

export function isCredentialText(txt: unknown): boolean {
  if (typeof txt !== 'string' || txt.length > 4000) return false
  if (EMAIL_RE.test(txt.trim())) return true
  // Single-line snippets are too ambiguous to classify as accounts.
  if (!txt.includes('\n')) return false
  return ACCOUNT_RE.test(txt) && SECRET_RE.test(txt)
}
