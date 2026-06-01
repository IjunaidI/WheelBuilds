import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { WHEEL_SIZE_MODULE } from "../../../../modules/wheel-size"
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { make, model } = req.query as Record<string, string>
  const svc = req.scope.resolve(WHEEL_SIZE_MODULE) as any
  res.json({ years: await svc.listYears(make, model) })
}
