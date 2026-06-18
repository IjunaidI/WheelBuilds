// backend/src/modules/customer-vehicle/service.ts
import { MedusaService } from "@medusajs/framework/utils"
import CustomerVehicle from "./models/customer-vehicle"

class CustomerVehicleService extends MedusaService({ CustomerVehicle }) {
  /**
   * Resolve a customer's vehicle by its storefront `client_id`. The store
   * `[id]` routes address rows by client_id (the stable, storefront-known id),
   * NOT the Medusa PK. Scoped to `customer_id`, so this also enforces ownership:
   * a foreign or unknown client_id returns undefined. The returned row carries
   * the real PK in `row.id` for the subsequent mutation.
   */
  async resolveOwned(customerId: string, clientId: string): Promise<any | undefined> {
    const [row] = await this.listCustomerVehicles({ customer_id: customerId, client_id: clientId })
    return row
  }

  async activate(id: string, customerId: string): Promise<void> {
    const active = await this.listCustomerVehicles({ customer_id: customerId, is_active: true })
    for (const v of active) {
      if (v.id !== id) await this.updateCustomerVehicles({ id: v.id, is_active: false })
    }
    await this.updateCustomerVehicles({ id, is_active: true })
  }

  /**
   * Idempotent create on (customer_id, client_id). Always inactive — making a
   * vehicle active goes through activate(), preserving the single-active
   * invariant (and the DB partial unique index).
   */
  async createForCustomer(customerId: string, input: any): Promise<any> {
    const existing = await this.listCustomerVehicles({ customer_id: customerId, client_id: input.client_id })
    if (existing[0]) return existing[0]
    return this.createCustomerVehicles({
      customer_id: customerId,
      client_id: input.client_id,
      year: input.year,
      make: input.make,
      model: input.model,
      trim: input.trim ?? null,
      modification_slug: input.modificationSlug ?? null,
      is_active: false,
      canonical_bolt_patterns: input.canonicalBoltPatterns ?? null,
      hub_bore_mm: input.hubBoreMm ?? null,
      diameter_window: input.diameterWindow ?? null,
      width_window: input.widthWindow ?? null,
      offset_window: input.offsetWindow ?? null,
      fitment_status: input.fitmentStatus ?? null,
      notes: input.notes ?? null,
    })
  }
}
export default CustomerVehicleService
