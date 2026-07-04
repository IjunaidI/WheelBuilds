import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * WB-068: persist a saved vehicle's richer OEM tire data (size, load index,
 * speed rating) for authed users. Additive nullable jsonb column, mirroring
 * `oem_tire_sizes` (WB-067). Without it, logged-in vehicles round-trip through
 * the backend without `oemTires`, so multi-axis tire fitment silently falls
 * back to size-only matching for authed users. Hand-authored (the module
 * `db:generate` emits a drop-everything diff for this table — see CLAUDE.md).
 */
export class Migration20260704140000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "customer_vehicle" add column if not exists "oem_tires" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "customer_vehicle" drop column if exists "oem_tires";`);
  }

}
