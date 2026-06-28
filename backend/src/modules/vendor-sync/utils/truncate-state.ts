/**
 * Single source of truth for resetting vendor-sync STATE (NOT Medusa products).
 *
 * One `TRUNCATE ... RESTART IDENTITY` over all four tables — instant regardless
 * of row count. Both vendor-sync-truncate-state.ts and vendor-sync-dev-wipe.ts
 * delegate here, so neither hits the knex `WHERE id IN (...)` stack-overflow that
 * the per-id bulk-delete used to cause at production scale (~372k staging rows).
 */
export const VENDOR_STATE_TABLES = [
  "vendor_feed_run",
  "vendor_feed_staging",
  "vendor_stock_staging",
  "vendor_product_current",
] as const

export async function truncateVendorState(knex: any): Promise<void> {
  // Truncating all four together resolves any inter-table FKs in one statement.
  await knex.raw(
    `TRUNCATE TABLE ${VENDOR_STATE_TABLES.join(", ")} RESTART IDENTITY`
  )
}
