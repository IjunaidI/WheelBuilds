/**
 * Discovery data adapter — real Meilisearch wiring.
 *
 * Powers everything in `modules/discovery/components/*`. Reads the products
 * index built by the backend transformer (see
 * backend/src/modules/vendor-sync/search/build-search-document.ts).
 *
 * - Hits + total: one filtered search (the current page).
 * - Facet counts: disjunctive — each facet dimension is counted with the
 *   OTHER filters applied (not its own), via a multiSearch batch.
 * - `vehicleConstraint` (Spec 2) is appended to every filter when present;
 *   it is always absent in this spec.
 *
 * Types stay stable — no consumer changes.
 *
 * NOTE: `parseQueryFromSearchParams` lives in `./types` (not here) so that
 * client components (use-discovery-query.ts) can import it without pulling in
 * this file's server-only Meilisearch client.
 */

import { meili, PRODUCTS_INDEX } from "@lib/meilisearch"
import type { MultiSearchResult } from "meilisearch"
import {
  DEFAULT_PAGE_SIZE,
  DiscoveryFilters,
  DiscoveryProduct,
  DiscoveryQuery,
  DiscoveryResult,
  FacetCounts,
  SortOption,
} from "./types"
import { Finish } from "@modules/common/components/wheel"
import { lit } from "./escape"

// Re-export so any existing imports from this file keep working.
export { parseQueryFromSearchParams } from "./types"

const FACET_FIELDS = ["brand", "diameters", "bolt_patterns", "finish"] as const

const NEW_DAYS = 30
const NEW_MS = NEW_DAYS * 24 * 60 * 60 * 1000

/**
 * Build the array of filter clauses for a set of DiscoveryFilters, optionally
 * skipping one dimension (used for disjunctive facet counting) and always
 * scoping to wheels + any vehicle constraint.
 */
function buildFilters(
  f: DiscoveryFilters,
  q: DiscoveryQuery,
  skip?: keyof DiscoveryFilters
): string[] {
  const clauses: string[] = ['product_type = "wheel"']

  if (skip !== "brands" && f.brands.length)
    clauses.push(`brand IN [${f.brands.map(lit).join(", ")}]`)
  if (skip !== "diameters" && f.diameters.length)
    clauses.push(`diameters IN [${f.diameters.map(lit).join(", ")}]`)
  if (skip !== "boltPatterns" && f.boltPatterns.length)
    clauses.push(`bolt_patterns IN [${f.boltPatterns.map(lit).join(", ")}]`)
  if (skip !== "finishes" && f.finishes.length)
    clauses.push(`finish IN [${f.finishes.map(lit).join(", ")}]`)
  if (f.priceMinCents != null) clauses.push(`price_min >= ${f.priceMinCents}`)
  if (f.priceMaxCents != null) clauses.push(`price_min <= ${f.priceMaxCents}`)

  if (q.vehicleConstraint?.length) clauses.push(...q.vehicleConstraint)

  return clauses
}

function sortExpr(sort: SortOption): string[] {
  switch (sort) {
    case "price-asc":
      return ["price_min:asc"]
    case "price-desc":
      return ["price_min:desc"]
    case "newest":
      return ["created_at:desc"]
    case "name-asc":
      return ["title:asc"]
    case "relevance":
    default:
      return []
  }
}

type Hit = {
  id: string
  handle: string
  title: string
  brand: string
  finish: Finish
  thumbnail: string | null
  diameters: number[]
  widths: number[]
  bolt_patterns: string[]
  price_min: number
  price_max: number
  created_at: string | null
}

function hitToProduct(h: Hit): DiscoveryProduct {
  const createdMs = h.created_at ? Date.parse(h.created_at) : NaN
  return {
    id: h.id,
    handle: h.handle,
    name: h.title,
    brand: h.brand,
    priceCents: h.price_min,
    finish: (h.finish as Finish) ?? "black",
    diameter: h.diameters?.[0] ?? 0,
    width: h.widths?.[0] ?? 0,
    boltPattern: h.bolt_patterns?.[0] ?? "",
    categories: [], // Spec §5 G2: no backend source yet.
    isNew: Number.isFinite(createdMs) ? Date.now() - createdMs < NEW_MS : false,
  }
}

function emptyResult(pageSize: number): DiscoveryResult {
  return {
    products: [],
    totalCount: 0,
    pageSize,
    facets: {
      categories: {},
      brands: {},
      diameters: {},
      boltPatterns: {},
      finishes: {},
    },
  }
}

export async function getDiscoveryProducts(
  query: DiscoveryQuery
): Promise<DiscoveryResult> {
  const pageSize = DEFAULT_PAGE_SIZE
  const offset = (query.page - 1) * pageSize

  // One hits query + one facet query per dimension (disjunctive), batched.
  const facetQueryByDim: Record<string, keyof DiscoveryFilters> = {
    brand: "brands",
    diameters: "diameters",
    bolt_patterns: "boltPatterns",
    finish: "finishes",
  }

  try {
    const { results } = await meili.multiSearch({
      queries: [
        {
          indexUid: PRODUCTS_INDEX,
          q: query.q ?? "",
          filter: buildFilters(query.filters, query).join(" AND "),
          sort: sortExpr(query.sort),
          limit: pageSize,
          offset,
        },
        ...FACET_FIELDS.map((field) => ({
          indexUid: PRODUCTS_INDEX,
          q: query.q ?? "",
          filter: buildFilters(
            query.filters,
            query,
            facetQueryByDim[field]
          ).join(" AND "),
          facets: [field],
          limit: 0,
        })),
      ],
    })

    const [hitsRes, ...facetRes] = results as MultiSearchResult<Hit>[]
    // facetRes is in the same order as FACET_FIELDS.
    const facetByField: Record<string, Record<string, number>> = {}
    FACET_FIELDS.forEach((field, i) => {
      facetByField[field] = facetRes[i]?.facetDistribution?.[field] ?? {}
    })

    const facets: FacetCounts = {
      categories: {}, // Spec §5 G2: no backend source yet.
      brands: facetByField["brand"],
      diameters: facetByField["diameters"],
      boltPatterns: facetByField["bolt_patterns"],
      finishes: facetByField["finish"],
    }

    return {
      products: hitsRes.hits.map(hitToProduct),
      totalCount: hitsRes.estimatedTotalHits ?? hitsRes.hits.length,
      pageSize,
      facets,
    }
  } catch (e) {
    // Meilisearch unreachable / index missing → empty state, not a crash.
    console.error("[discovery] Meilisearch query failed:", e)
    return emptyResult(pageSize)
  }
}
