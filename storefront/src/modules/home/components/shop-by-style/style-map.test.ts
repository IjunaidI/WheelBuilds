import { describe, it, expect } from "vitest"
import { styleTiles } from "./style-map"
import type { FacetCounts } from "@modules/discovery/data/types"

const facets: FacetCounts = {
  brands: { "Black Rhino Hard Alloys": 90, "Black Rhino Hard Alloys - UTV": 15 },
  diameters: { "15": 2, "17": 4, "18": 1, "19": 2, "20": 3, "22": 5, "24": 1 },
  boltPatterns: {},
  finishes: { silver: 7, black: 100 },
}

// WB-120 Q-12: the cases below (no `counts` argument) now exercise the
// FALLBACK path — bucket summing, kept only so a Meilisearch outage degrades
// to an inaccurate count rather than a blank homepage. The accurate path is
// covered in the "distinct counts" block at the bottom of this file.
describe("styleTiles (fallback: summed facet buckets)", () => {
  it("sums diameter facets for STREET and builds a CSV href", () => {
    const street = styleTiles(facets).find((t) => t.label === "STREET")
    expect(street).toBeDefined()
    expect(street!.count).toBe(6) // 1 + 2 + 3
    expect(street!.href).toBe("/store?diameters=18,19,20")
  })

  it("reads a single finish facet for LUXURY", () => {
    const luxury = styleTiles(facets).find((t) => t.label === "LUXURY")
    expect(luxury!.count).toBe(7)
    expect(luxury!.href).toBe("/store?finishes=silver")
  })

  it("URL-encodes brand values for UTV", () => {
    const utv = styleTiles(facets).find((t) => t.label === "UTV")
    expect(utv!.count).toBe(15)
    expect(utv!.href).toBe("/store?brands=Black%20Rhino%20Hard%20Alloys%20-%20UTV")
  })

  it("drops tiles whose count is zero", () => {
    const empty: FacetCounts = {
      brands: {}, diameters: {}, boltPatterns: {}, finishes: {},
    }
    expect(styleTiles(empty)).toHaveLength(0)
  })
})

// WB-120 Q-12 — the tile counts over-claimed by up to 30%.
//
// `diameters`/`finishes`/`brands` are MULTI-VALUED on the indexed document, so
// summing their facet buckets counts a wheel offered in both 18" and 20"
// twice. Measured live 2026-07-29: STREET claimed 1550 against a listing of
// 1076; TRUCK & DUALLY 733 vs 490; DRAG 653 vs 593. Luxury, Off-road and UTV
// matched — and those are exactly the three SINGLE-value presets, where
// summing and distinct-counting coincide. That is what makes the diagnosis
// conclusive rather than merely plausible.
describe("styleTiles (distinct counts)", () => {
  const live: FacetCounts = {
    brands: { "Black Rhino Hard Alloys": 115, "Black Rhino Hard Alloys - UTV": 7 },
    diameters: {
      "15": 153, "17": 500, "18": 487, "19": 187,
      "20": 876, "22": 449, "24": 203, "26": 81,
    },
    boltPatterns: {},
    finishes: { silver: 602 },
  }
  const find = (counts?: Record<string, number>, label = "STREET") =>
    styleTiles(live, counts).find((t) => t.label === label)

  it("uses the supplied distinct count instead of summing buckets", () => {
    expect(find({ STREET: 1076 })?.count).toBe(1076)
    // 487 + 187 + 876 = 1550 — the number the live tile actually showed.
    expect(find({ STREET: 1076 })?.count).not.toBe(1550)
  })

  it("reproduces the exact live discrepancy on the fallback path", () => {
    expect(find()?.count).toBe(1550)
    expect(find(undefined, "TRUCK & DUALLY")?.count).toBe(733)
    expect(find(undefined, "DRAG")?.count).toBe(653)
  })

  it("agrees with the summed count for a single-value preset", () => {
    // LUXURY pins one finish, so both methods coincide — which is why it was
    // one of the three styles that never disagreed.
    expect(find(undefined, "LUXURY")?.count).toBe(602)
    expect(find({ LUXURY: 602 }, "LUXURY")?.count).toBe(602)
  })

  it("drops a style whose distinct count is zero", () => {
    expect(find({ STREET: 0 })).toBeUndefined()
  })

  it("keeps the href untouched — only the count changes", () => {
    expect(find({ STREET: 1076 })?.href).toBe("/store?diameters=18,19,20")
  })
})
