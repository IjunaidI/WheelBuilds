// storefront/src/modules/tire-discovery/data/get-tire-products.cap.test.ts
//
// WB-088 Task 4 (D7) — parity port of the wheel adapter's
// get-products.cap.test.ts. Tire fit mode's 200-candidate cap
// (FIT_CANDIDATE_CAP) must not be laundered into a precise "N RESULTS"
// total. When Meili's real estimatedTotalHits for the tire_sizes candidate
// query exceeds the cap, the result must carry isCapped: true so the UI can
// show an honest "Top N candidates — refine to narrow" instead of a
// deceptively exact count, and pagination must stay bounded to the
// candidates actually fetched — never a phantom page count derived from the
// uncapped estimate.
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@lib/meilisearch", () => ({
  meili: { multiSearch: vi.fn() },
  PRODUCTS_INDEX: "products",
}))

import { meili } from "@lib/meilisearch"
import { fetchTireDiscoveryProducts, type TireHit } from "./get-tire-products"
import { FIT_CANDIDATE_CAP, EMPTY_TIRE_FILTERS, type TireDiscoveryQuery } from "./types"

const mockedMultiSearch = vi.mocked(meili.multiSearch)

function makeHit(id: string): TireHit {
  return {
    id,
    handle: id,
    title: `Tire ${id}`,
    brand: "Falken",
    thumbnail: null,
    tire_sizes: ["305/45R22"],
    rim_diameters: [22],
    tire_type: "passenger",
    price_min: 20000,
    price_max: 20000,
    created_at: null,
  }
}

function mockCandidateSearch(hits: TireHit[], estimatedTotalHits: number) {
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

const fitQuery = (page = 1): TireDiscoveryQuery => ({
  filters: EMPTY_TIRE_FILTERS,
  sort: "relevance",
  page,
  vehicleOemTires: [{ size: "305/45R22", loadIndex: null, speedRating: null }],
})

beforeEach(() => {
  mockedMultiSearch.mockReset()
})

describe("fit-mode isCapped (WB-088 D7)", () => {
  it("is false when estimatedTotalHits is within the cap", async () => {
    const hits = [makeHit("t1"), makeHit("t2"), makeHit("t3")]
    mockCandidateSearch(hits, 3)

    const result = await fetchTireDiscoveryProducts(fitQuery())

    expect(result.isCapped).toBe(false)
    expect(result.estimatedTotalHits).toBe(3)
  })

  it("is true when estimatedTotalHits exceeds the cap", async () => {
    const hits = Array.from({ length: FIT_CANDIDATE_CAP }, (_, i) => makeHit(`t${i}`))
    mockCandidateSearch(hits, 500)

    const result = await fetchTireDiscoveryProducts(fitQuery())

    expect(result.isCapped).toBe(true)
    expect(result.estimatedTotalHits).toBe(500)
  })

  it("is false exactly at the cap boundary (estimatedTotalHits === FIT_CANDIDATE_CAP)", async () => {
    const hits = Array.from({ length: FIT_CANDIDATE_CAP }, (_, i) => makeHit(`t${i}`))
    mockCandidateSearch(hits, FIT_CANDIDATE_CAP)

    const result = await fetchTireDiscoveryProducts(fitQuery())

    expect(result.isCapped).toBe(false)
  })

  it("when capped, totalCount is NOT presented as a precise smaller number — it stays bounded to the fetched/checked candidates, and isCapped signals the truncation", async () => {
    const hits = Array.from({ length: FIT_CANDIDATE_CAP }, (_, i) => makeHit(`t${i}`))
    mockCandidateSearch(hits, 500)

    const result = await fetchTireDiscoveryProducts(fitQuery())

    // totalCount reflects only what was fetched/checked (<= cap) — never the
    // uncapped Meili estimate of 500. Without isCapped, a caller could read
    // "totalCount: 200" as "there are exactly 200 matches" — that is the
    // deceptive shape this test guards against.
    expect(result.totalCount).toBeLessThanOrEqual(FIT_CANDIDATE_CAP)
    expect(result.totalCount).not.toBe(500)
    expect(result.isCapped).toBe(true)
  })

  it("bounds pagination to the loaded candidates, not the uncapped estimate", async () => {
    const hits = Array.from({ length: FIT_CANDIDATE_CAP }, (_, i) => makeHit(`t${i}`))
    mockCandidateSearch(hits, 500)

    const result = await fetchTireDiscoveryProducts(fitQuery())
    const totalPages = Math.ceil(result.totalCount / result.pageSize)

    // 500 real matches at this pageSize would paginate far past what fit
    // mode ever fetched. Bounded to the 200-candidate cap it must never
    // exceed ceil(200 / pageSize).
    expect(totalPages).toBeLessThanOrEqual(Math.ceil(FIT_CANDIDATE_CAP / result.pageSize))
  })

  it("non-fit mode is unaffected: isCapped is false regardless of estimatedTotalHits size", async () => {
    const hits = [makeHit("t1"), makeHit("t2")]
    // Non-fit branch issues 1 hits query + 1 facet query per
    // TIRE_FACET_FIELDS dimension (batched multiSearch) — mock all of them.
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
        { indexUid: "products", hits: [], facetDistribution: { rim_diameters: {} }, processingTimeMs: 1, query: "" },
        { indexUid: "products", hits: [], facetDistribution: { tire_sizes: {} }, processingTimeMs: 1, query: "" },
        { indexUid: "products", hits: [], facetDistribution: { tire_type: {} }, processingTimeMs: 1, query: "" },
        { indexUid: "products", hits: [], facetDistribution: { speed_ratings: {} }, processingTimeMs: 1, query: "" },
        { indexUid: "products", hits: [], facetDistribution: { load_indexes: {} }, processingTimeMs: 1, query: "" },
      ],
    } as any)

    const result = await fetchTireDiscoveryProducts({
      filters: EMPTY_TIRE_FILTERS,
      sort: "relevance",
      page: 1,
    })

    expect(result.isCapped).toBe(false)
    expect(result.totalCount).toBe(5000)
  })
})
