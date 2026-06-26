import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { CUSTOMER_VEHICLE_MODULE } from "../../../../../modules/customer-vehicle"
import { parseVehicleMerge } from "../validators"

const actor = (req: MedusaRequest) => (req as any).auth_context?.actor_id as string | undefined

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req)
  if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }

  const parsed = parseVehicleMerge(req.body)
  if (parsed.ok === false) { res.status(400).json({ error: "invalid_merge", details: parsed.error }); return }

  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  const vehicles = await svc.mergeForCustomer(customerId, parsed.data.vehicles)
  res.status(200).json({ vehicles })
}
