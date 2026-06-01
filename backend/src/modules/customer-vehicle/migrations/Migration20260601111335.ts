import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260601111335 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "customer_vehicle" drop constraint if exists "customer_vehicle_customer_id_client_id_unique";`);
    this.addSql(`create table if not exists "customer_vehicle" ("id" text not null, "customer_id" text not null, "client_id" text not null, "year" integer not null, "make" text not null, "model" text not null, "trim" text null, "modification_slug" text null, "is_active" boolean not null default false, "canonical_bolt_patterns" jsonb null, "hub_bore_mm" integer null, "diameter_window" jsonb null, "width_window" jsonb null, "offset_window" jsonb null, "fitment_status" text null, "notes" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "customer_vehicle_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_customer_vehicle_deleted_at" ON "customer_vehicle" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_customer_vehicle_customer_id" ON "customer_vehicle" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_vehicle_customer_id_client_id_unique" ON "customer_vehicle" ("customer_id", "client_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "customer_vehicle" cascade;`);
  }

}
