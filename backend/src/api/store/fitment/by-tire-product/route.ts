import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import type WheelSizeService from "../../../../modules/wheel-size/service"
import { resolveOptional } from "../../../../lib/resolve-optional"

// Reverse tire fitment: which CACHED vehicles' factory tire — size, load index,
// and speed rating, meet-or-exceed — matches this product. Pure DB read — no
// wheel-size API calls, so no quota impact. Degrades to an empty list (never
// 503) because the PDP "confirmed models" section is an enhancement.
//
// `sizes`, `loads`, and `speeds` are aligned CSVs — index i of each describes
// one product variant spec. `loads[i]` parses to a number or null; `speeds[i]`
// to a non-empty string or null. Missing/short `loads`/`speeds` (including the
// legacy sizes-only caller) default every entry to null, which the meet-or-
// exceed rule treats as "passes that dimension" — i.e. a pure size match.
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const svc = resolveOptional<WheelSizeService>(req.scope, WHEEL_SIZE_MODULE)
  const { sizes, loads, speeds, limit } = req.query as Record<string, string>
  const productSizes = (sizes ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  if (!svc || productSizes.length === 0) { res.json({ vehicles: [] }); return }
  const loadTokens = (loads ?? "").split(",").map((s) => s.trim())
  const speedTokens = (speeds ?? "").split(",").map((s) => s.trim())
  const productSpecs = productSizes.map((size, i) => {
    const loadToken = loadTokens[i]
    const loadIndex = loadToken != null && loadToken !== "" && Number.isFinite(Number(loadToken)) ? Number(loadToken) : null
    const speedToken = speedTokens[i]
    const speedRating = speedToken != null && speedToken !== "" ? speedToken : null
    return { size, loadIndex, speedRating }
  })
  const lim = limit != null && limit !== "" && Number.isFinite(Number(limit)) ? Number(limit) : 24
  const vehicles = await svc.reverseTireFitment({ productSpecs, limit: lim })
  res.json({ vehicles })
}
