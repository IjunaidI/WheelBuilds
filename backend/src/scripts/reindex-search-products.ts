import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/**
 * One-time (or ad-hoc) re-index: emit product.updated for every product so the
 * Meilisearch plugin re-runs the transformer. After WB-084 this re-materializes
 * any already-indexed IMAGE-LESS product as the non-matching stub, hiding it
 * from wheel + tire discovery. Safe to re-run; idempotent.
 *
 * Run: pnpm exec medusa exec ./src/scripts/reindex-search-products.ts
 */
export default async function reindexSearchProducts({ container }: ExecArgs) {
  const productModule = container.resolve(Modules.PRODUCT)
  const eventBus = container.resolve(Modules.EVENT_BUS)
  const logger = container.resolve("logger")

  const pageSize = 200
  let offset = 0
  let emitted = 0

  for (;;) {
    const [products, count] = await productModule.listAndCountProducts(
      {},
      { select: ["id"], take: pageSize, skip: offset }
    )
    if (products.length === 0) break
    for (const p of products) {
      await eventBus.emit({ name: "product.updated", data: { id: p.id } })
    }
    emitted += products.length
    offset += pageSize
    logger.info(`[reindex-search-products] emitted product.updated for ${emitted}/${count}`)
    if (offset >= count) break
  }

  logger.info(`[reindex-search-products] done — emitted product.updated for ${emitted} products (indexing runs async in the worker)`)
}
