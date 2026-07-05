import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { VENDOR_SYNC_MODULE } from "../../../../../../modules/vendor-sync"

/**
 * POST /admin/vendor-sync/skus/:partNumber/replay
 * Replay a single SKU using the most recent staging data.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(VENDOR_SYNC_MODULE) as any
  const { partNumber } = req.params
  const { vendor_code } = ((req.body as any) ?? {}) as {
    vendor_code?: string
  }

  if (!vendor_code) {
    res
      .status(400)
      .json({ type: "invalid_data", message: "vendor_code is required" })
    return
  }

  // WB-013: run the SKU replay off-request; return 202 immediately.
  service.enqueueReplaySku(vendor_code, partNumber)

  res.status(202).json({
    replaying: { vendor_code, part_number: partNumber },
  })
}
