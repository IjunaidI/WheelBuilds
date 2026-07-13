import { MedusaContainer } from "@medusajs/framework/types"
import { emitMeiliReconcile } from "../modules/vendor-sync/meili-reconcile"

/**
 * Daily belt-and-braces Meilisearch reconcile (WB-089 L1). Delegates to the
 * unit-tested emitMeiliReconcile; no-op when Meili is not configured.
 */
export default async function meilisearchReconcileTick(container: MedusaContainer) {
  await emitMeiliReconcile(container)
}

export const config = {
  name: "meilisearch-reconcile",
  schedule: "0 4 * * *",
}
