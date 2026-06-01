import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { CUSTOMER_VEHICLE_MODULE } from "../../../../modules/customer-vehicle"
import { parseVehicleCreate } from "./validators"
const actor = (req: MedusaRequest) => (req as any).auth_context?.actor_id as string | undefined
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req); if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  res.json({ vehicles: await svc.listCustomerVehicles({ customer_id: customerId }) })
}
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req); if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }
  const parsed = parseVehicleCreate(req.body)
  if (!parsed.ok) { res.status(400).json({ error: "invalid_vehicle", details: parsed.error }); return }
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  const vehicle = await svc.createForCustomer(customerId, parsed.data)
  res.status(201).json({ vehicle })
}
