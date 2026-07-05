import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { VENDOR_SYNC_MODULE } from "../../../../modules/vendor-sync"

/**
 * GET /admin/vendor-sync/runs
 * List recent runs with optional filters.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(VENDOR_SYNC_MODULE) as any

  const {
    vendor,
    status,
    limit = "20",
    offset = "0",
  } = req.query as Record<string, string>

  const filters: Record<string, any> = {}
  if (vendor) filters.vendor_code = vendor
  if (status) filters.status = status

  const runs = await service.listVendorFeedRuns(filters, {
    order: { created_at: "DESC" },
    take: parseInt(limit, 10),
    skip: parseInt(offset, 10),
  })

  res.json({ runs, limit: parseInt(limit, 10), offset: parseInt(offset, 10) })
}

/**
 * POST /admin/vendor-sync/runs
 * Trigger a new sync run for a vendor.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(VENDOR_SYNC_MODULE) as any
  const { vendor_code, dry_run = false } = (req.body ?? {}) as {
    vendor_code?: string
    dry_run?: boolean
  }

  if (!vendor_code) {
    res
      .status(400)
      .json({ type: "invalid_data", message: "vendor_code is required" })
    return
  }

  // Check for in-progress run
  const inProgress = await service.listVendorFeedRuns({
    vendor_code,
    status: ["fetching", "staging", "diffing", "applying"],
  })

  if (inProgress.length > 0) {
    res.status(409).json({
      type: "conflict",
      message: "A run is already in progress for this vendor",
    })
    return
  }

  // WB-011: reserve the run row synchronously (the in-progress guard lives in
  // startRun too, so this is race-safe against the pre-check above), then hand
  // the fetch->stage->diff->apply pipeline to the vendor-sync subscriber. The
  // subscriber runs on the GLOBAL container, which — unlike the module cradle
  // (`this.container_`) — can resolve the core region/product/inventory modules
  // the apply workflows need. `req.scope` (which CAN resolve the event bus) is
  // disposed once this response is sent, so the deferred work must not use it.
  const { runId, inProgress: reservedInProgress } = await service.startRun(
    vendor_code,
    "full"
  )

  if (reservedInProgress) {
    res.status(409).json({
      type: "conflict",
      message: "A run is already in progress for this vendor",
    })
    return
  }

  const eventBus = req.scope.resolve(Modules.EVENT_BUS)
  await eventBus.emit({
    name: "vendor-sync.execute",
    data: { runId, vendorCode: vendor_code, dryRun: dry_run },
  })

  res.status(201).json({ run_id: runId })
}
