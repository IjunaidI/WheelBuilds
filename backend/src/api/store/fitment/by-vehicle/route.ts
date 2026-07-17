import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import WheelSizeService, { QuotaOutageError } from "../../../../modules/wheel-size/service"
import { resolveOptional } from "../../../../lib/resolve-optional"

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const svc = resolveOptional<WheelSizeService>(req.scope, WHEEL_SIZE_MODULE)
  // WB-113: this route now reads `sub_model` (the trim_levels union), not the
  // legacy `modification` engine-slug param. The service's `modificationSlug`
  // alias stays in place for other callers — this route uses `subModel` only.
  const { make, model, sub_model: subModel, year, region } = req.query as Record<string, string>

  if (!svc) { res.status(503).json({ error: "fitment unavailable" }); return }
  if (!make || !model) {
    res.status(400).json({ error: "make and model are required" })
    return
  }

  try {
    const fitment = await svc.getFitment({ make, model, subModel, year, region })
    res.json({ fitment })
  } catch (err) {
    if (err instanceof QuotaOutageError) {
      res.status(503).json({ error: "fitment unavailable" })
      return
    }
    throw err
  }
}
