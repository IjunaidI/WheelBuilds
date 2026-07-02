import { describe, it, expect } from "vitest"
import { parseTireQueryFromSearchParams, EMPTY_TIRE_FILTERS } from "../data/types"

describe("parseTireQueryFromSearchParams", () => {
  it("defaults to empty filters / relevance / page 1", () => {
    expect(parseTireQueryFromSearchParams(undefined)).toEqual({
      filters: EMPTY_TIRE_FILTERS, sort: "relevance", page: 1,
    })
  })
  it("parses CSV + repeated params, coercing numbers (finite only)", () => {
    const q = parseTireQueryFromSearchParams({
      brands: "Falken,BKT", rimDiameters: "22,20,x", sizes: "305/45R22",
      tireTypes: ["passenger", "light-truck"], speedRatings: "S,T",
      loadIndexes: "118,120", priceMin: "50", priceMax: "400", sort: "price-asc", page: "3",
    })
    expect(q.filters.brands).toEqual(["Falken", "BKT"])
    expect(q.filters.rimDiameters).toEqual([22, 20]) // "x" dropped (non-finite)
    expect(q.filters.sizes).toEqual(["305/45R22"])
    expect(q.filters.tireTypes).toEqual(["passenger", "light-truck"])
    expect(q.filters.speedRatings).toEqual(["S", "T"])
    expect(q.filters.loadIndexes).toEqual([118, 120])
    expect(q.filters.priceMinCents).toBe(50)
    expect(q.filters.priceMaxCents).toBe(400)
    expect(q.sort).toBe("price-asc")
    expect(q.page).toBe(3)
  })
  it("falls back to relevance for an unknown sort, floors page at 1", () => {
    const q = parseTireQueryFromSearchParams({ sort: "bogus", page: "-4" })
    expect(q.sort).toBe("relevance")
    expect(q.page).toBe(1)
  })
  it("reads free-text q", () => {
    expect(parseTireQueryFromSearchParams({ q: "wildpeak" }).q).toBe("wildpeak")
  })
})
