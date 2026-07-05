import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { VENDOR_SYNC_MODULE } from "../../../../../../modules/vendor-sync"

/**
 * POST /admin/vendor-sync/runs/:id/replay
 * Replay (re-diff and re-apply) all SKUs from a completed run.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(VENDOR_SYNC_MODULE) as any
  const { id } = req.params

  const [run] = await service.listVendorFeedRuns({ id })
  if (!run) {
    res.status(404).json({ type: "not_found", message: "Run not found" })
    return
  }

  if (!["completed", "failed"].includes(run.status)) {
    res.status(400).json({
      type: "invalid_data",
      message: `Cannot replay run with status: ${run.status}`,
    })
    return
  }

  // WB-013: run the replay off-request; return 202 immediately.
  service.enqueueReplay(id)
  res.status(202).json({ run: { ...run, status: "applying" } })
}
