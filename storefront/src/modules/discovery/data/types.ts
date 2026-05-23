/**
 * Discovery data types.
 *
 * These shapes are intentionally close to what Meilisearch (the planned filter
 * backend) and Medusa's Store Product API return, so the swap from mock data
 * to real data is mostly a body change in the adapter functions:
 *
 *   - DiscoveryProduct mirrors a flattened Medusa product variant + cover image
 *   - FacetCounts mirrors Meilisearch's `facetDistribution` shape
 *   - DiscoveryQuery is the URL-search-param-derived input
 *
 * When real wiring lands (see `data/get-products.ts`), keep these types stable
 * — every consumer in `modules/discovery/components/*` reads from them.
 */

import { Finish } from "@modules/common/components/wheel"

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
 * filter = add a key here + a section in `<FilterRail>` + a facet bucket in
 * `mock-facets.ts` (and later in the real Meilisearch index attributes).
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
  /** Free-text search term. Not yet wired in the UI; reserved for future. */
  q?: string
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
