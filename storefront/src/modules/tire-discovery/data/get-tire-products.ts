/**
 * Tire discovery data adapter — real Meilisearch wiring.
 *
 * Mirrors the wheel `modules/discovery/data/get-products.ts` NON-fit path:
 * one hits query + one disjunctive facet query per dimension, batched via
 * multiSearch. There is no fitment/vehicleConstraint branch here — tires
 * have no fit-mode seam (Spec 2 scope is wheels only).
 */

import "server-only"
import { unstable_cache } from "next/cache"
import type { MultiSearchResult } from "meilisearch"
import { meili, PRODUCTS_INDEX } from "@lib/meilisearch"
import { lit } from "@modules/discovery/data/escape"
import {
  DEFAULT_PAGE_SIZE, EMPTY_TIRE_FILTERS, SortOption, TireDiscoveryFilters,
  TireDiscoveryProduct, TireDiscoveryQuery, TireDiscoveryResult, TireFacetCounts, TireType,
} from "./types"
import { tireDiscoveryCacheKey } from "./cache-key"

const NEW_DAYS = 30
const NEW_MS = NEW_DAYS * 24 * 60 * 60 * 1000

const TIRE_FACET_FIELDS = ["brand", "rim_diameters", "tire_sizes", "tire_type", "speed_ratings", "load_indexes"] as const

export function buildTireFilters(
  f: TireDiscoveryFilters,
  skip?: keyof TireDiscoveryFilters
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
  price_min: number; price_max: number; created_at: string | null
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
    isNew: Number.isFinite(createdMs) ? Date.now() - createdMs < NEW_MS : false,
  }
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
