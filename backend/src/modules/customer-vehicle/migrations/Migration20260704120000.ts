import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * WB-067: persist a saved vehicle's factory (OEM) tire sizes for authed users.
 * Additive nullable jsonb column, mirroring `canonical_bolt_patterns`. Without it,
 * logged-in vehicles round-trip through the backend without `oemTireSizes`, so
 * tire fitment silently fails while wheel fitment works. Hand-authored (the module
 * `db:generate` emits a drop-everything diff for this table — see CLAUDE.md).
 */
export class Migration20260704120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "customer_vehicle" add column if not exists "oem_tire_sizes" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "customer_vehicle" drop column if exists "oem_tire_sizes";`);
  }

}
