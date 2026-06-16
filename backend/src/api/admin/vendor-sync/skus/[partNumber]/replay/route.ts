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

  await service.replaySku(vendor_code, partNumber, req.scope)

  res.json({
    message: "replay completed",
    part_number: partNumber,
    vendor_code,
  })
}
