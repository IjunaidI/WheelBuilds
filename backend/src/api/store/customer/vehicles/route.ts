import { MedusaRequest, MedusaResponse } from "@medusajs/framework"

// GARAGE-DISABLED (WB-076, 2026-07-09): the customer-vehicle module is
// unregistered in medusa-config.js, so the original handlers below would
// crash at req.scope.resolve(). Deliberate 410 stubs keep the route loader +
// any stale clients well-behaved. Restore by re-registering the module,
// deleting the stubs, and uncommenting the originals. Module code, tests,
// and migrations are untouched; validators.ts stays live for its unit tests.
const gone = (_req: MedusaRequest, res: MedusaResponse): void => {
  res.status(410).json({ error: "garage_retired" })
}
export const GET = gone
export const POST = gone

/* GARAGE-DISABLED (WB-076) — original handlers:

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
  if ("error" in parsed) {
    res.status(400).json({ error: "invalid_vehicle", details: parsed.error })
    return
  }
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  const vehicle = await svc.createForCustomer(customerId, parsed.data)
  res.status(201).json({ vehicle })
}
*/
