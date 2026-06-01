import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
import { resolveOptional } from "../../../../lib/resolve-optional"
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { make, model, year } = req.query as Record<string, string>
  const svc = resolveOptional(req.scope, WHEEL_SIZE_MODULE)
  if (!svc) { res.json({ modifications: [] }); return }
  res.json({ modifications: await svc.listModifications(make, model, year) })
}
