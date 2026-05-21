import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260517220005 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "vendor_stock_staging" drop constraint if exists "vendor_stock_staging_run_id_part_number_warehouse_code_unique";`);
    this.addSql(`alter table if exists "vendor_product_current" drop constraint if exists "vendor_product_current_vendor_code_part_number_unique";`);
    this.addSql(`alter table if exists "vendor_feed_staging" drop constraint if exists "vendor_feed_staging_run_id_part_number_unique";`);
    this.addSql(`create table if not exists "vendor_feed_run" ("id" text not null, "vendor_code" text not null, "source_filename" text not null, "source_archive_key" text null, "run_date_vendor" timestamptz null, "row_count" integer not null default 0, "skipped_no_image_count" integer not null default 0, "hash_match_count" integer not null default 0, "new_count" integer not null default 0, "changed_count" integer not null default 0, "discontinued_count" integer not null default 0, "status" text not null, "approved_by" text null, "approved_at" timestamptz null, "error_message" text null, "started_at" timestamptz not null, "finished_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_feed_run_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_feed_run_deleted_at" ON "vendor_feed_run" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_feed_run_vendor_code_status" ON "vendor_feed_run" ("vendor_code", "status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_feed_run_created_at" ON "vendor_feed_run" ("created_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "vendor_feed_staging" ("id" text not null, "run_id" text not null, "vendor_code" text not null, "part_number" text not null, "row_json" jsonb not null, "normalized" jsonb not null, "content_hash" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_feed_staging_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_feed_staging_deleted_at" ON "vendor_feed_staging" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_feed_staging_run_id_part_number_unique" ON "vendor_feed_staging" ("run_id", "part_number") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_feed_staging_vendor_code_part_number" ON "vendor_feed_staging" ("vendor_code", "part_number") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_feed_staging_run_id_content_hash" ON "vendor_feed_staging" ("run_id", "content_hash") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "vendor_product_current" ("id" text not null, "vendor_code" text not null, "part_number" text not null, "content_hash" text not null, "medusa_product_id" text null, "medusa_variant_id" text null, "inventory_item_id" text null, "normalized" jsonb not null, "last_seen_run_id" text null, "applied_at" timestamptz not null, "discontinued_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_product_current_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_product_current_deleted_at" ON "vendor_product_current" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_product_current_vendor_code_part_number_unique" ON "vendor_product_current" ("vendor_code", "part_number") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_product_current_medusa_product_id" ON "vendor_product_current" ("medusa_product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_product_current_vendor_code_content_hash" ON "vendor_product_current" ("vendor_code", "content_hash") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "vendor_stock_staging" ("id" text not null, "run_id" text not null, "vendor_code" text not null, "part_number" text not null, "warehouse_code" text not null, "qoh" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_stock_staging_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_stock_staging_deleted_at" ON "vendor_stock_staging" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_stock_staging_run_id_part_number_warehouse_code_unique" ON "vendor_stock_staging" ("run_id", "part_number", "warehouse_code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_stock_staging_run_id_part_number" ON "vendor_stock_staging" ("run_id", "part_number") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "vendor_feed_run" cascade;`);

    this.addSql(`drop table if exists "vendor_feed_staging" cascade;`);

    this.addSql(`drop table if exists "vendor_product_current" cascade;`);

    this.addSql(`drop table if exists "vendor_stock_staging" cascade;`);
  }

}
