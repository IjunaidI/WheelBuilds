// backend/src/modules/customer-vehicle/service.ts
import { MedusaService, ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import CustomerVehicle from "./models/customer-vehicle"

class CustomerVehicleService extends MedusaService({ CustomerVehicle }) {
  protected knex_: any

  constructor(container: any) {
    super(...arguments as any)
    this.knex_ = container?.[ContainerRegistrationKeys.PG_CONNECTION]
  }

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

  /**
   * Atomic active-vehicle switch (WB-073 G4). The old implementation was a
   * non-transactional read-modify-write: list the customer's active vehicles,
   * loop deactivating them, then activate the target — three-plus round trips
   * with no isolation between them. Two near-simultaneous activate() calls for
   * the same customer could both read the same "currently active" snapshot,
   * each write their own target active, and race the partial unique index
   * `UQ_customer_vehicle_one_active` (Migration20260602090000.ts, one active
   * non-deleted row per customer_id) into an uncaught 500.
   *
   * This folds "deactivate everyone else" + "activate the target" into a
   * SINGLE SQL statement via a data-modifying CTE. Postgres executes the whole
   * statement atomically — an external reader (including a concurrent
   * activate()) never observes a zero-active or two-active intermediate state,
   * and the deactivate's WHERE is re-evaluated against the live rows at
   * execution time, so a concurrent writer that mutated a row we're about to
   * touch is naturally serialized via row-level locking rather than racing us.
   *
   * A conflicting concurrent writer can still surface as a 23505 unique-
   * violation in the (already narrow) window where it activated a row we had
   * no way to see yet — mirrors the ON CONFLICT atomic-write idiom used
   * elsewhere in this codebase (WheelSizeService.incrementAndCheckQuota /
   * upsertFitmentRow). Caught here and retried once: a retry re-runs against
   * the now-committed state and always resolves cleanly, so the caller never
   * sees the violation.
   *
   * Both halves are scoped to `customer_id` (WB-073 G4 review). The
   * original version filtered the deactivate CTE by `customer_id` but
   * matched the final activation UPDATE on `id` alone — so an `id` that
   * didn't belong to `customerId` still deactivated that customer's real
   * active vehicle (the deactivate CTE ran regardless, per Postgres CTE
   * semantics — a data-modifying CTE executes once it's evaluated,
   * independent of whether the main statement's WHERE later matches
   * anything), while the activation half silently matched zero rows,
   * leaving the customer with NO active vehicle and reporting success.
   * Fixed by adding a `target` CTE that resolves `id` to a row this
   * customer actually owns FIRST; the `deactivated` CTE is gated on
   * `exists (select 1 from target)`, so if the id is unknown, soft-deleted,
   * or belongs to another customer, `target` is empty, the EXISTS guard is
   * false, and NOTHING is touched — not even the customer's own other
   * vehicles. The final activation UPDATE sources its target row from the
   * same `target` CTE rather than re-matching on a bare `id`. The legit
   * caller (the store route) always passes an id already verified via
   * `resolveOwned()`, so this is defense in depth, not a behavior change
   * for the happy path.
   *
   * `RETURNING "id"` is inspected: if `target` was empty, the activation
   * half matches zero rows and that is not a success — silently returning
   * would report HTTP 200 while nothing activated. Throw a
   * `MedusaError.Types.NOT_FOUND`, which the framework's error-handler
   * middleware maps to an honest 404 (same convention the rest of this
   * module leans on via `resolveOwned()` returning undefined for a
   * missing/unowned row).
   */
  async activate(id: string, customerId: string): Promise<void> {
    const exec = async () => {
      return this.knex_.raw(
        `with target as (
           select "id" from "customer_vehicle"
           where "customer_id" = ? and "id" = ? and "deleted_at" is null
         ),
         deactivated as (
           update "customer_vehicle"
           set "is_active" = false, "updated_at" = now()
           where "customer_id" = ? and "id" <> ? and "is_active" = true and "deleted_at" is null
             and exists (select 1 from target)
         )
         update "customer_vehicle"
         set "is_active" = true, "updated_at" = now()
         where "id" in (select "id" from target)
         returning "id"`,
        [customerId, id, customerId, id]
      )
    }
    let result: any
    try {
      result = await exec()
    } catch (err: any) {
      if (err?.code !== "23505") throw err
      result = await exec() // one retry: the concurrent writer's commit is now visible
    }
    const activated = result?.rows ?? []
    if (activated.length === 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `CustomerVehicle with id "${id}" not found for this customer`
      )
    }
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
      hub_bore_mm_x100: input.hubBoreMm == null ? null : Math.round(input.hubBoreMm * 100),
      diameter_window: input.diameterWindow ?? null,
      width_window: input.widthWindow ?? null,
      offset_window: input.offsetWindow ?? null,
      oem_tire_sizes: input.oemTireSizes ?? null,
      oem_tires: input.oemTires ?? null,
      fitment_status: input.fitmentStatus ?? null,
      notes: input.notes ?? null,
    })
  }

  /**
   * Idempotently merge a batch of vehicles into a customer's garage in one call.
   * Each is upserted via createForCustomer (idempotent on (customer_id, client_id)),
   * so re-merging the same batch adds no duplicates. Returns the customer's full list.
   */
  async mergeForCustomer(customerId: string, vehicles: any[]): Promise<any[]> {
    for (const v of vehicles) {
      await this.createForCustomer(customerId, v)
    }
    return this.listCustomerVehicles({ customer_id: customerId })
  }
}
export default CustomerVehicleService
