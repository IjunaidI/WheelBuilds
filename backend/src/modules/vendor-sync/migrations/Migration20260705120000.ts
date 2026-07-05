import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Vendor-sync productionization Task 1: add cancel_requested_at + mode to
 * vendor_feed_run. cancel_requested_at is a DB-backed cooperative-cancel
 * signal for later tasks (WB-037); mode distinguishes 'full' vs 'stock'
 * runs (WB-018). Hand-authored minimal ALTER to match this module's existing
 * migrations (db:generate emits a drop-everything migration; only the
 * snapshot is taken from the CLI).
 */
export class Migration20260705120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "vendor_feed_run" add column if not exists "cancel_requested_at" timestamptz null;`
    )
    this.addSql(
      `alter table if exists "vendor_feed_run" add column if not exists "mode" text not null default 'full';`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "vendor_feed_run" drop column if exists "cancel_requested_at";`
    )
    this.addSql(
      `alter table if exists "vendor_feed_run" drop column if exists "mode";`
    )
  }
}
