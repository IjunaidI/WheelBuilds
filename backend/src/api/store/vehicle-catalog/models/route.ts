import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import type WheelSizeService from "../../../../modules/wheel-size/service"
import { resolveOptional } from "../../../../lib/resolve-optional"
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { make } = req.query as Record<string, string>
  const svc = resolveOptional<WheelSizeService>(req.scope, WHEEL_SIZE_MODULE)
  if (!svc) { res.json({ models: [] }); return }
  res.json({ models: await svc.listModels(make) })
}
