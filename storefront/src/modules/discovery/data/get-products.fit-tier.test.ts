// storefront/src/modules/discovery/data/get-products.fit-tier.test.ts
//
// WB-077 D1 — fit mode keeps BOTH "fits" and "check" tier products (drops
// only "no"), sorts "fits" first, and threads each product's tier onto
// DiscoveryProduct.fitTier so the card can badge FITS vs CHECK FIT. Sibling
// coverage: get-products.fit-verification.test.ts (mandatory per-variant
// verification), get-products.cap.test.ts (isCapped/totalCount semantics —
// unchanged by this task).
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
        limit: 200,
      },
    ],
  } as any)
}

// Vehicle with a real size window so a variant can land in "check" (bolt +
// bore clear, diameter out of window) vs "fits" (everything in window).
const vehicle = {
  canonicalBoltPatterns: ["5x114.3"],
  hubBoreMm: null,
  diameterWindow: { min: 19, max: 20 },
  widthWindow: null,
  offsetWindow: null,
}

const fitQuery = (): DiscoveryQuery => ({
  filters: EMPTY_FILTERS,
  sort: "relevance",
  page: 1,
  vehicleFitment: vehicle,
})

beforeEach(() => {
  mockedMultiSearch.mockReset()
  mockedProductList.mockReset()
})

describe("fetchDiscoveryProducts fit-mode D1 (keep check-tier, sort fits first, thread fitTier)", () => {
  it("keeps a check-tier product (bolt+bore clear, size window missed) alongside a fits-tier one", async () => {
    const hits = [makeHit("p-check"), makeHit("p-fits")]
    mockCandidateSearch(hits, 2)
    mockedProductList.mockResolvedValueOnce({
      products: [
        // p-check: bolt matches, diameter (17) is OUTSIDE the 19-20 window -> "check"
        {
          id: "p-check",
          variants: [{ id: "v1", metadata: { bolt_pattern_raw: "5x114.3", wheel_diameter_in: 17 } }],
        },
        // p-fits: bolt matches, diameter (20) is INSIDE the window -> "fits"
        {
          id: "p-fits",
          variants: [{ id: "v2", metadata: { bolt_pattern_raw: "5x114.3", wheel_diameter_in: 20 } }],
        },
      ],
    } as any)

    const result = await fetchDiscoveryProducts(fitQuery())

    // Both survive — D1 does not drop "check".
    expect(result.products.map((p) => p.id).sort()).toEqual(["p-check", "p-fits"])
    // totalCount counts every surviving (fits + check) candidate.
    expect(result.totalCount).toBe(2)
  })

  it("sorts fits-tier products before check-tier products", async () => {
    // Candidate order from Meili is check-first; the post-sort must flip it.
    const hits = [makeHit("p-check"), makeHit("p-fits")]
    mockCandidateSearch(hits, 2)
    mockedProductList.mockResolvedValueOnce({
      products: [
        { id: "p-check", variants: [{ id: "v1", metadata: { bolt_pattern_raw: "5x114.3", wheel_diameter_in: 17 } }] },
        { id: "p-fits", variants: [{ id: "v2", metadata: { bolt_pattern_raw: "5x114.3", wheel_diameter_in: 20 } }] },
      ],
    } as any)

    const result = await fetchDiscoveryProducts(fitQuery())

    expect(result.products.map((p) => p.id)).toEqual(["p-fits", "p-check"])
  })

  it("threads the per-product tier onto DiscoveryProduct.fitTier", async () => {
    const hits = [makeHit("p-check"), makeHit("p-fits")]
    mockCandidateSearch(hits, 2)
    mockedProductList.mockResolvedValueOnce({
      products: [
        { id: "p-check", variants: [{ id: "v1", metadata: { bolt_pattern_raw: "5x114.3", wheel_diameter_in: 17 } }] },
        { id: "p-fits", variants: [{ id: "v2", metadata: { bolt_pattern_raw: "5x114.3", wheel_diameter_in: 20 } }] },
      ],
    } as any)

    const result = await fetchDiscoveryProducts(fitQuery())

    const byId = Object.fromEntries(result.products.map((p) => [p.id, p.fitTier]))
    expect(byId["p-fits"]).toBe("fits")
    expect(byId["p-check"]).toBe("check")
  })

  it("still drops a true 'no' (bolt mismatch) candidate entirely", async () => {
    const hits = [makeHit("p-no"), makeHit("p-fits")]
    mockCandidateSearch(hits, 2)
    mockedProductList.mockResolvedValueOnce({
      products: [
        { id: "p-no", variants: [{ id: "v1", metadata: { bolt_pattern_raw: "5x120", wheel_diameter_in: 20 } }] },
        { id: "p-fits", variants: [{ id: "v2", metadata: { bolt_pattern_raw: "5x114.3", wheel_diameter_in: 20 } }] },
      ],
    } as any)

    const result = await fetchDiscoveryProducts(fitQuery())

    expect(result.products.map((p) => p.id)).toEqual(["p-fits"])
    expect(result.totalCount).toBe(1)
  })
})
