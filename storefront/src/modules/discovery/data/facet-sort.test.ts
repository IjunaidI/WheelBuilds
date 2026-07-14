// storefront/src/modules/discovery/data/facet-sort.test.ts
//
// WB-088 D10 — numeric facets (diameter, rim diameter, load index) must sort
// ascending by numeric value, not string-compare. The default (non-numeric)
// path stays count-desc-then-alpha, unchanged from the pre-fix behavior.
import { describe, it, expect } from "vitest"
import { sortFacetEntries } from "./facet-sort"

describe("sortFacetEntries (WB-088 D10)", () => {
  it("numeric: sorts ascending by Number(key), not string order", () => {
    // String order would put "10" before "9" — regression this guards.
    const facetMap = { "9": 1, "10": 5, "20": 2 }
    expect(sortFacetEntries(facetMap, true)).toEqual([
      ["9", 1],
      ["10", 5],
      ["20", 2],
    ])
  })

  it("numeric: ignores count entirely for ordering", () => {
    const facetMap = { "22": 1, "18": 99, "20": 5 }
    expect(sortFacetEntries(facetMap, true).map(([k]) => k)).toEqual([
      "18",
      "20",
      "22",
    ])
  })

  it("default (non-numeric): sorts by count desc, then key alpha on ties", () => {
    const facetMap = { Petrol: 2, Alloy: 5, Beadlock: 2 }
    expect(sortFacetEntries(facetMap)).toEqual([
      ["Alloy", 5],
      ["Beadlock", 2],
      ["Petrol", 2],
    ])
  })

  it("default: numeric-looking string keys still sort by count, not numeric value", () => {
    const facetMap = { "9": 5, "10": 1 }
    // "10" has more matches by string-compare tie logic here it's counts
    // that differ (5 vs 1), so "9" (count 5) sorts first even though "10"
    // would come first numerically.
    expect(sortFacetEntries(facetMap)).toEqual([
      ["9", 5],
      ["10", 1],
    ])
  })

  it("returns an empty array for an empty facet map", () => {
    expect(sortFacetEntries({})).toEqual([])
    expect(sortFacetEntries({}, true)).toEqual([])
  })
})
