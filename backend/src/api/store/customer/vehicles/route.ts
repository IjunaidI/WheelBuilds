import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { CUSTOMER_VEHICLE_MODULE } from "../../../../modules/customer-vehicle"
const actor = (req: MedusaRequest) => (req as any).auth_context?.actor_id as string | undefined
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req); if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  res.json({ vehicles: await svc.listCustomerVehicles({ customer_id: customerId }) })
}
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req); if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }
  const b = req.body as any
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  const existing = await svc.listCustomerVehicles({ customer_id: customerId, client_id: b.client_id })
  if (existing[0]) { res.json({ vehicle: existing[0] }); return } // idempotent on (customer_id, client_id)
  const vehicle = await svc.createCustomerVehicles({
    customer_id: customerId, client_id: b.client_id, year: b.year, make: b.make, model: b.model,
    trim: b.trim ?? null, modification_slug: b.modificationSlug ?? null, is_active: !!b.is_active,
    canonical_bolt_patterns: b.canonicalBoltPatterns ?? null, hub_bore_mm: b.hubBoreMm ?? null,
    diameter_window: b.diameterWindow ?? null, width_window: b.widthWindow ?? null,
    offset_window: b.offsetWindow ?? null, fitment_status: b.fitmentStatus ?? null, notes: b.notes ?? null,
  })
  res.status(201).json({ vehicle })
}
