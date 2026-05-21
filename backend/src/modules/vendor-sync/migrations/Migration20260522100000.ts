import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Add group_key to vendor_feed_staging and vendor_product_current so the
 * apply path can roll part_numbers up into shared Medusa products.
 *
 * Existing rows (pre-grouping) get a per-SKU fallback key. They will not
 * cluster with anything; the dev wipe script discards them before the
 * first grouped run anyway.
 */
export class Migration20260522100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "vendor_feed_staging" add column if not exists "group_key" text null;`
    )
    this.addSql(
      `update "vendor_feed_staging" set "group_key" = coalesce(normalized->>'groupKey', 'sku:' || part_number) where "group_key" is null;`
    )
    this.addSql(
      `alter table if exists "vendor_feed_staging" alter column "group_key" set not null;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_vendor_feed_staging_vendor_code_run_id_group_key" ON "vendor_feed_staging" ("vendor_code", "run_id", "group_key") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `alter table if exists "vendor_product_current" add column if not exists "group_key" text null;`
    )
    this.addSql(
      `update "vendor_product_current" set "group_key" = coalesce(normalized->>'groupKey', 'sku:' || part_number) where "group_key" is null;`
    )
    this.addSql(
      `alter table if exists "vendor_product_current" alter column "group_key" set not null;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_vendor_product_current_vendor_code_group_key" ON "vendor_product_current" ("vendor_code", "group_key") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_vendor_product_current_vendor_code_group_key";`
    )
    this.addSql(
      `alter table if exists "vendor_product_current" drop column if exists "group_key";`
    )
    this.addSql(
      `drop index if exists "IDX_vendor_feed_staging_vendor_code_run_id_group_key";`
    )
    this.addSql(
      `alter table if exists "vendor_feed_staging" drop column if exists "group_key";`
    )
  }
}
