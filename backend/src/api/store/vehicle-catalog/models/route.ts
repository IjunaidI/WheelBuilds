import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import WheelSizeService, { QuotaOutageError } from "../../../../modules/wheel-size/service"
import { resolveOptional } from "../../../../lib/resolve-optional"

const isValidParam = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { make } = req.query as Record<string, string>
  const svc = resolveOptional<WheelSizeService>(req.scope, WHEEL_SIZE_MODULE)
  if (!svc) { res.json({ models: [] }); return }
  if (!isValidParam(make)) {
    res.status(400).json({ error: "make is required" })
    return
  }

  try {
    res.json({ models: await svc.listModels(make) })
  } catch (e) {
    if (e instanceof QuotaOutageError) {
      res.status(503).json({ type: "service_unavailable", message: "Vehicle catalog temporarily unavailable" })
      return
    }
    throw e
  }
}
