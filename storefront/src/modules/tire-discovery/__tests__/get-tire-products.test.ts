import { describe, it, expect } from "vitest"
import { buildTireFilters, hitToTireProduct } from "../data/get-tire-products"
import { EMPTY_TIRE_FILTERS } from "../data/types"

describe("buildTireFilters", () => {
  it("always scopes to product_type = tire", () => {
    expect(buildTireFilters(EMPTY_TIRE_FILTERS)).toContain('product_type = "tire"')
  })
  it("adds a clause per selected facet", () => {
    const c = buildTireFilters({
      ...EMPTY_TIRE_FILTERS, brands: ["Falken"], rimDiameters: [22],
      tireTypes: ["passenger"], speedRatings: ["S"], loadIndexes: [118], sizes: ["305/45R22"],
    })
    expect(c.some((x) => x.startsWith("brand IN"))).toBe(true)
    expect(c.some((x) => x.startsWith("rim_diameters IN"))).toBe(true)
    expect(c.some((x) => x.startsWith("tire_sizes IN"))).toBe(true)
    expect(c.some((x) => x.startsWith("tire_type IN"))).toBe(true)
    expect(c.some((x) => x.startsWith("speed_ratings IN"))).toBe(true)
    expect(c.some((x) => x.startsWith("load_indexes IN"))).toBe(true)
  })
  it("omits the skipped dimension (disjunctive facets)", () => {
    const c = buildTireFilters({ ...EMPTY_TIRE_FILTERS, brands: ["Falken"], rimDiameters: [22] }, "rimDiameters")
    expect(c.some((x) => x.startsWith("rim_diameters IN"))).toBe(false)
    expect(c.some((x) => x.startsWith("brand IN"))).toBe(true)
  })
  it("adds price clauses on price_min", () => {
    const c = buildTireFilters({ ...EMPTY_TIRE_FILTERS, priceMinCents: 5000, priceMaxCents: 40000 })
    expect(c).toContain("price_min >= 5000")
    expect(c).toContain("price_min <= 40000")
  })
})

describe("hitToTireProduct", () => {
  it("maps fields incl. sizeCount + sorted rimDiameters + priceCents", () => {
    const p = hitToTireProduct({
      id: "t1", handle: "falken-wildpeak-at4w", title: "Falken WDPEAK AT4W", brand: "Falken",
      thumbnail: "x.jpg", tire_sizes: ["305/45R22", "305/50R20", "LT37X12.50R18"],
      rim_diameters: [22, 18, 20], tire_type: "light-truck", price_min: 40500, price_max: 46200,
      created_at: null,
    } as any)
    expect(p).toMatchObject({
      id: "t1", handle: "falken-wildpeak-at4w", name: "Falken WDPEAK AT4W", brand: "Falken",
      priceCents: 40500, sizeCount: 3, rimDiameters: [18, 20, 22], tireType: "light-truck", thumbnail: "x.jpg",
    })
  })
  it("defaults missing arrays/thumbnail safely", () => {
    const p = hitToTireProduct({ id: "t2", handle: "h", title: "t", brand: "B", price_min: 0 } as any)
    expect(p.sizeCount).toBe(0)
    expect(p.rimDiameters).toEqual([])
    expect(p.thumbnail).toBeNull()
    expect(p.tireType).toBe("other")
  })
})
