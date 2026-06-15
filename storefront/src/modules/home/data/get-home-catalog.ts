import "server-only"
import { cache } from "react"
import { getDiscoveryProducts } from "@modules/discovery/data/get-products"
import {
  EMPTY_FILTERS,
  type DiscoveryProduct,
  type FacetCounts,
} from "@modules/discovery/data/types"

export type HomeCatalog = {
  newestProducts: DiscoveryProduct[]
  facets: FacetCounts
}

/**
 * Single source of catalog data for the homepage. react.cache dedupes it
 * across the sibling sections (NewDropsRow, ShopByBrand, ShopByStyle, and the
 * page-level brand count), so all of them share ONE Meilisearch round-trip per
 * request. getDiscoveryProducts swallows Meili failures into an empty result,
 * so this never throws — callers degrade on empty data.
 */
export const getHomeCatalog = cache(async (): Promise<HomeCatalog> => {
  const { products, facets } = await getDiscoveryProducts({
    filters: EMPTY_FILTERS,
    sort: "newest",
    page: 1,
  })
  return { newestProducts: products, facets }
})
