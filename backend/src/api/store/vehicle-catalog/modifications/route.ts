import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import WheelSizeService, { QuotaOutageError } from "../../../../modules/wheel-size/service"
import { resolveOptional } from "../../../../lib/resolve-optional"

const isValidParam = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { make, model, year, region } = req.query as Record<string, string>
  const svc = resolveOptional<WheelSizeService>(req.scope, WHEEL_SIZE_MODULE)
  // WB-113: `listModifications` now returns the sub-model (`trim_levels`) union,
  // not engine/trim modification slugs — the response key is named to match.
  if (!svc) { res.json({ subModels: [] }); return }
  if (!isValidParam(make) || !isValidParam(model) || !isValidParam(year)) {
    res.status(400).json({ error: "make, model, and year are required" })
    return
  }
  // Optional, additive (WB-104 T3): defaults to "usdm" so existing callers (no
  // region sent) are unaffected. An invalid/absent value falls back to the
  // default rather than 400ing — region-scoping is a refinement, not a requirement.
  const regionParam = isValidParam(region) ? region : "usdm"

  try {
    res.json({ subModels: await svc.listModifications(make, model, year, regionParam) })
  } catch (e) {
    if (e instanceof QuotaOutageError) {
      res.status(503).json({ type: "service_unavailable", message: "Vehicle catalog temporarily unavailable" })
      return
    }
    throw e
  }
}
