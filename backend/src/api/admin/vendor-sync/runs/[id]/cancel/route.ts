import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { VENDOR_SYNC_MODULE } from "../../../../../../modules/vendor-sync"

const CANCELLABLE_STATUSES = [
  "awaiting_approval",
  "applying",
  "staging",
  "diffing",
  "fetching",
]

/**
 * POST /admin/vendor-sync/runs/:id/cancel
 * Cancel a run that is in progress or awaiting approval.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(VENDOR_SYNC_MODULE) as any
  const { id } = req.params

  const [run] = await service.listVendorFeedRuns({ id })
  if (!run) {
    res.status(404).json({ type: "not_found", message: "Run not found" })
    return
  }

  if (!CANCELLABLE_STATUSES.includes(run.status)) {
    res.status(400).json({
      type: "invalid_data",
      message: `Cannot cancel run with status: ${run.status}`,
    })
    return
  }

  await service.updateVendorFeedRuns(
    { id },
    { status: "cancelled", finished_at: new Date() }
  )

  res.json({ run: { ...run, status: "cancelled", finished_at: new Date() } })
}
