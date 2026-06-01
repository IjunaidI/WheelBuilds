import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { CUSTOMER_VEHICLE_MODULE } from "../../../../../../modules/customer-vehicle"
const actor = (req: MedusaRequest) => (req as any).auth_context?.actor_id as string | undefined
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req); if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }
  const { id } = req.params
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  const rows = await svc.listCustomerVehicles({ id, customer_id: customerId })
  if (!rows[0]) { res.status(404).json({ error: "not_found" }); return }
  await svc.activate(id, customerId)
  res.json({ id, active: true })
}
