// storefront/src/modules/tire-discovery/data/get-tire-products.outage.test.ts
//
// WB-088 Task 3 (D6) — mirrors the wheel adapter's
// discovery/data/get-products.cache-contract.test.ts outage assertions.
// On a Meili failure, fetchTireDiscoveryProducts throws PAST
// unstable_cache (which never caches a throw), and
// getTireDiscoveryProducts's own catch degrades to a synthetic result now
// tagged `ok: false` so the tire template can render an honest "catalog
// temporarily unavailable" block instead of the 0-match empty state. A
// genuine 0-match result (Meili succeeds, 0 hits) must NOT carry that tag.
import { describe, it, expect, vi, beforeEach } from "vitest"

// Faithful-enough fake of Next's `unstable_cache`, mirroring the wheel
// adapter's cache-contract test: only a RESOLVED value is ever written — a
// rejection propagates uncaught and is never stored.
const cacheStore = new Map<string, unknown>()
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...args: any[]) => Promise<any>, keyParts: string[] = []) =>
    async (...args: any[]) => {
      const key = JSON.stringify(keyParts)
      if (cacheStore.has(key)) return cacheStore.get(key)
      const result = await fn(...args)
      cacheStore.set(key, result)
      return result
    },
}))

vi.mock("@lib/meilisearch", () => ({
  meili: { multiSearch: vi.fn() },
  PRODUCTS_INDEX: "products",
}))

import { meili } from "@lib/meilisearch"
import { getTireDiscoveryProducts } from "./get-tire-products"
import { EMPTY_TIRE_FILTERS, type TireDiscoveryQuery } from "./types"

const mockedMultiSearch = vi.mocked(meili.multiSearch)

const nonFitQuery: TireDiscoveryQuery = { filters: EMPTY_TIRE_FILTERS, sort: "relevance", page: 1 }

function mockNonFitSearch(hits: unknown[], estimatedTotalHits: number) {
  mockedMultiSearch.mockResolvedValueOnce({
    results: [
      {
        indexUid: "products",
        hits,
        estimatedTotalHits,
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
}

beforeEach(() => {
  mockedMultiSearch.mockReset()
  cacheStore.clear()
})

describe("getTireDiscoveryProducts outage discriminant (WB-088 D6)", () => {
  it("Meili failure degrades to ok: false and is NEVER cached", async () => {
    mockedMultiSearch.mockRejectedValue(new Error("meili down"))

    const first = await getTireDiscoveryProducts(nonFitQuery)
    const second = await getTireDiscoveryProducts(nonFitQuery)

    expect(first.ok).toBe(false)
    expect(first.products).toEqual([])
    expect(second.ok).toBe(false)
    // Two calls => two Meili round trips. If the failure had been cached,
    // the second call would short-circuit without re-hitting Meili.
    expect(mockedMultiSearch).toHaveBeenCalledTimes(2)
  })

  it("a genuine 0-match result (Meili succeeds, 0 hits) is NOT tagged ok: false", async () => {
    mockNonFitSearch([], 0)

    const result = await getTireDiscoveryProducts(nonFitQuery)

    expect(result.products).toEqual([])
    expect(result.ok).not.toBe(false)
  })

  it("Meili success IS cached across repeat calls (unaffected by the outage tag)", async () => {
    mockNonFitSearch(
      [
        {
          id: "t1", handle: "t1", title: "Tire 1", brand: "Falken",
          thumbnail: null, tire_sizes: ["305/45R22"], rim_diameters: [22],
          tire_type: "passenger", price_min: 20000, price_max: 20000, created_at: null,
        },
      ],
      1
    )

    const first = await getTireDiscoveryProducts(nonFitQuery)
    const second = await getTireDiscoveryProducts(nonFitQuery)

    expect(first.products.map((p) => p.id)).toEqual(["t1"])
    expect(second.products.map((p) => p.id)).toEqual(["t1"])
    expect(mockedMultiSearch).toHaveBeenCalledTimes(1)
  })
})
