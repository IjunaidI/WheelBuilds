import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Add source_modify_time to vendor_feed_run so the live SFTP feed-source can
 * remember the last-seen remote file mtime for delta detection. Stored as
 * text (not number) because epoch-milliseconds overflows PostgreSQL int4.
 *
 * Authored by hand to match this module's existing migrations: `medusa
 * db:generate vendorSyncModuleService` diffs the module's entities against
 * the full database and emits a drop-everything migration, so only the
 * snapshot is taken from the CLI; the migration body is the minimal ALTER.
 */
export class Migration20260604001450 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "vendor_feed_run" add column if not exists "source_modify_time" text null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "vendor_feed_run" drop column if exists "source_modify_time";`
    )
  }
}
