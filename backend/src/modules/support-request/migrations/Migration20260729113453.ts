import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260729113453 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "support_request" ("id" text not null, "name" text not null, "email" text not null, "phone" text null, "subject" text null, "message" text not null, "source" text null, "vehicle" text null, "product_handle" text null, "country_code" text null, "notified_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "support_request_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_support_request_deleted_at" ON "support_request" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_support_request_created_at" ON "support_request" ("created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_support_request_email" ON "support_request" ("email") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "support_request" cascade;`);
  }

}
