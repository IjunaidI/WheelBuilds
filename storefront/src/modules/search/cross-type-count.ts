import "server-only"

import { meili, PRODUCTS_INDEX } from "@lib/meilisearch"

/**
 * How many products of the OTHER catalogue match this search (WB-126).
 *
 * `/store` is scoped to `product_type = "wheel"` and `/tires` to `"tire"`, so a
 * search for a brand that only exists on the other side honestly returns zero
 * with no hint that the products exist at all. Verified live: "Falken" is a
 * TYRE brand with 65 products and 0 wheels — a shopper searching from the
 * wheels page was told, correctly but uselessly, that there were no results.
 *
 * WB-126 also routes a search made FROM `/tires` to `/tires`, which fixes the
 * case where the shopper is already on the right surface. This covers the
 * other case — searching from the wrong one — which is what the client's video
 * actually showed.
 *
 * Only ever called on the zero-result path, so the common case pays nothing.
 * Returns 0 on any failure, matching `getDiscoveryProducts`' swallow: a
 * cross-sell hint must never be the thing that breaks an empty state.
 */
export async function countOtherType(
  q: string,
  currentType: "wheel" | "tire"
): Promise<number> {
  const other = currentType === "wheel" ? "tire" : "wheel"
  const query = (q ?? "").trim()
  if (!query) return 0

  try {
    const res = await meili.index(PRODUCTS_INDEX).search(query, {
      filter: `product_type = "${other}"`,
      hitsPerPage: 1,
      page: 1,
    })
    const total =
      (res as { totalHits?: number; estimatedTotalHits?: number }).totalHits ??
      (res as { estimatedTotalHits?: number }).estimatedTotalHits
    return typeof total === "number" ? total : 0
  } catch {
    return 0
  }
}
