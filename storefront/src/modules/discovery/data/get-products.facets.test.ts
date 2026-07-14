// storefront/src/modules/discovery/data/get-products.facets.test.ts
//
// WB-074 Task 1 — fit-mode facet counts must tally from the raw Meili hit
// ARRAYS (every diameter/bolt-pattern/finish a product offers), not the
// `[0]`-collapsed DiscoveryProduct fields. See `facetsFromHits`'s docstring
// in get-products.ts for why this is D1-only (not disjunctive/D3) and why.
import { it, expect, describe } from "vitest"
import { facetsFromHits, hitToProduct, type Hit } from "./get-products"

function makeHit(overrides: Partial<Hit> = {}): Hit {
  return {
    id: "p1",
    handle: "p1",
    title: "Test Wheel",
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
    ...overrides,
  } as Hit
}

describe("facetsFromHits — D1 (tally every array element, not just [0])", () => {
  it("a multi-diameter, multi-bolt-pattern hit contributes to BOTH values of each dimension", () => {
    const hit = makeHit({
      id: "p1",
      diameters: [18, 20],
      // WB-088 D4: the bolt-pattern tally reads bolt_patterns_canonical, not
      // the raw bolt_patterns field — set both so this fixture still proves
      // "every array element", not just element [0].
      bolt_patterns: ["5x114.3", "5x120"],
      bolt_patterns_canonical: ["5x114.3", "5x120"],
      finishes: ["black", "silver"],
    })
    const facets = facetsFromHits([hit])

    expect(facets.diameters).toEqual({ "18": 1, "20": 1 })
    expect(facets.boltPatterns).toEqual({ "5x114.3": 1, "5x120": 1 })
    expect(facets.finishes).toEqual({ black: 1, silver: 1 })
  })

  it("regression: the OLD [0]-collapsed behavior would have dropped the second value — assert it does not", () => {
    const hit = makeHit({
      diameters: [18, 20],
      bolt_patterns: ["5x114.3", "5x120"],
      bolt_patterns_canonical: ["5x114.3", "5x120"],
    })
    const facets = facetsFromHits([hit])

    // The bug this fixes: hitToProduct(h).diameter / .boltPattern only ever
    // carries h.diameters[0] / h.bolt_patterns[0]. A facet tally built off
    // the collapsed DiscoveryProduct (the old `facetsFromProducts`) would
    // never see "20" or "5x120". Confirm facetsFromHits does.
    const collapsedProduct = hitToProduct(hit)
    expect(collapsedProduct.diameter).toBe(18) // still collapses for the card's single-value display field
    expect(facets.diameters["20"]).toBe(1) // but the facet tally does NOT collapse
    expect(facets.boltPatterns["5x120"]).toBe(1)
  })

  it("tallies across multiple hits, one count increment per hit per value", () => {
    const hits = [
      makeHit({ id: "p1", brand: "BrandA", diameters: [18, 20], finishes: ["black"] }),
      makeHit({ id: "p2", brand: "BrandA", diameters: [20], finishes: ["silver"] }),
      makeHit({ id: "p3", brand: "BrandB", diameters: [22], finishes: ["black", "silver"] }),
    ]
    const facets = facetsFromHits(hits)

    expect(facets.brands).toEqual({ BrandA: 2, BrandB: 1 })
    expect(facets.diameters).toEqual({ "18": 1, "20": 2, "22": 1 })
    expect(facets.finishes).toEqual({ black: 2, silver: 2 })
  })

  it("defaults missing/empty arrays safely (no crash, no bogus keys)", () => {
    const hit = makeHit({
      brand: "",
      diameters: undefined as unknown as number[],
      bolt_patterns: [],
      bolt_patterns_canonical: [],
      finishes: undefined as unknown as Hit["finishes"],
    })
    const facets = facetsFromHits([hit])

    expect(facets.brands).toEqual({})
    expect(facets.diameters).toEqual({})
    expect(facets.boltPatterns).toEqual({})
    expect(facets.finishes).toEqual({})
  })

  it("empty hit list returns empty facet maps for every dimension", () => {
    const facets = facetsFromHits([])
    expect(facets).toEqual({ brands: {}, diameters: {}, boltPatterns: {}, finishes: {} })
  })
})

// D3 (disjunctive fit-mode facets — selecting diameter=18 should still show
// the diameter=20 count) is NOT implemented in this pass. See the
// `facetsFromHits` docstring in get-products.ts and the Task 1 report for
// why: the fit branch's single Meili candidate query already applies EVERY
// active sidebar filter before hits ever reach this function, so there is
// no in-memory way to reconstruct "what would show if the diameter filter
// weren't applied" without either an extra per-dimension Meili round-trip
// or a candidate-fetch redesign that risks under-counting totalCount for
// the product list. TODO(D3) tracks the follow-up.
