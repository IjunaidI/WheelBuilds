/**
 * Pure decision helpers for the WB-016 bounded partial-apply retry.
 * No I/O — unit-tested in isolation.
 */

export type TerminalStatus = "completed" | "partially_failed" | "exhausted"

/**
 * Terminal status for a finished apply.
 *  - no errors                       -> completed
 *  - errors, attempt < maxAttempts   -> partially_failed (will be retried)
 *  - errors, attempt >= maxAttempts  -> exhausted (gave up)
 */
export function decideTerminalStatus(
  errorCount: number,
  attempt: number,
  maxAttempts: number
): TerminalStatus {
  if (errorCount === 0) return "completed"
  if (attempt >= maxAttempts) return "exhausted"
  return "partially_failed"
}

/**
 * The RunDate short-circuit fires only when this feed has already reached a
 * "done" state. A `partially_failed` latest run must NOT short-circuit so the
 * next cron cycle retries it.
 */
export function shouldShortCircuitFeed(
  latestSameFeedStatus: string | null | undefined
): boolean {
  return (
    latestSameFeedStatus === "completed" || latestSameFeedStatus === "exhausted"
  )
}

/** Carry the attempt count forward: max over prior same-feed runs + 1. */
export function nextAttemptNumber(priorAttemptCounts: number[]): number {
  const max = priorAttemptCounts.reduce((m, n) => (n > m ? n : m), 0)
  return max + 1
}

/** Unique, defined group keys from an ApplyResult.errors list. */
export function uniqueGroupKeys(errors: Array<{ groupKey?: string }>): string[] {
  const set = new Set<string>()
  for (const e of errors) if (e.groupKey) set.add(e.groupKey)
  return [...set]
}
