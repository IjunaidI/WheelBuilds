/**
 * Pure decision logic for the vendor-sync watchdog job (WB-081).
 *
 * Two independent checks, both consumed by src/jobs/vendor-sync-watchdog.ts:
 *  - selectFailedRuns: runs that landed in a terminal FAILURE status within the
 *    last polling window (the job runs hourly; the window is interval + slack,
 *    so a boundary run may alert twice — better twice than never).
 *  - selectStaleVendors: enabled vendors with NO completed FULL-mode run inside
 *    the freshness horizon. The 12h cron writes a run row on every execution
 *    (an unchanged feed still lands "completed" via the hash short-circuit), so
 *    a healthy vendor always has a recent full success; silence means the cron
 *    is dead, the SFTP credentials are broken, or every run is failing.
 *
 * Kept pure (no container, no Date.now()) so jest can pin the semantics.
 */

export type AlertableRun = {
  id: string
  vendor_code: string
  status: string
  mode?: string | null
  error_message?: string | null
  finished_at?: Date | string | null
}

/** Terminal statuses that mean "a run went wrong". `cancelled` is deliberate
 * operator action and `superseded` is bookkeeping — neither alerts. */
export const FAILURE_STATUSES = ["failed", "partially_failed", "exhausted"] as const

const toMs = (d: Date | string | null | undefined): number =>
  d instanceof Date ? d.getTime() : typeof d === "string" ? Date.parse(d) : NaN

export function selectFailedRuns(
  runs: AlertableRun[],
  opts: { now: number; windowMs: number }
): AlertableRun[] {
  return runs.filter((r) => {
    if (!(FAILURE_STATUSES as readonly string[]).includes(r.status)) return false
    const t = toMs(r.finished_at)
    return Number.isFinite(t) && t > opts.now - opts.windowMs && t <= opts.now
  })
}

export type StaleVendor = {
  vendorCode: string
  /** ms epoch of the newest completed FULL run, or null when none exists at all. */
  lastFullSuccessAt: number | null
}

export function selectStaleVendors(
  runs: AlertableRun[],
  enabledVendors: string[],
  opts: { now: number; maxAgeMs: number }
): StaleVendor[] {
  return enabledVendors
    .map((vendorCode) => {
      const successTimes = runs
        .filter(
          (r) =>
            r.vendor_code === vendorCode &&
            r.status === "completed" &&
            (r.mode ?? "full") === "full"
        )
        .map((r) => toMs(r.finished_at))
        .filter((t) => Number.isFinite(t))
      const lastFullSuccessAt = successTimes.length ? Math.max(...successTimes) : null
      return { vendorCode, lastFullSuccessAt }
    })
    .filter(
      (v) => v.lastFullSuccessAt == null || v.lastFullSuccessAt < opts.now - opts.maxAgeMs
    )
}
