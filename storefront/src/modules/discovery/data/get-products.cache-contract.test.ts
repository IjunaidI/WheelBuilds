// storefront/src/modules/discovery/data/get-products.cache-contract.test.ts
//
// WB-074 Task 3 (D4) — cache contract for getDiscoveryProducts's
// unstable_cache wrapper. WB-021 established the precedent: on a Meili
// failure, fetchDiscoveryProducts throws PAST unstable_cache (which never
// caches a throw), and getDiscoveryProducts's own catch degrades to an
// empty, UNCACHED result so a transient blip self-heals on the next
// request. No standalone test previously locked that contract in — this
// file adds it, and extends the same contract to the fit-mode Store-API
// re-check (WB-074 D4).
//
// Before the D4 fix: a Store-API failure in the fit branch degraded IN
// PLACE (variantsById = {}, fetched = false), so `!fetched ||
// productHasFittingVariant(...)` passed EVERY bolt-pattern candidate
// unverified — an over-claiming "these fit" list — and because
// fetchDiscoveryProducts returned normally, unstable_cache CACHED that
// over-claim for 60s. The fix rethrows so the failure hits the same
// uncached-empty path as a Meili failure.
import { describe, it, expect, vi, beforeEach } from "vitest"

// Faithful-enough fake of Next's `unstable_cache`: a module-level store
// keyed by the keyParts array (JSON-stringified), persisting across
// separate `unstable_cache(...)` construction calls the way Next's real
// cache persists across requests/invocations. Only a RESOLVED value is
// ever written — a rejection propagates uncaught and is never stored —
// mirroring unstable_cache's real "does not cache a throw" contract.
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
vi.mock("@lib/config", () => ({
  sdk: { store: { product: { list: vi.fn() } } },
}))

import { meili } from "@lib/meilisearch"
import { sdk } from "@lib/config"
import { getDiscoveryProducts, type Hit } from "./get-products"
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

function mockNonFitSearch(hits: Hit[], estimatedTotalHits: number) {
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
      { indexUid: "products", hits: [], facetDistribution: { diameters: {} }, processingTimeMs: 1, query: "" },
      { indexUid: "products", hits: [], facetDistribution: { bolt_patterns: {} }, processingTimeMs: 1, query: "" },
      { indexUid: "products", hits: [], facetDistribution: { finishes: {} }, processingTimeMs: 1, query: "" },
    ],
  } as any)
}

const nonFitQuery: DiscoveryQuery = { filters: EMPTY_FILTERS, sort: "relevance", page: 1 }

const fitQuery = (): DiscoveryQuery => ({
  filters: EMPTY_FILTERS,
  sort: "relevance",
  page: 1,
  vehicleFitment: { canonicalBoltPatterns: ["5x114.3"] },
})

beforeEach(() => {
  mockedMultiSearch.mockReset()
  mockedProductList.mockReset()
  cacheStore.clear()
})

describe("getDiscoveryProducts cache contract (WB-021 + WB-074 D4)", () => {
  it("Meili failure degrades to an empty result and is NEVER cached", async () => {
    mockedMultiSearch.mockRejectedValue(new Error("meili down"))

    const first = await getDiscoveryProducts(nonFitQuery)
    const second = await getDiscoveryProducts(nonFitQuery)

    expect(first).toEqual(
      expect.objectContaining({ products: [], totalCount: 0, isCapped: false })
    )
    expect(second).toEqual(
      expect.objectContaining({ products: [], totalCount: 0, isCapped: false })
    )
    // Two getDiscoveryProducts calls => two Meili round trips. If the
    // failure had been cached, the second call would short-circuit without
    // re-hitting Meili.
    expect(mockedMultiSearch).toHaveBeenCalledTimes(2)
  })

  it("Meili success on the non-fit path IS cached across repeat calls", async () => {
    mockNonFitSearch([makeHit("p1")], 1)

    const first = await getDiscoveryProducts(nonFitQuery)
    const second = await getDiscoveryProducts(nonFitQuery)

    expect(first.products.map((p) => p.id)).toEqual(["p1"])
    expect(second.products.map((p) => p.id)).toEqual(["p1"])
    expect(mockedMultiSearch).toHaveBeenCalledTimes(1)
  })

  it("fit-mode Store-API failure does NOT return the coarse over-claiming list — degrades to empty, uncached (WB-074 D4)", async () => {
    const hits = [makeHit("p1", "5x114.3"), makeHit("p2", "5x114.3")]
    mockCandidateSearch(hits, 2)
    mockedProductList.mockRejectedValue(new Error("store api down"))

    const result = await getDiscoveryProducts(fitQuery())

    // Pre-fix: variantsById={} => fetched=false => `!fetched || ...` passes
    // BOTH p1 and p2 unverified (the over-claim this test guards against).
    // Post-fix: the catch rethrows, fetchDiscoveryProducts never returns
    // normally, and getDiscoveryProducts's own catch degrades to empty.
    expect(result.products).toEqual([])
    expect(result.totalCount).toBe(0)

    // Second call re-hits Meili AND the Store API — proves the failure (and
    // the coarse list it used to produce) was never written to the cache.
    mockCandidateSearch(hits, 2)
    const second = await getDiscoveryProducts(fitQuery())

    expect(second.products).toEqual([])
    expect(mockedMultiSearch).toHaveBeenCalledTimes(2)
    expect(mockedProductList).toHaveBeenCalledTimes(2)
  })

  it("fit-mode happy path: Store-API success still filters to genuinely-fitting variants, and IS cached on repeat calls", async () => {
    const hits = [makeHit("p1", "5x114.3"), makeHit("p2", "5x120")]
    mockCandidateSearch(hits, 2)
    mockedProductList.mockResolvedValueOnce({
      products: [
        { id: "p1", variants: [{ id: "v1", metadata: { bolt_pattern_raw: "5x114.3" } }] },
        { id: "p2", variants: [{ id: "v2", metadata: { bolt_pattern_raw: "5x120" } }] },
      ],
    } as any)

    const first = await getDiscoveryProducts(fitQuery())
    // Only p1 genuinely fits the vehicle's 5x114.3 pattern — p2's real
    // variant is 5x120, so the per-variant gate must exclude it even though
    // it was in the coarse candidate list.
    expect(first.products.map((p) => p.id)).toEqual(["p1"])

    const second = await getDiscoveryProducts(fitQuery())
    expect(second.products.map((p) => p.id)).toEqual(["p1"])

    // One round trip served both calls => the successful, correctly-filtered
    // result IS cached (only the failure path must bypass the cache).
    expect(mockedMultiSearch).toHaveBeenCalledTimes(1)
    expect(mockedProductList).toHaveBeenCalledTimes(1)
  })
})
