import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * WB-115 Task 2: new `vendor_image_check` cache table backing the image
 * reachability gate. Hand-authored to match this module's existing
 * migrations (`Migration20260517220005` et al.) -- `medusa db:generate
 * vendorSyncModuleService` diffs this module's entities against the FULL
 * prod schema and emits a migration whose up() drops unrelated core tables
 * (cart, order, product, ...); see docs/done/plans/2026-06-04-plan-3-completion-and-validation.md
 * §4.2 for the prior occurrence of this footgun. Only the regenerated
 * `.snapshot-vendor-sync-module.json` was kept from that run -- this file's
 * SQL is hand-written and scoped to the one new table (copied verbatim from
 * the generator's output for just this table).
 */
export class Migration20260720120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "vendor_image_check" ("url" text not null, "last_status" integer null, "last_checked_at" timestamptz not null, "consecutive_failures" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_image_check_pkey" primary key ("url"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_image_check_deleted_at" ON "vendor_image_check" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "vendor_image_check" cascade;`);
  }

}
