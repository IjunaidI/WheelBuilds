import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { VENDOR_SYNC_MODULE } from "../../../../../../modules/vendor-sync"

/**
 * POST /admin/vendor-sync/runs/:id/approve
 * Approve a run that is awaiting approval, then apply changes.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(VENDOR_SYNC_MODULE) as any
  const { id } = req.params

  const [run] = await service.listVendorFeedRuns({ id })
  if (!run) {
    res.status(404).json({ type: "not_found", message: "Run not found" })
    return
  }

  if (run.status !== "awaiting_approval") {
    res.status(400).json({
      type: "invalid_data",
      message: `Cannot approve run with status: ${run.status}`,
    })
    return
  }

  const actorId = (req as any).auth_context?.actor_id || "admin"

  // WB-012: run the apply off-request; return 202 immediately.
  service.enqueueApprove(id, actorId)
  res.status(202).json({ run: { ...run, status: "applying", approved_by: actorId } })
}
