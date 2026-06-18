import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { CUSTOMER_VEHICLE_MODULE } from "../../../../../modules/customer-vehicle"
// NOTE: the [id] path segment is the storefront client_id, not the Medusa PK.
// resolveOwned maps (client_id, customer_id) -> row; we mutate by row.id (real PK).
const actor = (req: MedusaRequest) => (req as any).auth_context?.actor_id as string | undefined

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req); if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }
  const { id } = req.params; const b = req.body as any
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  const row = await svc.resolveOwned(customerId, id)
  if (!row) { res.status(404).json({ error: "not_found" }); return }
  const vehicle = await svc.updateCustomerVehicles({
    id: row.id, modification_slug: b.modificationSlug, canonical_bolt_patterns: b.canonicalBoltPatterns,
    hub_bore_mm: b.hubBoreMm, diameter_window: b.diameterWindow, width_window: b.widthWindow,
    offset_window: b.offsetWindow, fitment_status: b.fitmentStatus, trim: b.trim, notes: b.notes,
  })
  res.json({ vehicle })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req); if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }
  const { id } = req.params
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  const row = await svc.resolveOwned(customerId, id)
  if (!row) { res.status(404).json({ error: "not_found" }); return }
  await svc.deleteCustomerVehicles(row.id)
  res.status(200).json({ id, deleted: true })
}
