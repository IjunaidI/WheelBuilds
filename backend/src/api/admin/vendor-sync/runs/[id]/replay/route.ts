import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
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

  // WB-013: run the replay off-request via the vendor-sync subscriber (global
  // container — the module cradle can't resolve core modules). Return 202
  // immediately; `replayRun` writes status:applying at its start.
  const eventBus = req.scope.resolve(Modules.EVENT_BUS)
  await eventBus.emit({
    name: "vendor-sync.replay",
    data: { runId: id },
  })

  res.status(202).json({ run: { ...run, status: "applying" } })
}
