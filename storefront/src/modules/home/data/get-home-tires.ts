import { getTireDiscoveryProducts } from "@modules/tire-discovery/data/get-tire-products"
import { EMPTY_TIRE_FILTERS } from "@modules/tire-discovery/data/types"
import type { TireDiscoveryProduct } from "@modules/tire-discovery/data/types"

/**
 * The newest N tires for the home "Shop Tires" rail. Throw-safe: the tire
 * adapter swallows Meilisearch failures and returns an empty result, so this
 * degrades to [] and the rail renders nothing.
 */
export async function getHomeTires(limit = 6): Promise<TireDiscoveryProduct[]> {
  const { products } = await getTireDiscoveryProducts({
    filters: EMPTY_TIRE_FILTERS,
    sort: "newest",
    page: 1,
  })
  return products.slice(0, limit)
}
