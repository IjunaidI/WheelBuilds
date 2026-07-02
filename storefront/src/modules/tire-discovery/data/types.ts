/**
 * Tire discovery data types + URL-param parser. Parallel to the wheel
 * modules/discovery/data/types.ts, with tire facet vocabulary and NO fitment.
 * parseTireQueryFromSearchParams is co-located so the client use-tire-query
 * hook can import it without pulling the server-only Meilisearch client.
 */

export type TireType = "passenger" | "light-truck" | "other"

export type TireDiscoveryProduct = {
  id: string
  handle: string
  brand: string
  name: string
  /** Cents. price_min = min variant price. */
  priceCents: number
  thumbnail: string | null
  /** tire_sizes.length → "N sizes". */
  sizeCount: number
  /** Sorted rim inches → "17\"–22\"" range. */
  rimDiameters: number[]
  tireType: TireType
  isNew?: boolean
}

export type SortOption = "relevance" | "price-asc" | "price-desc" | "newest" | "name-asc"

export const SORT_LABELS: Record<SortOption, string> = {
  relevance: "Relevance",
  "price-asc": "Price · Low to high",
  "price-desc": "Price · High to low",
  newest: "Newest first",
  "name-asc": "Name · A to Z",
}

/** Keys correspond 1:1 with the filter-rail sections. */
export type TireDiscoveryFilters = {
  brands: string[]
  rimDiameters: number[]
  sizes: string[]
  tireTypes: string[]
  speedRatings: string[]
  loadIndexes: number[]
  priceMinCents?: number
  priceMaxCents?: number
}

export const EMPTY_TIRE_FILTERS: TireDiscoveryFilters = {
  brands: [], rimDiameters: [], sizes: [], tireTypes: [], speedRatings: [], loadIndexes: [],
}

export type TireDiscoveryQuery = {
  filters: TireDiscoveryFilters
  sort: SortOption
  page: number
  q?: string
}

export type TireFacetCounts = {
  brands: Record<string, number>
  rimDiameters: Record<string, number>
  sizes: Record<string, number>
  tireTypes: Record<string, number>
  speedRatings: Record<string, number>
  loadIndexes: Record<string, number>
}

export type TireDiscoveryResult = {
  products: TireDiscoveryProduct[]
  totalCount: number
  pageSize: number
  facets: TireFacetCounts
}

export const DEFAULT_PAGE_SIZE = 12

export function parseTireQueryFromSearchParams(
  sp: Record<string, string | string[] | undefined> | undefined
): TireDiscoveryQuery {
  if (!sp) return { filters: EMPTY_TIRE_FILTERS, sort: "relevance", page: 1 }

  const arr = (k: string): string[] => {
    const v = sp[k]
    if (!v) return []
    return Array.isArray(v) ? v : v.split(",").filter(Boolean)
  }
  const nums = (k: string): number[] =>
    arr(k).map((s) => Number(s)).filter((n) => Number.isFinite(n))
  const num = (k: string): number | undefined => {
    const v = sp[k]
    if (!v) return undefined
    const n = Number(Array.isArray(v) ? v[0] : v)
    return Number.isFinite(n) ? n : undefined
  }

  const sortRaw = (Array.isArray(sp.sort) ? sp.sort[0] : sp.sort) ?? "relevance"
  const sort: SortOption = (
    ["relevance", "price-asc", "price-desc", "newest", "name-asc"] as SortOption[]
  ).includes(sortRaw as SortOption)
    ? (sortRaw as SortOption)
    : "relevance"

  return {
    filters: {
      brands: arr("brands"),
      rimDiameters: nums("rimDiameters"),
      sizes: arr("sizes"),
      tireTypes: arr("tireTypes"),
      speedRatings: arr("speedRatings"),
      loadIndexes: nums("loadIndexes"),
      priceMinCents: num("priceMin"),
      priceMaxCents: num("priceMax"),
    },
    sort,
    page: Math.max(1, num("page") ?? 1),
    q: (Array.isArray(sp.q) ? sp.q[0] : sp.q) || undefined,
  }
}
