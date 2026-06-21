import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * WB-016: add apply_attempt_count + failed_group_keys to vendor_feed_run so a
 * partial apply can be retried a bounded number of times before being marked
 * `exhausted`. Hand-authored minimal ALTER to match this module's existing
 * migrations (db:generate emits a drop-everything migration; only the snapshot
 * is taken from the CLI).
 */
export class Migration20260621120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "vendor_feed_run" add column if not exists "failed_group_keys" jsonb null;`
    )
    this.addSql(
      `alter table if exists "vendor_feed_run" add column if not exists "apply_attempt_count" integer not null default 0;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "vendor_feed_run" drop column if exists "failed_group_keys";`
    )
    this.addSql(
      `alter table if exists "vendor_feed_run" drop column if exists "apply_attempt_count";`
    )
  }
}
