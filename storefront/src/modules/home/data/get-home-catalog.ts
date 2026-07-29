import "server-only"
import { cache } from "react"
import { getDiscoveryProducts } from "@modules/discovery/data/get-products"
import { getStyleCounts } from "@modules/discovery/data/get-style-counts"
import {
  EMPTY_FILTERS,
  type DiscoveryProduct,
  type FacetCounts,
} from "@modules/discovery/data/types"

export type HomeCatalog = {
  newestProducts: DiscoveryProduct[]
  facets: FacetCounts
  /**
   * Distinct product count per Shop-by-Style preset, keyed by label
   * (WB-120 Q-12). Empty when the count query fails — `styleTiles` then
   * falls back to its (inaccurate) summed counts rather than blanking.
   */
  styleCounts: Record<string, number>
}

/**
 * Single source of catalog data for the homepage. react.cache dedupes it
 * across the sibling sections (NewDropsRow, ShopByBrand, ShopByStyle, and the
 * page-level brand count), so all of them share ONE Meilisearch round-trip per
 * request. getDiscoveryProducts swallows Meili failures into an empty result,
 * so this never throws — callers degrade on empty data.
 */
export const getHomeCatalog = cache(async (): Promise<HomeCatalog> => {
  // Both reads are independent, so pay them concurrently rather than
  // serially — this is on the homepage's critical path.
  const [{ products, facets }, styleCounts] = await Promise.all([
    getDiscoveryProducts({ filters: EMPTY_FILTERS, sort: "newest", page: 1 }),
    getStyleCounts(),
  ])
  return { newestProducts: products, facets, styleCounts }
})
