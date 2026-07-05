import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
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

  // WB-012: run the apply off-request via the vendor-sync subscriber (global
  // container — the module cradle can't resolve core modules). `approveAndApply`
  // itself writes status:applying + clears cancel_requested_at at its start, so
  // we don't pre-write status here; the 202 body below is optimistic.
  const eventBus = req.scope.resolve(Modules.EVENT_BUS)
  await eventBus.emit({
    name: "vendor-sync.approve",
    data: { runId: id, actorId },
  })

  res.status(202).json({ run: { ...run, status: "applying", approved_by: actorId } })
}
