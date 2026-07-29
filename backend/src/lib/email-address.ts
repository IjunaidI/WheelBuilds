/**
 * Pure, dependency-free email helpers shared by the `newsletter` and
 * `support-request` modules (WB-119 Task 1).
 *
 * Promoted out of `modules/newsletter/lib/email.ts` when support-request
 * needed the same rules: copying them would have created a silent drift
 * pair, and importing across module boundaries would couple two Medusa
 * modules for no reason.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isValidEmail(raw: string): boolean {
  const e = raw.trim()
  if (e.length < 3 || e.length > 254) return false
  // exactly one @, non-empty local part, domain with at least one dot, no spaces
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}
