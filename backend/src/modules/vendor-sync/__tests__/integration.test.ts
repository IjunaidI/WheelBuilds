/**
 * End-to-end integration tests for the vendor-sync pipeline.
 *
 * These tests boot a real Medusa instance against a real Postgres and
 * exercise the full fetch -> stage -> diff -> apply pipeline. They catch
 * the class of bug that pure-function unit tests miss -- specifically
 * workflow-result-shape regressions like the one fixed in commit 000da81
 * where createProductsWorkflow's returned variant did NOT eagerly populate
 * the inventory_items link and the apply path silently set inventory_item_id
 * to null on every product.
 *
 * Running:
 *
 *   RUN_INTEGRATION=true TEST_DATABASE_URL=postgres://... pnpm test:sync
 *
 * Prerequisites:
 *
 *   - A dedicated test Postgres database (do NOT point at dev/prod).
 *   - @medusajs/test-utils available (already in devDependencies).
 *   - A small fixture CSV at __fixtures__/wheels-small.csv (already present).
 *
 * Without RUN_INTEGRATION=true the tests in this file are skipped via
 * describe.skip, so the default `pnpm test:sync` invocation stays green
 * even on a machine without test-DB infrastructure.
 */

const RUN_INTEGRATION = process.env.RUN_INTEGRATION === "true"
const describeIntegration = RUN_INTEGRATION ? describe : describe.skip

describeIntegration("vendor-sync end-to-end pipeline", () => {
  // Implementation requires medusajs/test-utils framework usage:
  //
  //   import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
  //   medusaIntegrationTestRunner({
  //     testSuite: ({ getContainer }) => { ... }
  //   })
  //
  // Each test case below is a regression test for a specific class of
  // bug that has actually happened.

  it.todo("creates products with non-null inventory_item_id (regression for 000da81)")
  // Setup:
  //   - Seed US region, default sales channel, shipping profile via bootstrap helpers.
  //   - Load wheels-small.csv into vendor_feed_staging via stageFeed.
  //   - Apply via service.run("wheelpros-wheels").
  // Assertions:
  //   - Every vendor_product_current row created in this run has
  //     inventory_item_id !== null.
  //   - Each inventory_item_id resolves to a real Medusa inventory_item
  //     via query.graph entity inventory_item.
  //   - apply-stock did not log any "Skipping stock for X: no inventory_item_id".
  //
  // This test would have failed before commit 000da81 because the inline
  // variant?.inventory_items?.[0]?.inventory_item_id walk returned null
  // for every product.

  it.todo("cancel during apply stops the loop and leaves status=cancelled")
  // Setup:
  //   - Stage a feed with ~20 new part_numbers so apply takes long enough
  //     to interrupt.
  //   - Start service.run() in a detached Promise.
  //   - After the first 2-3 products land, hit the cancel route.
  // Assertions:
  //   - The detached run promise resolves (does not throw).
  //   - vendor_feed_run.status === "cancelled".
  //   - vendor_feed_run.finished_at is set.
  //   - Fewer than 20 products have vendor_product_current rows
  //     (proves the loop stopped before processing all of them).
  //
  // This test would have failed before commit 859f30b because
  // applyChanges had no cancel-poll between iterations and would
  // overwrite status=cancelled back to completed at the end.

  it.todo("discontinue is idempotent across replay and preserves admin metadata")
  // Setup:
  //   - Apply a feed.
  //   - Manually set product.metadata.admin_note = "do not delete" via the
  //     product service.
  //   - Apply a v2 feed that drops that part_number (triggers discontinue).
  //   - Replay the same run via service.replayRun.
  // Assertions:
  //   - product.metadata.admin_note is preserved (proves we read existing
  //     metadata from the live product, not from currentRow.normalized).
  //   - product.metadata.discontinued_at is set.
  //   - product.status === "draft".
  //   - The replay logged "already discontinued, skipping" and did NOT
  //     re-emit product.updated.
  //
  // This test would have failed before commit 266765e because (a) the
  // metadata merge read from normalized.metadata which is always
  // undefined, wiping admin_note, and (b) there was no idempotency
  // guard so replay re-ran the workflow.

  it.todo("dry-run + apply against the same fixture twice is a no-op the second time")
  // Setup:
  //   - Dry-run + apply wheels-small.csv.
  //   - Dry-run wheels-small.csv again.
  // Assertions:
  //   - Second run's diff: new=0, changed=0, discontinued=0.
  //   - Second run's status: completed.
  //   - Either the RunDate short-circuit hit OR hash_match_count equals
  //     the row count.

  it.todo("imports a center-bore-distinct group as ONE product with N distinct variants (WB-051)")
  // Setup: stage a group whose SKUs share bolt/diameter/width/offset but
  //        differ on center_bore_mm; apply.
  // Assertions: exactly one product (external_id = group_key); one variant
  //        per distinct 6-tuple; each variant's Center Bore option matches its
  //        center_bore_mm; apply errors = 0.

  it.todo("dedupes an exact-duplicate group to one variant and logs the dropped SKU (WB-051)")
  // Setup: stage two SKUs identical on all six axes (one in-stock, one not).
  // Assertions: one variant created (the in-stock SKU); a "deduped exact
  //        duplicate" warning names the dropped SKU; no current row for it.
})
