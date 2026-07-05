import { ApplyResult } from "./apply"
import {
  decideTerminalStatus,
  nextAttemptNumber,
  uniqueGroupKeys,
} from "./retry-policy"

interface FinalizeService {
  listVendorFeedRuns(filter: any, config?: any): Promise<any[]>
  updateVendorFeedRuns(data: any): Promise<any>
}

/**
 * Single terminal transition for an apply (WB-016), shared by run /
 * approveAndApply / replayRun. On cancellation (WB-037), this function OWNS
 * the status transition: sets status=cancelled + finished_at (plus any
 * partial-progress failures). Callers (the cancel route, in particular) must
 * not force-set status while a run is executing — only finalizeApply does,
 * once the apply loop actually stops. Otherwise compute the bounded attempt
 * number and set completed / partially_failed / exhausted.
 */
export async function finalizeApply(
  service: FinalizeService,
  params: {
    runId: string
    vendorCode: string
    feedDate: Date | null
    result: ApplyResult
    maxAttempts: number
  }
): Promise<{ status: string; attempt: number }> {
  const { runId, vendorCode, feedDate, result, maxAttempts } = params

  if (result.cancelled) {
    await service.updateVendorFeedRuns({
      id: runId,
      status: "cancelled",
      finished_at: new Date(),
      ...(result.errors.length > 0
        ? { failed_part_numbers: result.errors, failed_group_keys: uniqueGroupKeys(result.errors) }
        : {}),
    })
    return { status: "cancelled", attempt: 0 }
  }

  const priorCounts = feedDate
    ? (
        await service.listVendorFeedRuns(
          { vendor_code: vendorCode },
          { order: { started_at: "DESC" }, take: 25 }
        )
      )
        .filter(
          (r: any) =>
            r.id !== runId &&
            r.run_date_vendor != null &&
            new Date(r.run_date_vendor).getTime() === feedDate.getTime()
        )
        .map((r: any) => Number(r.apply_attempt_count ?? 0))
    : []

  const attempt = nextAttemptNumber(priorCounts)
  const status = decideTerminalStatus(result.errorCount, attempt, maxAttempts)
  const hasErrors = result.errors.length > 0

  await service.updateVendorFeedRuns({
    id: runId,
    status,
    failed_part_numbers: hasErrors ? result.errors : null,
    failed_group_keys: hasErrors ? uniqueGroupKeys(result.errors) : null,
    apply_attempt_count: attempt,
    finished_at: new Date(),
  })

  return { status, attempt }
}
