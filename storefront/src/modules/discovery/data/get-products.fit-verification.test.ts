// storefront/src/modules/discovery/data/get-products.fit-verification.test.ts
//
// WB-074 D4 review follow-up — per-variant fit verification must be
// MANDATORY, never skipped, even on a technically-SUCCESSFUL (non-throw)
// `sdk.store.product.list` response. T3 (commit d4fb09c) fixed the THROW
// path: a rejected product.list call now propagates past unstable_cache
// instead of degrading in place. This file covers the sibling non-throw
// over-claim the T3 report flagged as out of scope: a 200 OK whose
// `products` array is EMPTY (infra returned no bodies) or PARTIAL (some
// requested ids simply missing) used to leave `variantsById` empty or
// incomplete, and the old `!fetched || productHasFittingVariant(...)`
// filter passed every UNVERIFIED candidate through as "fits" — an
// over-claiming list that would then be cached for 60s by
// getDiscoveryProducts's unstable_cache wrapper (not exercised directly
// here; these tests call fetchDiscoveryProducts, mirroring
// get-products.cap.test.ts's style, since the bug lives in the filter
// logic itself, independent of caching).
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@lib/meilisearch", () => ({
  meili: { multiSearch: vi.fn() },
  PRODUCTS_INDEX: "products",
}))
vi.mock("@lib/config", () => ({
  sdk: { store: { product: { list: vi.fn() } } },
}))

import { meili } from "@lib/meilisearch"
import { sdk } from "@lib/config"
import { fetchDiscoveryProducts, type Hit } from "./get-products"
import { EMPTY_FILTERS, type DiscoveryQuery } from "./types"

const mockedMultiSearch = vi.mocked(meili.multiSearch)
const mockedProductList = vi.mocked(sdk.store.product.list)

function makeHit(id: string, boltPattern = "5x114.3"): Hit {
  return {
    id,
    handle: id,
    title: `Wheel ${id}`,
    brand: "BrandA",
    finishes: ["black"],
    thumbnail: null,
    diameters: [18],
    widths: [9],
    bolt_patterns: [boltPattern],
    bolt_patterns_canonical: [boltPattern],
    price_min: 10000,
    price_max: 10000,
    created_at: null,
  }
}

function mockCandidateSearch(hits: Hit[], estimatedTotalHits: number) {
  mockedMultiSearch.mockResolvedValueOnce({
    results: [
      {
        indexUid: "products",
        hits,
        estimatedTotalHits,
        processingTimeMs: 1,
        query: "",
        offset: 0,
        limit: 200,
      },
    ],
  } as any)
}

const fitQuery = (): DiscoveryQuery => ({
  filters: EMPTY_FILTERS,
  sort: "relevance",
  page: 1,
  vehicleFitment: { canonicalBoltPatterns: ["5x114.3"] },
})

beforeEach(() => {
  mockedMultiSearch.mockReset()
  mockedProductList.mockReset()
})

describe("fetchDiscoveryProducts fit-mode per-variant verification is mandatory (WB-074 D4 non-throw over-claim)", () => {
  it("successful-but-empty Store-API response excludes ALL candidates — honest empty, not the over-claiming list", async () => {
    const hits = [makeHit("p1"), makeHit("p2")]
    mockCandidateSearch(hits, 2)
    // 200 OK, no bodies — a degraded/partial infra response that RESOLVES
    // (does NOT throw). Pre-fix: variantsById={}, fetched=false, `!fetched
    // || ...` passed both p1 and p2 through unverified.
    mockedProductList.mockResolvedValueOnce({ products: [] } as any)

    const result = await fetchDiscoveryProducts(fitQuery())

    expect(result.products).toEqual([])
    expect(result.totalCount).toBe(0)
  })

  it("partial Store-API response excludes only the UNVERIFIED candidate, keeps the verified one", async () => {
    const hits = [makeHit("p1"), makeHit("p2")]
    mockCandidateSearch(hits, 2)
    // Only p1 comes back with a genuinely-fitting variant; p2 is silently
    // missing from a technically-successful response.
    mockedProductList.mockResolvedValueOnce({
      products: [
        { id: "p1", variants: [{ id: "v1", metadata: { bolt_pattern_raw: "5x114.3" } }] },
      ],
    } as any)

    const result = await fetchDiscoveryProducts(fitQuery())

    expect(result.products.map((p) => p.id)).toEqual(["p1"])
    expect(result.totalCount).toBe(1)
  })

  it("happy path: full response, real per-variant check still excludes a non-matching variant", async () => {
    const hits = [makeHit("p1", "5x114.3"), makeHit("p2", "5x120")]
    mockCandidateSearch(hits, 2)
    mockedProductList.mockResolvedValueOnce({
      products: [
        { id: "p1", variants: [{ id: "v1", metadata: { bolt_pattern_raw: "5x114.3" } }] },
        { id: "p2", variants: [{ id: "v2", metadata: { bolt_pattern_raw: "5x120" } }] },
      ],
    } as any)

    const result = await fetchDiscoveryProducts(fitQuery())

    expect(result.products.map((p) => p.id)).toEqual(["p1"])
  })
})
