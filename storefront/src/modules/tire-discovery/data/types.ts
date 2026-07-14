/**
 * Tire discovery data types + URL-param parser. Parallel to the wheel
 * modules/discovery/data/types.ts, with tire facet vocabulary. WB-068 adds
 * multi-axis fit mode: each product carries its per-variant `fitSpecs` (size
 * + load + speed) and the query carries the vehicle's `vehicleOemTires`,
 * mirroring the wheel `vehicleFitment` seam but resolved entirely from the
 * Meili hit — no Store-API round-trip (see data/get-tire-products.ts).
 * parseTireQueryFromSearchParams is co-located so the client use-tire-query
 * hook can import it without pulling the server-only Meilisearch client.
 */

import type { TireFitSpec } from "@lib/fitment/tire-fits-vehicle"
import type { OemTire } from "@lib/garage/types"

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
  /** Canonical tire sizes this product offers (for the fit badge). */
  sizes: string[]
  /** Per-variant size+load+speed specs (from the Meili `fit_specs` field) —
   *  the multi-axis fit-mode gate for `tireProductHasFittingVariant`. Empty
   *  on pre-re-sync docs (WB-068 degrades those to "passes"). */
  fitSpecs: TireFitSpec[]
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
  /** OEM tires (size + load + speed) of the active vehicle (from ?fit/?fitl/?fits);
   *  drives the multi-axis post-filter in get-tire-products.ts. */
  vehicleOemTires?: OemTire[]
}

/**
 * Serialize/parse the tire fit params: `fit` (sizes CSV), `fitl` (load index
 * CSV), `fits` (speed rating CSV) — all three aligned by index. `fit="0"` is
 * the explicit opt-out (handled by the caller, not here).
 *
 * Encode filters out entries with a blank size BEFORE building all three
 * CSVs, so the three stay index-aligned (no blank size ever lands in the
 * middle of `fit` while `fitl`/`fits` keep their original length).
 */
export function oemTiresToFitParams(
  oemTires: OemTire[]
): { fit: string; fitl: string; fits: string } {
  const withSize = oemTires.filter((o) => o.size)
  return {
    fit: withSize.map((o) => o.size).join(","),
    fitl: withSize.map((o) => (o.loadIndex != null ? String(o.loadIndex) : "")).join(","),
    fits: withSize.map((o) => o.speedRating ?? "").join(","),
  }
}

/** Inverse of `oemTiresToFitParams`. Entries whose size is blank (stray comma
 *  in `fit`) are dropped, and the SAME index is skipped in `fitl`/`fits` so
 *  alignment survives. `fitl`/`fits` are optional for backward compatibility
 *  with size-only `?fit=` links from before WB-068. */
export function fitParamsToOemTires(fit: string, fitl?: string, fits?: string): OemTire[] {
  const sizes = fit.split(",").map((s) => s.trim())
  const loads = (fitl ?? "").split(",")
  const speeds = (fits ?? "").split(",")
  const out: OemTire[] = []
  sizes.forEach((size, i) => {
    if (!size) return
    out.push({
      size,
      loadIndex: loads[i] ? Number(loads[i]) : null,
      speedRating: speeds[i] || null,
    })
  })
  return out
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

  const scalar = (k: string): string | undefined => {
    const v = sp[k]
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined
  }
  const fitRaw = scalar("fit")
  const vehicleOemTires =
    fitRaw && fitRaw !== "0" ? fitParamsToOemTires(fitRaw, scalar("fitl"), scalar("fits")) : undefined

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
    q: ((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").trim() || undefined,
    ...(vehicleOemTires?.length ? { vehicleOemTires } : {}),
  }
}
