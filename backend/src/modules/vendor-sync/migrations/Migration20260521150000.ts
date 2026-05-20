import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260521150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "vendor_feed_run" add column if not exists "failed_part_numbers" jsonb null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "vendor_feed_run" drop column if exists "failed_part_numbers";`
    )
  }
}
