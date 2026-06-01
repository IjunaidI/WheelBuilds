/**
 * Discovery data types + URL-param parser.
 *
 * Shape contract for the Meilisearch adapter (data/get-products.ts):
 *   - DiscoveryProduct mirrors a flattened Medusa product variant + cover image
 *   - FacetCounts mirrors Meilisearch's `facetDistribution` shape
 *   - DiscoveryQuery is the URL-search-param-derived input
 *
 * Every consumer in `modules/discovery/components/*` reads these shapes — keep
 * them stable. `parseQueryFromSearchParams` is co-located here (rather than in
 * the adapter) so the client `useDiscoveryQuery` hook can import it without
 * pulling the server-only Meilisearch client into the client bundle.
 */

import { Finish } from "@modules/common/components/wheel"
import { vehicleToConstraints, fitParamToPatterns } from "./vehicle-constraint"

export type DiscoveryProduct = {
  id: string
  handle: string
  brand: string
  name: string
  /** Cents in storefront currency. Display formatting is the consumer's job. */
  priceCents: number
  /** Optional sale price (cents). Renders as struck-through original + accent sale price. */
  originalPriceCents?: number
  finish: Finish
  diameter: number
  width: number
  boltPattern: string
  /** Canonical bolt patterns ("{count}x{pcd_mm}") used to badge fit vs the active vehicle. */
  boltPatternsCanonical: string[]
  /** Category slugs the product belongs to (e.g. "off-road", "luxury"). */
  categories: string[]
  /** "NEW" tag in the product card. */
  isNew?: boolean
  /** When the active garage vehicle is in scope, set this to mark the card. */
  fitsActiveVehicle?: boolean
}

export type SortOption =
  | "relevance"
  | "price-asc"
  | "price-desc"
  | "newest"
  | "name-asc"

export const SORT_LABELS: Record<SortOption, string> = {
  relevance: "Relevance",
  "price-asc": "Price · Low to high",
  "price-desc": "Price · High to low",
  newest: "Newest first",
  "name-asc": "Name · A to Z",
}

/**
 * The keys correspond 1:1 with the filter sections in the rail. Adding a new
 * filter = add a key here + a section in `<FilterRail>` + a filterable
 * attribute in `backend/medusa-config.js` + a clause in the adapter's
 * `buildFilters` / `FACET_FIELDS`.
 */
export type DiscoveryFilters = {
  categories: string[]
  brands: string[]
  diameters: number[]
  boltPatterns: string[]
  finishes: Finish[]
  priceMinCents?: number
  priceMaxCents?: number
}

export const EMPTY_FILTERS: DiscoveryFilters = {
  categories: [],
  brands: [],
  diameters: [],
  boltPatterns: [],
  finishes: [],
}

export type DiscoveryQuery = {
  filters: DiscoveryFilters
  sort: SortOption
  page: number
  /** Free-text search term (from the search drawer). */
  q?: string
  /**
   * Spec 2 (fitment) seam: extra Meilisearch filter clauses derived from the
   * active vehicle's wheel-size.com spec. Empty/undefined in this spec.
   */
  vehicleConstraint?: string[]
}

/** Per-facet counts returned alongside the product list. */
export type FacetCounts = {
  categories: Record<string, number>
  brands: Record<string, number>
  diameters: Record<string, number>
  boltPatterns: Record<string, number>
  finishes: Record<string, number>
}

export type DiscoveryResult = {
  products: DiscoveryProduct[]
  totalCount: number
  pageSize: number
  facets: FacetCounts
}

export const DEFAULT_PAGE_SIZE = 12

/**
 * Read filter + sort + page state from URL search params. Kept here (not in
 * get-products.ts) so client components such as `use-discovery-query.ts` can
 * import it without pulling in the server-only Meilisearch client.
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

  // fit: absent => no constraint; "0" => explicit off; else CSV of canonical patterns.
  const fitRaw = typeof sp.fit === "string" ? sp.fit : Array.isArray(sp.fit) ? sp.fit[0] : undefined
  const vehicleConstraint =
    fitRaw && fitRaw !== "0"
      ? vehicleToConstraints({ canonicalBoltPatterns: fitParamToPatterns(fitRaw) })
      : undefined

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
    ...(vehicleConstraint?.length ? { vehicleConstraint } : {}),
  }
}
