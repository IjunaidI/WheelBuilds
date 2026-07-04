/**
 * Tire discovery data adapter — real Meilisearch wiring.
 *
 * Mirrors the wheel `modules/discovery/data/get-products.ts`:
 * - Non-fit path: one hits query + one disjunctive facet query per
 *   dimension, batched via multiSearch.
 * - Fit path (WB-068, mirrors the wheel `vehicleFitment` branch): a coarse
 *   `tire_sizes IN [...]` candidate fetch (cap ~200), then an in-memory
 *   post-filter using each hit's own `fit_specs` field — NO Store-API
 *   round-trip needed (unlike wheels, which re-fetch variants), because the
 *   Meili tire document already carries per-variant size+load+speed. Facet
 *   counts are then recomputed over the fitting set only (mirrors wheels'
 *   `facetsFromProducts`).
 */

import "server-only"
import { unstable_cache } from "next/cache"
import type { MultiSearchResult } from "meilisearch"
import { meili, PRODUCTS_INDEX } from "@lib/meilisearch"
import { lit } from "@modules/discovery/data/escape"
import {
  DEFAULT_PAGE_SIZE, SortOption, TireDiscoveryFilters,
  TireDiscoveryProduct, TireDiscoveryQuery, TireDiscoveryResult, TireFacetCounts, TireType,
} from "./types"
import { tireDiscoveryCacheKey } from "./cache-key"
import { tireProductHasFittingVariant, type TireFitSpec } from "@lib/fitment/tire-fits-vehicle"
import type { OemTire } from "@lib/garage/types"

const NEW_DAYS = 30
const NEW_MS = NEW_DAYS * 24 * 60 * 60 * 1000

const TIRE_FACET_FIELDS = ["brand", "rim_diameters", "tire_sizes", "tire_type", "speed_ratings", "load_indexes"] as const

export function buildTireFilters(
  f: TireDiscoveryFilters,
  skip?: keyof TireDiscoveryFilters,
  vehicleTireSizes?: string[]
): string[] {
  const clauses: string[] = ['product_type = "tire"']
  if (skip !== "brands" && f.brands.length) clauses.push(`brand IN [${f.brands.map(lit).join(", ")}]`)
  if (skip !== "rimDiameters" && f.rimDiameters.length) clauses.push(`rim_diameters IN [${f.rimDiameters.map(lit).join(", ")}]`)
  if (skip !== "sizes" && f.sizes.length) clauses.push(`tire_sizes IN [${f.sizes.map(lit).join(", ")}]`)
  if (skip !== "tireTypes" && f.tireTypes.length) clauses.push(`tire_type IN [${f.tireTypes.map(lit).join(", ")}]`)
  if (skip !== "speedRatings" && f.speedRatings.length) clauses.push(`speed_ratings IN [${f.speedRatings.map(lit).join(", ")}]`)
  if (skip !== "loadIndexes" && f.loadIndexes.length) clauses.push(`load_indexes IN [${f.loadIndexes.map(lit).join(", ")}]`)
  if (f.priceMinCents != null) clauses.push(`price_min >= ${f.priceMinCents}`)
  if (f.priceMaxCents != null) clauses.push(`price_min <= ${f.priceMaxCents}`)
  if (vehicleTireSizes?.length) clauses.push(`tire_sizes IN [${vehicleTireSizes.map(lit).join(", ")}]`)
  return clauses
}

function sortExpr(sort: SortOption): string[] {
  switch (sort) {
    case "price-asc": return ["price_min:asc"]
    case "price-desc": return ["price_min:desc"]
    case "newest": return ["created_at:desc"]
    case "name-asc": return ["title:asc"]
    default: return []
  }
}

type TireHit = {
  id: string; handle: string; title: string; brand: string; thumbnail: string | null
  tire_sizes?: string[]; rim_diameters?: number[]; tire_type?: TireType
  /** "size|load|speed" per variant; load/speed segments are "" when absent. */
  fit_specs?: string[]
  speed_ratings?: string[]; load_indexes?: number[]
  price_min: number; price_max: number; created_at: string | null
}

/** Parses the Meili `fit_specs` field ("size|load|speed" per variant) into
 *  `TireFitSpec[]`, dropping any entry with a blank size. */
function parseFitSpecs(raw?: string[]): TireFitSpec[] {
  if (!Array.isArray(raw)) return []
  const out: TireFitSpec[] = []
  for (const s of raw) {
    const [size, load, speed] = s.split("|")
    if (!size) continue
    out.push({ size, loadIndex: load ? Number(load) : null, speedRating: speed || null })
  }
  return out
}

export function hitToTireProduct(h: TireHit): TireDiscoveryProduct {
  const createdMs = h.created_at ? Date.parse(h.created_at) : NaN
  return {
    id: h.id, handle: h.handle, name: h.title, brand: h.brand,
    priceCents: h.price_min,
    thumbnail: h.thumbnail ?? null,
    sizeCount: h.tire_sizes?.length ?? 0,
    rimDiameters: [...(h.rim_diameters ?? [])].sort((a, b) => a - b),
    tireType: h.tire_type ?? "other",
    sizes: Array.isArray(h.tire_sizes) ? h.tire_sizes : [],
    fitSpecs: parseFitSpecs(h.fit_specs),
    isNew: Number.isFinite(createdMs) ? Date.now() - createdMs < NEW_MS : false,
  }
}

/**
 * The multi-axis fit-mode keep/drop gate (WB-068). A product is kept when
 * either it has no `fit_specs` yet — pre-re-sync docs degrade to "passes" so
 * nothing vanishes from `/tires?fit=` before the Meili re-sync ships — or at
 * least one of its variant specs meets-or-exceeds one of the vehicle's OEM
 * tires (size exact match + load/speed meet-or-exceed).
 */
export function passesFitFilter(fitSpecs: TireFitSpec[], vehicleOemTires: OemTire[]): boolean {
  return fitSpecs.length === 0 || tireProductHasFittingVariant(fitSpecs, vehicleOemTires)
}

/**
 * Rebuild facet counts from the in-memory fitting set (used only in fit
 * mode, mirroring the wheel `facetsFromProducts`). Tallied straight from the
 * raw Meili hit fields (each already deduped per-product server-side) rather
 * than from `TireDiscoveryProduct`, since the product type doesn't carry the
 * per-product speed/load arrays needed for those two facets.
 */
function facetsFromTireHits(hits: TireHit[]): TireFacetCounts {
  const tally = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1 }
  const brands: Record<string, number> = {}, rimDiameters: Record<string, number> = {}
  const sizes: Record<string, number> = {}, tireTypes: Record<string, number> = {}
  const speedRatings: Record<string, number> = {}, loadIndexes: Record<string, number> = {}
  for (const h of hits) {
    if (h.brand) tally(brands, h.brand)
    if (h.tire_type) tally(tireTypes, h.tire_type)
    for (const d of h.rim_diameters ?? []) tally(rimDiameters, String(d))
    for (const s of h.tire_sizes ?? []) tally(sizes, s)
    for (const sr of h.speed_ratings ?? []) tally(speedRatings, sr)
    for (const li of h.load_indexes ?? []) tally(loadIndexes, String(li))
  }
  return { brands, rimDiameters, sizes, tireTypes, speedRatings, loadIndexes }
}

function emptyResult(pageSize: number): TireDiscoveryResult {
  return {
    products: [], totalCount: 0, pageSize,
    facets: { brands: {}, rimDiameters: {}, sizes: {}, tireTypes: {}, speedRatings: {}, loadIndexes: {} },
  }
}

const facetQueryByDim: Record<string, keyof TireDiscoveryFilters> = {
  brand: "brands", rim_diameters: "rimDiameters", tire_sizes: "sizes",
  tire_type: "tireTypes", speed_ratings: "speedRatings", load_indexes: "loadIndexes",
}

async function fetchTireDiscoveryProducts(query: TireDiscoveryQuery): Promise<TireDiscoveryResult> {
  const pageSize = DEFAULT_PAGE_SIZE

  // FIT MODE (WB-068): coarse tire_sizes-matched candidates from Meili, then
  // the real per-variant (size+load+speed) check using each hit's OWN
  // `fit_specs` — no Store-API round-trip needed (unlike wheels, whose bolt
  // pattern needs a variant-metadata re-fetch). Bounded scan + in-memory
  // pagination + facet recompute over the fitting set only.
  const vehicleOemTires = query.vehicleOemTires
  if (vehicleOemTires?.length) {
    const FIT_CANDIDATE_CAP = 200
    const sizes = Array.from(new Set(vehicleOemTires.map((o) => o.size)))
    const { results } = await meili.multiSearch({
      queries: [
        {
          indexUid: PRODUCTS_INDEX,
          q: query.q ?? "",
          filter: buildTireFilters(query.filters, undefined, sizes).join(" AND "),
          sort: sortExpr(query.sort),
          limit: FIT_CANDIDATE_CAP,
          offset: 0,
        },
      ],
    })
    const hits = (results[0] as MultiSearchResult<TireHit>).hits
    const candidates = hits.map((hit) => ({ hit, product: hitToTireProduct(hit) }))
    const fitting = candidates.filter(({ product }) =>
      passesFitFilter(product.fitSpecs, vehicleOemTires)
    )

    const start = (query.page - 1) * pageSize
    return {
      products: fitting.slice(start, start + pageSize).map((c) => c.product),
      totalCount: fitting.length,
      pageSize,
      facets: facetsFromTireHits(fitting.map((c) => c.hit)),
    }
  }

  const offset = (query.page - 1) * pageSize

  const { results } = await meili.multiSearch({
    queries: [
      {
        indexUid: PRODUCTS_INDEX, q: query.q ?? "",
        filter: buildTireFilters(query.filters).join(" AND "),
        sort: sortExpr(query.sort), limit: pageSize, offset,
      },
      ...TIRE_FACET_FIELDS.map((field) => ({
        indexUid: PRODUCTS_INDEX, q: query.q ?? "",
        filter: buildTireFilters(query.filters, facetQueryByDim[field]).join(" AND "),
        facets: [field], limit: 0,
      })),
    ],
  })

  const [hitsRes, ...facetRes] = results as MultiSearchResult<TireHit>[]
  const facetByField: Record<string, Record<string, number>> = {}
  TIRE_FACET_FIELDS.forEach((field, i) => {
    facetByField[field] = facetRes[i]?.facetDistribution?.[field] ?? {}
  })
  const facets: TireFacetCounts = {
    brands: facetByField["brand"], rimDiameters: facetByField["rim_diameters"],
    sizes: facetByField["tire_sizes"], tireTypes: facetByField["tire_type"],
    speedRatings: facetByField["speed_ratings"], loadIndexes: facetByField["load_indexes"],
  }
  return {
    products: hitsRes.hits.map(hitToTireProduct),
    totalCount: hitsRes.estimatedTotalHits ?? hitsRes.hits.length,
    pageSize, facets,
  }
}

export async function getTireDiscoveryProducts(query: TireDiscoveryQuery): Promise<TireDiscoveryResult> {
  try {
    const cached = unstable_cache(
      () => fetchTireDiscoveryProducts(query),
      ["tire-discovery", tireDiscoveryCacheKey(query)],
      { revalidate: 60, tags: ["discovery", "tire-discovery"] }
    )
    return await cached()
  } catch (e) {
    console.error("[tire-discovery] Meilisearch query failed:", e)
    return emptyResult(DEFAULT_PAGE_SIZE)
  }
}
