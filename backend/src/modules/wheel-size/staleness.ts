const DAY_MS = 86_400_000

const toMs = (v: Date | string | null | undefined): number | null => {
  if (v == null) return null
  const t = v instanceof Date ? v.getTime() : Date.parse(v)
  return Number.isFinite(t) ? t : null
}

/** True when the entry is older than ttlDays, or its fetched_at is missing/invalid. */
export function isStale(
  fetchedAt: Date | string | null | undefined,
  ttlDays: number,
  now: Date
): boolean {
  const ms = toMs(fetchedAt)
  if (ms == null) return true
  return now.getTime() - ms > ttlDays * DAY_MS
}

/** Stale rows, oldest-first, capped at batch — the warm cron's work list. */
export function selectStaleForWarm<T extends { fetched_at?: Date | string | null }>(
  rows: T[],
  ttlDays: number,
  now: Date,
  batch: number
): T[] {
  return rows
    .filter((r) => isStale(r.fetched_at, ttlDays, now))
    .sort((a, b) => (toMs(a.fetched_at) ?? 0) - (toMs(b.fetched_at) ?? 0))
    .slice(0, Math.max(batch, 0))
}
