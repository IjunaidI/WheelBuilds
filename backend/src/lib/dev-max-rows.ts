/**
 * Vendor-sync feed-truncation cap (WB-027).
 *
 * Truncation is an explicit, environment-independent choice: it is active ONLY when
 * VENDOR_SYNC_DEV_MAX_ROWS is set to a positive integer. There is intentionally NO
 * NODE_ENV coupling — a NODE_ENV=staging box must never silently truncate the feed.
 *
 * @param raw the raw VENDOR_SYNC_DEV_MAX_ROWS env value
 * @returns a positive row cap, or undefined for "no cap / full feed"
 */
export function resolveDevMaxRows(raw: string | undefined): number | undefined {
  if (raw == null) return undefined
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const n = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return n
}
