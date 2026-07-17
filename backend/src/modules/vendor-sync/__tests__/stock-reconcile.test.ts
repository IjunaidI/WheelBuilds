/**
 * WB-100 Task 2 freshness wiring.
 *
 * Verified against node_modules/@rokmohar/medusa-plugin-meilisearch's own
 * subscribers (meilisearch-product-created/updated/deleted.ts +
 * meilisearch-sync.ts): the plugin only reacts to `product.created`,
 * `product.updated`, `product.deleted`, `product-category.*`, and its own
 * full-reconcile `meilisearch.sync` event. `applyStockLevels` (called from
 * `VendorSyncService.runStockOnly`) writes ONLY inventory levels via
 * `batchInventoryItemLevelsWorkflow` — it never touches a product/variant
 * record and emits none of those events. So a stock-only change is invisible
 * to the index until the belt-and-braces daily cron, unless `runStockOnly`
 * explicitly requests a reconcile.
 *
 * `reconcileAfterStockApply` is the extracted, injectable decision +ac
 * `runStockOnly` calls immediately after `applyStockLevels` resolves. It is
 * unit-tested here in isolation (no service.ts import) because importing
 * `service.ts` — even transitively through `pipeline/apply-stock.ts` ->
 * `pipeline/bootstrap.ts` -> `@medusajs/medusa/core-flows` — registers global
 * workflow ids a second time in this Jest worker and throws "Workflow with id
 * ... already exists" (confirmed empirically; no existing vendor-sync test
 * imports service.ts/apply.ts/apply-stock.ts/bootstrap.ts for the same
 * reason — only their pure sub-functions are unit tested).
 */
import { reconcileAfterStockApply } from "../pipeline/stock-reconcile"

describe("reconcileAfterStockApply (WB-100)", () => {
  const fakeContainer = { tag: "container" } as any

  it("calls the reconcile function when parts were applied (updatedCount > 0)", async () => {
    const reconcile = jest.fn(async () => true)
    const result = await reconcileAfterStockApply(
      { updatedCount: 2 },
      fakeContainer,
      reconcile
    )
    expect(reconcile).toHaveBeenCalledTimes(1)
    expect(reconcile).toHaveBeenCalledWith(fakeContainer)
    expect(result).toBe(true)
  })

  it("does NOT call reconcile when zero parts changed (idempotent tick)", async () => {
    const reconcile = jest.fn(async () => true)
    const result = await reconcileAfterStockApply(
      { updatedCount: 0 },
      fakeContainer,
      reconcile
    )
    expect(reconcile).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it("treats a negative updatedCount the same as zero (defensive)", async () => {
    const reconcile = jest.fn(async () => true)
    const result = await reconcileAfterStockApply(
      { updatedCount: -1 },
      fakeContainer,
      reconcile
    )
    expect(reconcile).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it("defaults to the real emitMeiliReconcile when no override is passed", async () => {
    // Not configured in this process (no MEILISEARCH_HOST/ADMIN_KEY), so the
    // real emitMeiliReconcile is a safe no-op — proves the default wiring
    // reaches the real module without needing an explicit stub every call.
    delete process.env.MEILISEARCH_HOST
    delete process.env.MEILISEARCH_ADMIN_KEY
    const result = await reconcileAfterStockApply({ updatedCount: 3 }, fakeContainer)
    expect(result).toBe(false)
  })
})
