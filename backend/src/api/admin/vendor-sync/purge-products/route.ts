import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"

const VENDORS = ["wheelpros-wheels", "wheelpros-tires"]

/**
 * POST /admin/vendor-sync/purge-products
 *
 * Delete vendor-owned Medusa products SERVER-SIDE (so the cascade runs at the
 * backend's own DB latency, not over the public proxy). Mirrors the selection
 * logic of vendor-sync-dev-wipe.ts --purge-products: it deletes ONLY products
 * whose metadata.vendor_code names a vendor-sync vendor — never admin/seed
 * products. Use this for the WB-051 full re-import migration.
 *
 * Work is bounded by a wall-clock budget per call so a single request can never
 * exceed the HTTP gateway timeout. Call it repeatedly until `remaining === 0`.
 *
 * Body (all optional):
 *   - vendor_code: restrict to one vendor (default: both wheelpros vendors)
 *   - max_seconds: per-call delete budget, clamped to [5, 60] (default 25)
 *
 * Returns: { deleted, remaining, total, vendors }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = req.scope.resolve(Modules.PRODUCT)

  const { vendor_code, max_seconds = 25 } = (req.body ?? {}) as {
    vendor_code?: string
    max_seconds?: number
  }
  const vendors = vendor_code ? [vendor_code] : VENDORS
  const vendorSet = new Set(vendors)
  const budgetMs = Math.min(Math.max(Number(max_seconds) || 25, 5), 60) * 1000
  const deadline = Date.now() + budgetMs

  // metadata is not a queryable column, so list ids + metadata and filter in JS
  // (same approach as the dev-wipe script; one fast query server-side).
  const all = await productService.listProducts(
    {},
    { select: ["id", "metadata"], take: null }
  )
  const ids = all
    .filter((p: any) =>
      vendorSet.has(((p.metadata ?? {}) as Record<string, unknown>).vendor_code as string)
    )
    .map((p: any) => p.id as string)
  const total = ids.length

  // Delete in sub-chunks until the per-call budget is spent. The workflow
  // cascades variants, inventory items + levels, prices, and links per product.
  const SUB = 25
  let deleted = 0
  for (let i = 0; i < ids.length && Date.now() < deadline; i += SUB) {
    const sub = ids.slice(i, i + SUB)
    await deleteProductsWorkflow(req.scope).run({ input: { ids: sub } })
    deleted += sub.length
  }

  const remaining = Math.max(total - deleted, 0)
  logger.info(
    `[vendor-sync] purge-products: deleted ${deleted} this call, ${remaining} remaining (vendors: ${vendors.join(", ")})`
  )

  res.json({ deleted, remaining, total, vendors })
}
