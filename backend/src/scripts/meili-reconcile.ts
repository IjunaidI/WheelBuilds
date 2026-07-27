import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { emitMeiliReconcile } from "../modules/vendor-sync/meili-reconcile"

/**
 * Manually force a full Meilisearch reconcile.
 *
 * Usage: medusa exec ./src/scripts/meili-reconcile.ts
 *
 * Emits the plugin's `meilisearch.sync` event, whose handler re-indexes every
 * published product and DELETES orphaned/drafted docs. This is the same thing
 * the daily `meilisearch-reconcile` cron (04:00) does -- the script exists so
 * an operator doesn't have to wait for it after a catalog cutover, which until
 * now had no manual trigger at all.
 *
 * When to reach for it: after a vendor-sync apply that drafted a lot of
 * products (e.g. the WB-115 dead-image cleanup), to be certain the drafts are
 * evicted from the index. Routine applies do NOT need it -- the plugin already
 * reacts to product.created/updated/deleted per product.
 *
 * Cost: a full re-index of the catalog (~2,800 products). Run it ONCE after
 * all vendor passes are done rather than after each one.
 *
 * Note this only REQUESTS the reconcile. The plugin's subscriber does the work
 * asynchronously, so the script returns before indexing finishes -- watch the
 * server log for "Successfully indexed N products".
 */
export default async function meiliReconcile({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const emitted = await emitMeiliReconcile(container)

  if (!emitted) {
    logger.warn(
      "[meili-reconcile] SKIPPED — Meilisearch is not configured " +
        "(MEILISEARCH_HOST + MEILISEARCH_ADMIN_KEY must both be set). " +
        "Nothing was requested."
    )
    return
  }

  logger.info(
    "[meili-reconcile] emitted meilisearch.sync — the plugin re-indexes " +
      "asynchronously; watch for 'Successfully indexed N products'."
  )
}
