import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import WheelSizeService, { QuotaOutageError } from "../../../../modules/wheel-size/service"
import { resolveOptional } from "../../../../lib/resolve-optional"

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const svc = resolveOptional<WheelSizeService>(req.scope, WHEEL_SIZE_MODULE)
  const { make, model, modification, year, region } = req.query as Record<string, string>

  if (!svc) { res.status(503).json({ error: "fitment unavailable" }); return }
  if (!make || !model) {
    res.status(400).json({ error: "make and model are required" })
    return
  }

  try {
    const fitment = await svc.getFitment({ make, model, modificationSlug: modification, year, region })
    res.json({ fitment })
  } catch (err) {
    if (err instanceof QuotaOutageError) {
      res.status(503).json({ error: "fitment unavailable" })
      return
    }
    throw err
  }
}
