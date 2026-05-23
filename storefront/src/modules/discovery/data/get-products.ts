/**
 * Discovery data adapter — the integration seam between the UI and the data
 * source. Everything in `modules/discovery/components/*` reads from this file
 * (and `./types`).
 *
 * Current state: **MOCK**. Filters and pagination are computed in-memory from
 * `MOCK_CATALOG`. Facet counts come from `mock-facets.ts`.
 *
 * To wire real data (see [storefront/CLAUDE.md "Discovery (catalog)" section]):
 *
 *   1. Replace the body of `getDiscoveryProducts(query)` with a Meilisearch
 *      call. The Meilisearch index settings are in
 *      `backend/medusa-config.js` under the plugin block. The relevant
 *      attributes are already indexed (brand, finish, diameter, width,
 *      bolt_pattern, categories, price).
 *   2. Map Meilisearch hits to `DiscoveryProduct` — keep the shape stable so
 *      no consumer changes.
 *   3. Pull `facets` from Meilisearch's `facetDistribution` on the same
 *      response. Drop `getDiscoveryFacets` (it's only used while mocking).
 *   4. The function stays async — the UI awaits it from a Server Component
 *      (the templates render via Suspense), so no client-side fetch state to
 *      manage. Real Medusa price lookups (region-scoped) happen here too.
 *
 * The mock adapter is **deterministic**: same query → same result, no
 * Math.random(), so SSR matches client.
 */

import {
  DEFAULT_PAGE_SIZE,
  DiscoveryQuery,
  DiscoveryResult,
  EMPTY_FILTERS,
  SortOption,
} from "./types"
import { MOCK_CATALOG } from "./mock-products"
import { computeFacets } from "./mock-facets"

const matches = (
  product: (typeof MOCK_CATALOG)[number],
  f: DiscoveryQuery["filters"]
) => {
  if (f.categories.length && !f.categories.some((c) => product.categories.includes(c))) {
    return false
  }
  if (f.brands.length && !f.brands.includes(product.brand)) return false
  if (f.diameters.length && !f.diameters.includes(product.diameter)) return false
  if (f.boltPatterns.length && !f.boltPatterns.includes(product.boltPattern)) {
    return false
  }
  if (f.finishes.length && !f.finishes.includes(product.finish)) return false
  if (f.priceMinCents != null && product.priceCents < f.priceMinCents) return false
  if (f.priceMaxCents != null && product.priceCents > f.priceMaxCents) return false
  return true
}

const sortBy = (sort: SortOption) => {
  switch (sort) {
    case "price-asc":
      return (a: any, b: any) => a.priceCents - b.priceCents
    case "price-desc":
      return (a: any, b: any) => b.priceCents - a.priceCents
    case "name-asc":
      return (a: any, b: any) => a.name.localeCompare(b.name)
    case "newest":
      // Mock catalog has no createdAt — fall back to isNew first, then id.
      return (a: any, b: any) => {
        if (a.isNew !== b.isNew) return a.isNew ? -1 : 1
        return b.id.localeCompare(a.id)
      }
    case "relevance":
    default:
      return undefined
  }
}

/**
 * Returns the page slice + total count + facet distribution for the current
 * filter+sort+page combination. Always async so the call site is
 * Meilisearch-ready.
 */
export async function getDiscoveryProducts(
  query: DiscoveryQuery
): Promise<DiscoveryResult> {
  const pageSize = DEFAULT_PAGE_SIZE
  const filtered = MOCK_CATALOG.filter((p) => matches(p, query.filters))
  const sorter = sortBy(query.sort)
  const sorted = sorter ? [...filtered].sort(sorter) : filtered
  const start = (query.page - 1) * pageSize
  const products = sorted.slice(start, start + pageSize)

  // Facets are computed on the FILTERED set EXCEPT for the dimension being
  // counted — so e.g. brand counts reflect everything except brand filters.
  // The Meilisearch equivalent is "disjunctive facets". For mock simplicity
  // we compute against the un-filtered catalog and ignore that subtlety.
  // When wiring real data, request facets per dimension with the other
  // filters applied.
  const facets = computeFacets(MOCK_CATALOG)

  return {
    products,
    totalCount: filtered.length,
    pageSize,
    facets,
  }
}

/**
 * Read filter + sort + page state from URL search params. Used by the
 * Discovery server component to derive its query. The inverse — writing
 * filters back to the URL — lives in the client components (router.push
 * with new params).
 */
export function parseQueryFromSearchParams(
  sp: Record<string, string | string[] | undefined> | undefined
): DiscoveryQuery {
  if (!sp) return { filters: EMPTY_FILTERS, sort: "relevance", page: 1 }

  const arr = (k: string): string[] => {
    const v = sp[k]
    if (!v) return []
    return Array.isArray(v) ? v : v.split(",").filter(Boolean)
  }
  const num = (k: string): number | undefined => {
    const v = sp[k]
    if (!v) return undefined
    const n = Number(Array.isArray(v) ? v[0] : v)
    return Number.isFinite(n) ? n : undefined
  }

  const sortRaw = (Array.isArray(sp.sort) ? sp.sort[0] : sp.sort) ?? "relevance"
  const sort: SortOption = [
    "relevance",
    "price-asc",
    "price-desc",
    "newest",
    "name-asc",
  ].includes(sortRaw as SortOption)
    ? (sortRaw as SortOption)
    : "relevance"

  return {
    filters: {
      categories: arr("categories"),
      brands: arr("brands"),
      diameters: arr("diameters")
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n)),
      boltPatterns: arr("boltPatterns"),
      finishes: arr("finishes") as DiscoveryQuery["filters"]["finishes"],
      priceMinCents: num("priceMin"),
      priceMaxCents: num("priceMax"),
    },
    sort,
    page: Math.max(1, num("page") ?? 1),
    q: (Array.isArray(sp.q) ? sp.q[0] : sp.q) || undefined,
  }
}
