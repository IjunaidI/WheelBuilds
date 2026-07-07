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
  FIT_CANDIDATE_CAP,
  SortOption,
} from "./types"
import { Finish } from "@modules/common/components/wheel"
import { lit } from "./escape"
import { unstable_cache } from "next/cache"
import { discoveryCacheKey } from "./cache-key"
import { sdk } from "@lib/config"
import { productHasFittingVariant } from "@lib/fitment/product-has-fitting-variant"

// Re-export so any existing imports from this file keep working.
export { parseQueryFromSearchParams } from "./types"

const FACET_FIELDS = ["brand", "diameters", "bolt_patterns", "finishes"] as const

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
    clauses.push(`finishes IN [${f.finishes.map(lit).join(", ")}]`)
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

export type Hit = {
  id: string
  handle: string
  title: string
  brand: string
  finishes: Finish[]
  thumbnail: string | null
  diameters: number[]
  widths: number[]
  bolt_patterns: string[]
  bolt_patterns_canonical: string[]
  price_min: number
  price_max: number
  created_at: string | null
}

export function hitToProduct(h: Hit): DiscoveryProduct {
  const createdMs = h.created_at ? Date.parse(h.created_at) : NaN
  return {
    id: h.id,
    handle: h.handle,
    name: h.title,
    brand: h.brand,
    priceCents: h.price_min,
    thumbnail: h.thumbnail ?? null,
    finishes: (h.finishes as Finish[]) ?? [],
    diameter: h.diameters?.[0] ?? 0,
    width: h.widths?.[0] ?? 0,
    boltPattern: h.bolt_patterns?.[0] ?? "",
    boltPatternsCanonical: h.bolt_patterns_canonical ?? [],
    isNew: Number.isFinite(createdMs) ? Date.now() - createdMs < NEW_MS : false,
  }
}

/**
 * Rebuild fit-mode facet counts from the RAW Meili hit arrays (WB-074 D1) —
 * not the `[0]`-collapsed `DiscoveryProduct.diameter`/`.boltPattern` fields,
 * which silently dropped a multi-diameter or multi-bolt-pattern wheel from
 * every value but its first. Every element of `diameters` / `bolt_patterns`
 * / `finishes` is tallied, so a hit with `diameters:[18,20]` now contributes
 * to both the 18 and 20 buckets. Mirrors the tire twin's
 * `facetsFromTireHits` (tire-discovery/data/get-tire-products.ts).
 *
 * NOT disjunctive (D3 deferred — see WB-074 Task 1 report for the full
 * analysis). The fit branch's single Meili candidate query already applies
 * EVERY active sidebar filter (`buildFilters(query.filters, query)`, no
 * `skip`), so by the time hits reach this function, any product excluded by
 * e.g. the diameter filter is already absent from the candidate list —
 * there is no in-memory way to recover "what would diameter=20 show if the
 * diameter filter weren't applied" from data we never fetched. Making this
 * genuinely disjunctive would need either N extra Meili round-trips (one
 * per dimension, still gated by the real per-variant fit check — violates
 * the "cheap, no extra round-trips" budget) or re-scoping the single
 * candidate query to the fit constraint only, which risks truncating the
 * sidebar-filtered set under the 200-candidate cap and silently
 * under-counting `totalCount`/pagination for the PRODUCT LIST — a worse bug
 * than an honest non-disjunctive facet count. So: counts here are complete
 * per-dimension (D1) but scoped "within your vehicle's fitment + your
 * other active filters" — selecting a value can still hide its own
 * siblings until D3 lands.
 * TODO(D3): true disjunctive fit-mode facets need a redesigned fetch (e.g.
 * a fit-only candidate query for facet purposes, separate from the
 * sidebar-filtered query that drives the product list + pagination).
 */
export function facetsFromHits(hits: Hit[]): FacetCounts {
  const tally = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1 }
  const brands: Record<string, number> = {}, diameters: Record<string, number> = {}
  const boltPatterns: Record<string, number> = {}, finishes: Record<string, number> = {}
  for (const h of hits) {
    if (h.brand) tally(brands, h.brand)
    for (const d of h.diameters ?? []) tally(diameters, String(d))
    for (const bp of h.bolt_patterns ?? []) tally(boltPatterns, bp)
    for (const f of h.finishes ?? []) tally(finishes, f)
  }
  return { brands, diameters, boltPatterns, finishes }
}

function emptyResult(pageSize: number): DiscoveryResult {
  return {
    products: [],
    totalCount: 0,
    pageSize,
    facets: {
      brands: {},
      diameters: {},
      boltPatterns: {},
      finishes: {},
    },
    isCapped: false,
  }
}

export async function fetchDiscoveryProducts(
  query: DiscoveryQuery
): Promise<DiscoveryResult> {
  const pageSize = DEFAULT_PAGE_SIZE
  const offset = (query.page - 1) * pageSize

  // FIT MODE: bolt-pattern-filtered candidates from Meili, then the REAL
  // per-variant check (same as the PDP) so a multi-pattern wheel whose matching
  // pattern is only offered in a non-fitting size is dropped. Bounded scan +
  // in-memory pagination.
  const vf = query.vehicleFitment
  if (vf?.canonicalBoltPatterns?.length) {
    const { results } = await meili.multiSearch({
      queries: [
        {
          indexUid: PRODUCTS_INDEX,
          q: query.q ?? "",
          filter: buildFilters(query.filters, query).join(" AND "),
          sort: sortExpr(query.sort),
          limit: FIT_CANDIDATE_CAP,
          offset: 0,
        },
      ],
    })
    const candidateRes = results[0] as MultiSearchResult<Hit>
    const hits = candidateRes.hits
    // Honest cap signal (WB-074 D2): Meili's real total for this candidate
    // query, independent of the `limit: FIT_CANDIDATE_CAP` we actually
    // fetched. When it exceeds the cap, some genuinely-fitting wheels may
    // sit past the window we scanned, so `totalCount` below (a count of the
    // capped candidates AFTER the real per-variant fit check) must not be
    // presented as a precise total — callers gate on `isCapped` first.
    // Deliberately NOT used to inflate `totalCount`/pagination — that would
    // trade an honest small count for phantom pages past what was fetched.
    const estimatedTotalHits = candidateRes.estimatedTotalHits
    const isCapped = (estimatedTotalHits ?? 0) > FIT_CANDIDATE_CAP
    const ids = hits.map((h) => h.id)

    // Fetch the candidates' real variants (metadata only — no price/region needed).
    let variantsById: Record<string, { metadata?: Record<string, unknown> | null }[]> = {}
    if (ids.length) {
      try {
        const { products } = await sdk.store.product.list(
          { id: ids, limit: ids.length, fields: "id,variants.id,variants.metadata" } as any,
          { next: { revalidate: 60 } } as any
        )
        for (const p of products as any[]) variantsById[p.id] = p.variants ?? []
      } catch (e) {
        console.error("[discovery] variant fetch for fit filter failed:", e)
        variantsById = {} // degrade to coarse (bolt-pattern) results below
      }
    }

    // If the fetch failed entirely, fall back to the coarse candidates (never empty a valid fit result).
    const fetched = Object.keys(variantsById).length > 0
    const candidates = hits.map((hit) => ({ hit, product: hitToProduct(hit) }))
    const fitting = candidates.filter(
      ({ product }) => !fetched || productHasFittingVariant(variantsById[product.id], vf)
    )

    const start = (query.page - 1) * pageSize
    return {
      products: fitting.slice(start, start + pageSize).map((c) => c.product),
      totalCount: fitting.length,
      pageSize,
      facets: facetsFromHits(fitting.map((c) => c.hit)),
      isCapped,
      estimatedTotalHits,
    }
  }

  // One hits query + one facet query per dimension (disjunctive), batched.
  const facetQueryByDim: Record<string, keyof DiscoveryFilters> = {
    brand: "brands",
    diameters: "diameters",
    bolt_patterns: "boltPatterns",
    finishes: "finishes",
  }

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
    brands: facetByField["brand"],
    diameters: facetByField["diameters"],
    boltPatterns: facetByField["bolt_patterns"],
    finishes: facetByField["finishes"],
  }

  return {
    products: hitsRes.hits.map(hitToProduct),
    totalCount: hitsRes.estimatedTotalHits ?? hitsRes.hits.length,
    pageSize,
    facets,
    // Non-fit mode has no candidate cap — totalCount is Meili's real total,
    // so it is never "capped" in the D2 sense. (WB-074 D2)
    isCapped: false,
  }
}

/**
 * Cached discovery read. Wraps the Meilisearch multiSearch in Next's
 * unstable_cache (60s TTL, tag "discovery") keyed by the effective query, so
 * repeated discovery/home loads within the window don't re-hit Meili. On a
 * Meili failure the inner fn throws — unstable_cache does NOT cache a throw —
 * and we degrade to an empty result here (never cached, so it self-heals on the
 * next request once Meili recovers). A future re-sync can revalidateTag("discovery").
 */
export async function getDiscoveryProducts(
  query: DiscoveryQuery
): Promise<DiscoveryResult> {
  try {
    const cached = unstable_cache(
      () => fetchDiscoveryProducts(query),
      ["discovery", discoveryCacheKey(query)],
      { revalidate: 60, tags: ["discovery"] }
    )
    return await cached()
  } catch (e) {
    console.error("[discovery] Meilisearch query failed:", e)
    return emptyResult(DEFAULT_PAGE_SIZE)
  }
}
