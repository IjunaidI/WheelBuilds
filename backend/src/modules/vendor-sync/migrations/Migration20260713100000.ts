import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * WB-089 L3: count rows dropped at staging for a non-positive / missing MSRP,
 * mirroring skipped_no_image_count. Hand-authored ALTER to match this module's
 * existing migrations (no committed snapshot; db:generate not required).
 */
export class Migration20260713100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "vendor_feed_run" add column if not exists "skipped_invalid_price_count" integer not null default 0;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "vendor_feed_run" drop column if exists "skipped_invalid_price_count";`
    )
  }
}
