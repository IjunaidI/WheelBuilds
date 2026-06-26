/** Pure, dependency-free email helpers for the newsletter module. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isValidEmail(raw: string): boolean {
  const e = raw.trim()
  if (e.length < 3 || e.length > 254) return false
  // exactly one @, non-empty local part, domain with at least one dot, no spaces
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}
