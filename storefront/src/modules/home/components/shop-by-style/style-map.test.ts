import { describe, it, expect } from "vitest"
import { styleTiles } from "./style-map"
import type { FacetCounts } from "@modules/discovery/data/types"

const facets: FacetCounts = {
  categories: {},
  brands: { "Black Rhino Hard Alloys": 90, "Black Rhino Hard Alloys - UTV": 15 },
  diameters: { "15": 2, "17": 4, "18": 1, "19": 2, "20": 3, "22": 5, "24": 1 },
  boltPatterns: {},
  finishes: { silver: 7, black: 100 },
}

describe("styleTiles", () => {
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
      categories: {}, brands: {}, diameters: {}, boltPatterns: {}, finishes: {},
    }
    expect(styleTiles(empty)).toHaveLength(0)
  })
})
