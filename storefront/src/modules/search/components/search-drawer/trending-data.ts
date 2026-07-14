import type { DiscoveryProduct } from "@modules/discovery/data/types"
import type { Finish } from "@modules/common/components/wheel"

/** Prop shape the search-drawer's <Trending> tiles render from. */
export type TrendingProduct = {
  handle: string
  brand: string
  name: string
  priceCents: number
  finish?: Finish
}

/**
 * Maps the home catalog's newest products down to the Trending tile's prop
 * shape (WB-085 N3). Replaces the old hard-coded, zero-result TRENDING array
 * with real products that link to real PDPs.
 */
export const toTrendingProducts = (
  newest: DiscoveryProduct[],
  count = 3
): TrendingProduct[] =>
  newest.slice(0, count).map((p) => ({
    handle: p.handle,
    brand: p.brand,
    name: p.name,
    priceCents: p.priceCents,
    finish: p.finishes[0],
  }))
