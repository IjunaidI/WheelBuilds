/**
 * Pure vendor-sync run-lifecycle guards (WB-070; findings 8/9/16). No I/O.
 */
export type RunLike = {
  id: string
  status: string
  run_date_vendor?: Date | string | null
  cancel_requested_at?: Date | string | null
}

/** Statuses where a run is actively executing the pipeline. */
export const IN_PROGRESS_STATUSES = ["fetching", "staging", "diffing", "applying"]

/**
 * Statuses that block STARTING a new run for the vendor. Includes
 * awaiting_approval (finding 8): a parked run must stop new runs so no newer
 * feed applies underneath it — which would make approving the parked run a
 * silent catalog rollback.
 */
export const BLOCKING_STATUSES = [...IN_PROGRESS_STATUSES, "awaiting_approval"]

/** True if some OTHER run for the vendor is actively applying (finding 9). */
export function isVendorBusy(runs: RunLike[], excludeRunId?: string): boolean {
  return runs.some(
    (r) => r.id !== excludeRunId && IN_PROGRESS_STATUSES.includes(r.status)
  )
}

/**
 * True if a COMPLETED run with a strictly newer run_date_vendor exists for the
 * vendor (finding 8): approving `run` would revert the catalog to an older feed.
 */
export function isRunSuperseded(run: RunLike, vendorRuns: RunLike[]): boolean {
  if (!run.run_date_vendor) return false
  const runTime = new Date(run.run_date_vendor).getTime()
  return vendorRuns.some(
    (r) =>
      r.id !== run.id &&
      r.status === "completed" &&
      r.run_date_vendor != null &&
      new Date(r.run_date_vendor).getTime() > runTime
  )
}

/** True if the run is still validly approvable (finding 16). */
export function canApprove(run: RunLike): boolean {
  return run.status === "awaiting_approval" && !run.cancel_requested_at
}
