import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260601111311 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "wheel_size_quota" drop constraint if exists "wheel_size_quota_day_unique";`);
    this.addSql(`alter table if exists "wheel_size_fitment" drop constraint if exists "wheel_size_fitment_cache_key_unique";`);
    this.addSql(`alter table if exists "wheel_size_catalog" drop constraint if exists "wheel_size_catalog_kind_key_unique";`);
    this.addSql(`create table if not exists "wheel_size_catalog" ("id" text not null, "kind" text not null, "key" text not null, "payload" jsonb not null, "fetched_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wheel_size_catalog_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wheel_size_catalog_deleted_at" ON "wheel_size_catalog" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wheel_size_catalog_kind_key_unique" ON "wheel_size_catalog" ("kind", "key") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "wheel_size_fitment" ("id" text not null, "cache_key" text not null, "region" text not null, "raw" jsonb null, "canonical_bolt_patterns" jsonb not null, "hub_bore_mm" integer null, "diameter_window" jsonb null, "width_window" jsonb null, "offset_window" jsonb null, "status" text not null, "fetched_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wheel_size_fitment_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wheel_size_fitment_deleted_at" ON "wheel_size_fitment" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wheel_size_fitment_cache_key_unique" ON "wheel_size_fitment" ("cache_key") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "wheel_size_quota" ("id" text not null, "day" text not null, "count" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wheel_size_quota_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wheel_size_quota_deleted_at" ON "wheel_size_quota" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wheel_size_quota_day_unique" ON "wheel_size_quota" ("day") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "wheel_size_catalog" cascade;`);

    this.addSql(`drop table if exists "wheel_size_fitment" cascade;`);

    this.addSql(`drop table if exists "wheel_size_quota" cascade;`);
  }

}
