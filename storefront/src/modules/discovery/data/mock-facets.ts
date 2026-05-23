/**
 * Mock facet computation.
 *
 * In production, facets come from Meilisearch's `facetDistribution` on the
 * same query response — this file goes away. Until then, we count from the
 * mock catalog so the filter rail shows realistic-looking numbers next to
 * each option.
 */

import { DiscoveryProduct, FacetCounts } from "./types"

const tallyArray = <K extends string | number>(
  rows: DiscoveryProduct[],
  pick: (p: DiscoveryProduct) => K[]
): Record<string, number> => {
  const acc: Record<string, number> = {}
  for (const r of rows) {
    for (const k of pick(r)) {
      const key = String(k)
      acc[key] = (acc[key] ?? 0) + 1
    }
  }
  return acc
}

const tallyScalar = <K extends string | number>(
  rows: DiscoveryProduct[],
  pick: (p: DiscoveryProduct) => K
): Record<string, number> => {
  const acc: Record<string, number> = {}
  for (const r of rows) {
    const key = String(pick(r))
    acc[key] = (acc[key] ?? 0) + 1
  }
  return acc
}

export const computeFacets = (
  products: DiscoveryProduct[]
): FacetCounts => ({
  categories: tallyArray(products, (p) => p.categories),
  brands: tallyScalar(products, (p) => p.brand),
  diameters: tallyScalar(products, (p) => p.diameter),
  boltPatterns: tallyScalar(products, (p) => p.boltPattern),
  finishes: tallyScalar(products, (p) => p.finish),
})
