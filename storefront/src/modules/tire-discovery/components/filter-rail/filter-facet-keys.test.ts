// storefront/src/modules/tire-discovery/components/filter-rail/filter-facet-keys.test.ts
//
// WB-088 D9 — unit tests for the tire "Size" filter-as-you-type substring
// matcher. See filter-facet-keys.ts for why this facet specifically needs
// it (high cardinality, uncapped now that maxValuesPerFacet is 500).
import { describe, it, expect } from "vitest"
import { filterFacetKeys } from "./filter-facet-keys"

const SIZES = ["225/45R17", "225/50R17", "235/45R18", "LT265/70R17"]

describe("filterFacetKeys (WB-088 D9)", () => {
  it("returns all keys unchanged when the query is blank", () => {
    expect(filterFacetKeys(SIZES, "")).toEqual(SIZES)
  })

  it("returns all keys unchanged when the query is whitespace only", () => {
    expect(filterFacetKeys(SIZES, "   ")).toEqual(SIZES)
  })

  it("filters by case-insensitive substring", () => {
    expect(filterFacetKeys(SIZES, "R17")).toEqual([
      "225/45R17",
      "225/50R17",
      "LT265/70R17",
    ])
  })

  it("matches lowercase query against mixed-case keys", () => {
    expect(filterFacetKeys(SIZES, "lt265")).toEqual(["LT265/70R17"])
  })

  it("matches a partial size fragment anywhere in the string", () => {
    expect(filterFacetKeys(SIZES, "225/45")).toEqual(["225/45R17"])
  })

  it("returns an empty array when nothing matches", () => {
    expect(filterFacetKeys(SIZES, "999")).toEqual([])
  })

  it("preserves the original order of matches", () => {
    expect(filterFacetKeys(SIZES, "17")).toEqual([
      "225/45R17",
      "225/50R17",
      "LT265/70R17",
    ])
  })

  it("returns an empty array unchanged when given an empty key list", () => {
    expect(filterFacetKeys([], "17")).toEqual([])
  })
})
