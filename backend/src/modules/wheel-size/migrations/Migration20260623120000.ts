import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260623120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "wheel_size_fitment" rename column "hub_bore_mm" to "hub_bore_mm_x100";`);
    // Old values were truncated integer mm; carry forward as ×100 (67 -> 6700 = 67.00mm).
    // The warm cron later refreshes them to the exact ×100 value.
    this.addSql(`update "wheel_size_fitment" set "hub_bore_mm_x100" = "hub_bore_mm_x100" * 100 where "hub_bore_mm_x100" is not null;`);
  }
  override async down(): Promise<void> {
    this.addSql(`update "wheel_size_fitment" set "hub_bore_mm_x100" = round("hub_bore_mm_x100" / 100.0) where "hub_bore_mm_x100" is not null;`);
    this.addSql(`alter table if exists "wheel_size_fitment" rename column "hub_bore_mm_x100" to "hub_bore_mm";`);
  }
}
