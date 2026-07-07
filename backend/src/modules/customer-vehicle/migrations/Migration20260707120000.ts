import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * WB-072 B2 (safety): `hub_bore_mm` was an INTEGER column, so a fractional
 * wheel-size hub bore (e.g. 106.1mm) was truncated to 106 on write, corrupting
 * the bore hard-gate. Mirrors the proven fix already applied to the sibling
 * `wheel_size_fitment` table (Migration20260623120000): rename to
 * `hub_bore_mm_x100` and carry forward the (already-truncated) mm as ×100.
 * A guarded backfill script (`src/scripts/backfill-garage-bore.ts`) re-resolves
 * fitment for existing garage vehicles to recover true precision.
 */
export class Migration20260707120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "customer_vehicle" rename column "hub_bore_mm" to "hub_bore_mm_x100";`);
    this.addSql(`update "customer_vehicle" set "hub_bore_mm_x100" = "hub_bore_mm_x100" * 100 where "hub_bore_mm_x100" is not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`update "customer_vehicle" set "hub_bore_mm_x100" = round("hub_bore_mm_x100" / 100.0) where "hub_bore_mm_x100" is not null;`);
    this.addSql(`alter table if exists "customer_vehicle" rename column "hub_bore_mm_x100" to "hub_bore_mm";`);
  }

}
