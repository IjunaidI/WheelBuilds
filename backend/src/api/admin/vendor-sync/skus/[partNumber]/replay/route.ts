import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

/**
 * POST /admin/vendor-sync/skus/:partNumber/replay
 * Replay a single SKU using the most recent staging data.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
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

  // WB-013: run the SKU replay off-request via the vendor-sync subscriber
  // (global container — the module cradle can't resolve core modules). Return
  // 202 immediately.
  const eventBus = req.scope.resolve(Modules.EVENT_BUS)
  await eventBus.emit({
    name: "vendor-sync.replay-sku",
    data: { vendorCode: vendor_code, partNumber },
  })

  res.status(202).json({
    replaying: { vendor_code, part_number: partNumber },
  })
}
