import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import WheelSizeService, { QuotaOutageError } from "../../../../modules/wheel-size/service"
import { resolveOptional } from "../../../../lib/resolve-optional"
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const svc = resolveOptional<WheelSizeService>(req.scope, WHEEL_SIZE_MODULE)
  if (!svc) { res.json({ makes: [] }); return }
  try {
    res.json({ makes: await svc.listMakes() })
  } catch (e) {
    if (e instanceof QuotaOutageError) {
      res.status(503).json({ type: "service_unavailable", message: "Vehicle catalog temporarily unavailable" })
      return
    }
    throw e
  }
}
