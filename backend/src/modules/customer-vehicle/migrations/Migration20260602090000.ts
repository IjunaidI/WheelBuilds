import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260602090000 extends Migration {

  override async up(): Promise<void> {
    // 1. Collapse any pre-existing multiple-active rows down to the most recent
    //    one per customer, so the unique index can be created without conflict.
    this.addSql(`
      UPDATE "customer_vehicle" cv SET "is_active" = false
      WHERE cv."is_active" = true AND cv."deleted_at" IS NULL
        AND cv."id" <> (
          SELECT c2."id" FROM "customer_vehicle" c2
          WHERE c2."customer_id" = cv."customer_id"
            AND c2."is_active" = true AND c2."deleted_at" IS NULL
          ORDER BY c2."updated_at" DESC, c2."id" DESC
          LIMIT 1
        );
    `);

    // 2. At most one active, non-deleted vehicle per customer.
    this.addSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_vehicle_one_active"
      ON "customer_vehicle" ("customer_id")
      WHERE "is_active" AND "deleted_at" IS NULL;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "UQ_customer_vehicle_one_active";`);
  }

}
