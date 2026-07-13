import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { emitMeiliReconcile } from "../modules/vendor-sync/meili-reconcile"

/**
 * Daily belt-and-braces Meilisearch reconcile (WB-089 L1). Delegates to the
 * unit-tested emitMeiliReconcile; no-op when Meili is not configured.
 */
export default async function meilisearchReconcileTick(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const emitted = await emitMeiliReconcile(container)
    logger.info(
      emitted
        ? "[meilisearch-reconcile] emitted meilisearch.sync (reconcile requested)"
        : "[meilisearch-reconcile] skipped — Meilisearch not configured"
    )
  } catch (err: any) {
    logger.error(`[meilisearch-reconcile] failed to emit meilisearch.sync: ${err?.message ?? err}`)
  }
}

export const config = {
  name: "meilisearch-reconcile",
  schedule: "0 4 * * *",
}
