import type { MedusaContainer } from "@medusajs/framework/types"
import { emitMeiliReconcile } from "../meili-reconcile"

export interface StockApplyResult {
  updatedCount: number
}

/**
 * WB-100: called from `VendorSyncService.runStockOnly` immediately after
 * `applyStockLevels` resolves. Requests a full Meili reconcile ONLY when the
 * stock pass actually changed something.
 *
 * Why this is needed at all: `@rokmohar/medusa-plugin-meilisearch` only
 * subscribes to `product.created` / `product.updated` / `product.deleted` /
 * `product-category.*` and its own `meilisearch.sync` full-reconcile event
 * (verified against the installed plugin's subscribers). `applyStockLevels`
 * writes ONLY inventory levels via `batchInventoryItemLevelsWorkflow` — it
 * never emits a product event — so a stock-only change is otherwise invisible
 * to the index until the daily belt-and-braces cron
 * (`meilisearch-reconcile-tick.ts`). This closes that gap for the 3-hourly
 * stock refresh (`vendor-sync-stock-tick.ts`).
 *
 * Why gate on `updatedCount` and not the size of the parts-to-apply list:
 * `stockOnlyPartsToApply` returns every staged part that also has a current
 * Medusa product, which on a normal tick is close to the WHOLE catalog even
 * when a new feed file's quantities are byte-for-byte identical to what's
 * already in Medusa (a very common "idempotent tick"). `updatedCount` only
 * counts parts where `computeStockChanges` found a real create/update delta,
 * so it's the correct signal for "is a ~2,700-product full re-index actually
 * warranted right now".
 *
 * `reconcile` is injectable (defaults to the real `emitMeiliReconcile`) so
 * this can be unit-tested without needing a live Meilisearch instance.
 */
export async function reconcileAfterStockApply(
  stockResult: StockApplyResult,
  container: MedusaContainer,
  reconcile: (container: MedusaContainer) => Promise<boolean> = emitMeiliReconcile
): Promise<boolean> {
  if (stockResult.updatedCount <= 0) return false
  return reconcile(container)
}
