// storefront/src/modules/discovery/data/get-products.cap.test.ts
//
// WB-074 Task 2 — fit mode's 200-candidate cap (FIT_CANDIDATE_CAP) must not
// be laundered into a precise "N RESULTS" total. When Meili's real
// estimatedTotalHits for the candidate query exceeds the cap, the result
// must carry isCapped: true so the UI can show an honest "Top N matches —
// refine to narrow" instead of a deceptively exact count, and pagination
// must stay bounded to the candidates actually fetched — never a phantom
// page count derived from the uncapped estimate.
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
import { FIT_CANDIDATE_CAP, EMPTY_FILTERS, type DiscoveryQuery } from "./types"

const mockedMultiSearch = vi.mocked(meili.multiSearch)
const mockedProductList = vi.mocked(sdk.store.product.list)

function makeHit(id: string): Hit {
  return {
    id,
    handle: id,
    title: `Wheel ${id}`,
    brand: "BrandA",
    finishes: ["black"],
    thumbnail: null,
    diameters: [18],
    widths: [9],
    bolt_patterns: ["5x114.3"],
    bolt_patterns_canonical: ["5x114.3"],
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
        limit: FIT_CANDIDATE_CAP,
      },
    ],
  } as any)
}

const fitQuery = (page = 1): DiscoveryQuery => ({
  filters: EMPTY_FILTERS,
  sort: "relevance",
  page,
  vehicleFitment: { canonicalBoltPatterns: ["5x114.3"] },
})

beforeEach(() => {
  mockedMultiSearch.mockReset()
  mockedProductList.mockReset()
  // The per-variant fit re-check (Store API round-trip) fails => the code's
  // documented fallback keeps ALL candidates ("never empty a valid fit
  // result"). That makes `fitting === hits` deterministically, so these
  // tests are only exercising the cap signal, not the per-variant fit gate
  // (already covered by product-has-fitting-variant's own tests).
  mockedProductList.mockRejectedValue(new Error("network unavailable in test"))
})

describe("fit-mode isCapped (WB-074 D2)", () => {
  it("is false when estimatedTotalHits is within the cap", async () => {
    const hits = [makeHit("p1"), makeHit("p2"), makeHit("p3")]
    mockCandidateSearch(hits, 3)

    const result = await fetchDiscoveryProducts(fitQuery())

    expect(result.isCapped).toBe(false)
    expect(result.estimatedTotalHits).toBe(3)
  })

  it("is true when estimatedTotalHits exceeds the cap", async () => {
    const hits = Array.from({ length: FIT_CANDIDATE_CAP }, (_, i) => makeHit(`p${i}`))
    mockCandidateSearch(hits, 500)

    const result = await fetchDiscoveryProducts(fitQuery())

    expect(result.isCapped).toBe(true)
    expect(result.estimatedTotalHits).toBe(500)
  })

  it("is false exactly at the cap boundary (estimatedTotalHits === FIT_CANDIDATE_CAP)", async () => {
    const hits = Array.from({ length: FIT_CANDIDATE_CAP }, (_, i) => makeHit(`p${i}`))
    mockCandidateSearch(hits, FIT_CANDIDATE_CAP)

    const result = await fetchDiscoveryProducts(fitQuery())

    expect(result.isCapped).toBe(false)
  })

  it("when capped, totalCount is NOT presented as a precise smaller number — it stays bounded to the fetched/checked candidates, and isCapped signals the truncation", async () => {
    const hits = Array.from({ length: FIT_CANDIDATE_CAP }, (_, i) => makeHit(`p${i}`))
    mockCandidateSearch(hits, 500)

    const result = await fetchDiscoveryProducts(fitQuery())

    // totalCount reflects only what was fetched/checked (<= cap) — never the
    // uncapped Meili estimate of 500. Without isCapped, a caller could read
    // "totalCount: 200" as "there are exactly 200 matches" — that is the
    // deceptive shape this test guards against.
    expect(result.totalCount).toBeLessThanOrEqual(FIT_CANDIDATE_CAP)
    expect(result.totalCount).not.toBe(500)
    expect(result.isCapped).toBe(true)
  })

  it("bounds pagination to the loaded candidates, not the uncapped estimate", async () => {
    const hits = Array.from({ length: FIT_CANDIDATE_CAP }, (_, i) => makeHit(`p${i}`))
    mockCandidateSearch(hits, 500)

    const result = await fetchDiscoveryProducts(fitQuery())
    const totalPages = Math.ceil(result.totalCount / result.pageSize)

    // 500 real matches at this pageSize would paginate far past what fit
    // mode ever fetched. Bounded to the 200-candidate cap it must never
    // exceed ceil(200 / pageSize).
    expect(totalPages).toBeLessThanOrEqual(Math.ceil(FIT_CANDIDATE_CAP / result.pageSize))
  })

  it("non-fit mode is unaffected: isCapped is false regardless of estimatedTotalHits size", async () => {
    const hits = [makeHit("p1"), makeHit("p2")]
    // Non-fit branch issues 1 hits query + 1 facet query per FACET_FIELDS
    // dimension (batched multiSearch) — mock all of them.
    mockedMultiSearch.mockResolvedValueOnce({
      results: [
        {
          indexUid: "products",
          hits,
          estimatedTotalHits: 5000,
          processingTimeMs: 1,
          query: "",
          offset: 0,
          limit: 12,
        },
        { indexUid: "products", hits: [], facetDistribution: { brand: {} }, processingTimeMs: 1, query: "" },
        { indexUid: "products", hits: [], facetDistribution: { diameters: {} }, processingTimeMs: 1, query: "" },
        { indexUid: "products", hits: [], facetDistribution: { bolt_patterns: {} }, processingTimeMs: 1, query: "" },
        { indexUid: "products", hits: [], facetDistribution: { finishes: {} }, processingTimeMs: 1, query: "" },
      ],
    } as any)

    const result = await fetchDiscoveryProducts({
      filters: EMPTY_FILTERS,
      sort: "relevance",
      page: 1,
    })

    expect(result.isCapped).toBe(false)
    expect(result.totalCount).toBe(5000)
  })
})
