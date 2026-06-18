import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import { resolveOptional } from "../../../../lib/resolve-optional"

// Reverse fitment: which CACHED vehicles fit this product (bolt + bore). Pure
// DB read — no wheel-size API calls, so no quota impact. Degrades to an empty
// list (never 503) because the PDP "confirmed models" section is an enhancement.
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const svc = resolveOptional(req.scope, WHEEL_SIZE_MODULE)
  const { boltPatterns, boreMm, limit } = req.query as Record<string, string>
  const patterns = (boltPatterns ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  if (!svc || patterns.length === 0) { res.json({ vehicles: [] }); return }
  const wheelBoreMm =
    boreMm != null && boreMm !== "" && Number.isFinite(Number(boreMm)) ? Number(boreMm) : null
  const lim = limit != null && limit !== "" && Number.isFinite(Number(limit)) ? Number(limit) : 24
  const vehicles = await svc.reverseFitment({ canonicalBoltPatterns: patterns, wheelBoreMm, limit: lim })
  res.json({ vehicles })
}
