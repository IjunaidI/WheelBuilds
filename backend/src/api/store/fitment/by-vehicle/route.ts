import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import { QuotaOutageError } from "../../../../modules/wheel-size/service"

/**
 * GET /store/fitment/by-vehicle
 * Resolve wheel-size.com fitment for a vehicle. The real v2 by_model contract
 * REQUIRES make+model; modification (or year) narrows the trim.
 *   ?make=&model=&modification=<slug>&region=   (or make+model+year)
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const svc = req.scope.resolve(WHEEL_SIZE_MODULE) as any
  const { make, model, modification, year, region } = req.query as Record<string, string>

  if (!make || !model) {
    res.status(400).json({ error: "make and model are required" })
    return
  }

  try {
    const fitment = await svc.getFitment({
      make,
      model,
      modificationSlug: modification,
      year,
      region,
    })
    res.json({ fitment })
  } catch (err) {
    if (err instanceof QuotaOutageError) {
      res.status(503).json({ error: "fitment unavailable" })
      return
    }
    throw err
  }
}
