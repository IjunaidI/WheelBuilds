import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import type WheelSizeService from "../../../../modules/wheel-size/service"
import { resolveOptional } from "../../../../lib/resolve-optional"

// Reverse fitment: which CACHED vehicles fit this product (bolt + bore + an
// in-window size — WB-072 S2). Pure DB read — no wheel-size API calls, so no
// quota impact. Degrades to an empty list (never 503) because the PDP
// "confirmed models" section is an enhancement.
//
// `diameters`/`widths`/`offsets` are aligned CSVs, mirroring by-tire-product's
// sizes/loads/speeds convention: index i of each describes one of the
// product's buildable (diameter, width, offset) sizes. Missing/absent size
// params fall back to an empty productSizes list, which keeps the pre-S2
// bolt+bore-only behavior (see buildReverseFitment's backward-compat note).
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const svc = resolveOptional<WheelSizeService>(req.scope, WHEEL_SIZE_MODULE)
  const { boltPatterns, boreMm, limit, diameters, widths, offsets } = req.query as Record<string, string>
  const patterns = (boltPatterns ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  if (!svc || patterns.length === 0) { res.json({ vehicles: [] }); return }
  const wheelBoreMm =
    boreMm != null && boreMm !== "" && Number.isFinite(Number(boreMm)) ? Number(boreMm) : null
  const lim = limit != null && limit !== "" && Number.isFinite(Number(limit)) ? Number(limit) : 24

  const dTokens = (diameters ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const wTokens = (widths ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const oTokens = (offsets ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const sizeCount = Math.max(dTokens.length, wTokens.length, oTokens.length)
  const productSizes: { diameter: number; width: number; offset: number }[] = []
  for (let i = 0; i < sizeCount; i++) {
    const d = Number(dTokens[i]); const w = Number(wTokens[i]); const o = Number(oTokens[i])
    if (Number.isFinite(d) && Number.isFinite(w) && Number.isFinite(o)) productSizes.push({ diameter: d, width: w, offset: o })
  }

  const vehicles = await svc.reverseFitment({ canonicalBoltPatterns: patterns, wheelBoreMm, limit: lim, productSizes })
  res.json({ vehicles })
}
