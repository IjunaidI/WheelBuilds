/**
 * Product Detail adapter — the integration seam between the PDP UI and the
 * data source. Everything in `modules/product-detail/components/*` reads from
 * this file (and `./types`).
 *
 * Current state: **MOCK**. Returns the same `MOCK_PRODUCT_DETAIL` for any
 * handle the URL throws at it. Related products come from the Discovery
 * mock catalog filtered to a handful of plausible siblings.
 *
 * To wire real data (see [storefront/CLAUDE.md "Product Detail" section]):
 *
 *   1. Replace the body of `getProductDetail(handle)` with a Medusa fetch
 *      via `lib/data/products.ts → getProductByHandle(handle, region.id)`.
 *      Region resolution mirrors the legacy `modules/store/templates/
 *      paginated-products.tsx` pattern.
 *   2. Map the Medusa product + its variants → `ProductDetail`. Variants
 *      become `sizeOptions` (one per Diameter×Width); variant metadata
 *      carries weight/offset/finish/bolt-pattern. The vendor-sync apply
 *      pipeline already populates these on the catalog.
 *   3. `relatedHandles` come from the same brand or same category — issue
 *      a sibling `getProductsList` call filtered by collection_id or by
 *      tag_id (depending on how categories shake out).
 *   4. `fitment` comes from the Phase 2.1 fitment table (currently empty —
 *      see STOREFRONT_PHASE2_PLAN.md). Return [] when no data, the UI
 *      degrades to "no fitment confirmed yet".
 *   5. Wire `notFound()` for missing handles — today every handle resolves
 *      to the mock.
 */

import { DiscoveryProduct } from "@modules/discovery/data/types"
import { MOCK_CATALOG } from "@modules/discovery/data/mock-products"
import { ProductDetail } from "./types"
import { MOCK_PRODUCT_DETAIL } from "./mock-detail"

export async function getProductDetail(handle: string): Promise<ProductDetail> {
  // MOCK: the handle is ignored — every product card lands here.
  // Wire as: const product = await getProductByHandle(handle, region.id)
  //          if (!product) notFound()
  //          return mapMedusaProductToDetail(product)
  return {
    ...MOCK_PRODUCT_DETAIL,
    // Pretend the URL handle is what we returned, so breadcrumbs / canonical
    // URLs feel like the user clicked a real product.
    handle: handle || MOCK_PRODUCT_DETAIL.handle,
  }
}

/**
 * Returns related products for the PDP "Similar wheels" row. Currently picks
 * a few off the mock discovery catalog; real wiring is a sibling Medusa
 * fetch filtered by brand or by shared category.
 */
export async function getRelatedProducts(
  product: ProductDetail
): Promise<DiscoveryProduct[]> {
  // Pick the first N items from the mock catalog whose handle is in
  // `product.relatedHandles`, plus extras from the same brand to fill the row.
  const byHandle = new Map(MOCK_CATALOG.map((p) => [p.handle, p]))
  const chosen: DiscoveryProduct[] = []

  for (const h of product.relatedHandles) {
    const match = byHandle.get(h)
    if (match) chosen.push(match)
  }

  if (chosen.length < 4) {
    for (const p of MOCK_CATALOG) {
      if (chosen.find((c) => c.id === p.id)) continue
      chosen.push(p)
      if (chosen.length >= 6) break
    }
  }

  return chosen.slice(0, 6)
}
