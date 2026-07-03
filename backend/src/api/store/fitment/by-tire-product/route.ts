import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import type WheelSizeService from "../../../../modules/wheel-size/service"
import { resolveOptional } from "../../../../lib/resolve-optional"

// Reverse tire fitment: which CACHED vehicles' factory tire size matches this
// product. Pure DB read — no wheel-size API calls, so no quota impact. Degrades
// to an empty list (never 503) because the PDP "confirmed models" section is an
// enhancement.
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const svc = resolveOptional<WheelSizeService>(req.scope, WHEEL_SIZE_MODULE)
  const { sizes, limit } = req.query as Record<string, string>
  const tireSizes = (sizes ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  if (!svc || tireSizes.length === 0) { res.json({ vehicles: [] }); return }
  const lim = limit != null && limit !== "" && Number.isFinite(Number(limit)) ? Number(limit) : 24
  const vehicles = await svc.reverseTireFitment({ tireSizes, limit: lim })
  res.json({ vehicles })
}
