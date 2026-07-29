import type { DiscoveryProduct } from "@modules/discovery/data/types"
import type { Finish } from "@modules/common/components/wheel"

/** Prop shape the search-drawer's <Trending> tiles render from. */
export type TrendingProduct = {
  handle: string
  brand: string
  name: string
  priceCents: number
  finish?: Finish
  /**
   * Live availability, carried through so the tile can badge an out-of-stock
   * product (WB-120 Q-03). `undefined` means unknown and must never badge.
   */
  inStock?: boolean
}

/**
 * Maps the home catalog's newest products down to the Trending tile's prop
 * shape (WB-085 N3). Replaces the old hard-coded, zero-result TRENDING array
 * with real products that link to real PDPs.
 *
 * WB-120 Q-03 — this used to be a plain `newest.slice(0, count)` that dropped
 * `inStock` on the floor, so the drawer could recommend three products the
 * shopper cannot buy, with nothing on the tile to say so. An external QA pass
 * hit exactly that: all three tiles out of stock.
 *
 * In-stock products are now preferred, via a STABLE partition so newest-first
 * order is preserved within each group. Deliberately NOT a hard filter: if
 * fewer than `count` products are in stock, three badged tiles beat one tile —
 * and a hard filter would interact badly with WB-110, where special-order
 * products currently read as blanket out-of-stock.
 */
export const toTrendingProducts = (
  newest: DiscoveryProduct[],
  count = 3
): TrendingProduct[] => {
  const preferred = [
    ...newest.filter((p) => p.inStock === true),
    ...newest.filter((p) => p.inStock !== true),
  ]

  return preferred.slice(0, count).map((p) => ({
    handle: p.handle,
    brand: p.brand,
    name: p.name,
    priceCents: p.priceCents,
    finish: p.finishes[0],
    inStock: p.inStock,
  }))
}
