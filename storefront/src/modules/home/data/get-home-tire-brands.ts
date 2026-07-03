import { getTireDiscoveryProducts } from "@modules/tire-discovery/data/get-tire-products"
import { EMPTY_TIRE_FILTERS } from "@modules/tire-discovery/data/types"

export type HomeTireBrand = { name: string; count: number }

/**
 * Top tire brands for the home "TIRES" band, by product count. Throw-safe: the
 * tire adapter swallows Meilisearch failures and returns empty facets, so this
 * degrades to []. Mirrors how ShopByBrand reads getHomeCatalog facets.
 */
export async function getHomeTireBrands(limit = 8): Promise<HomeTireBrand[]> {
  const { facets } = await getTireDiscoveryProducts({
    filters: EMPTY_TIRE_FILTERS,
    sort: "relevance",
    page: 1,
  })
  return Object.entries(facets.brands)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))
}
