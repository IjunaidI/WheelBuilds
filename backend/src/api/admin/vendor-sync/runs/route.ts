import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
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

  // Synchronous run -- admin knowingly triggered it
  const { runId } = await service.run(vendor_code, {
    dryRun: dry_run,
    container: req.scope,
  })

  res.status(201).json({ run_id: runId })
}
