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

  // WB-100 Task 3 — in_stock mirrors price: a global narrowing that is
  // NEVER skipped (the `skip` arg only ever excludes one array facet), so
  // it applies identically to the hits query and every per-dimension facet
  // query.
  it("adds `in_stock = true` when inStockOnly is true", () => {
    const c = buildTireFilters({ ...EMPTY_TIRE_FILTERS, inStockOnly: true })
    expect(c).toContain("in_stock = true")
  })

  it("omits in_stock when inStockOnly is undefined/false", () => {
    expect(buildTireFilters(EMPTY_TIRE_FILTERS).some((x) => x.startsWith("in_stock"))).toBe(false)
    expect(
      buildTireFilters({ ...EMPTY_TIRE_FILTERS, inStockOnly: false }).some((x) => x.startsWith("in_stock"))
    ).toBe(false)
  })

  it("still applies in_stock when a facet dimension is skipped", () => {
    const c = buildTireFilters(
      { ...EMPTY_TIRE_FILTERS, inStockOnly: true, brands: ["Falken"] },
      "brands"
    )
    expect(c).toContain("in_stock = true")
    expect(c.some((x) => x.startsWith("brand IN"))).toBe(false)
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

  // WB-100 Task 3 — tire twin of the wheel hitToProduct in_stock mapping.
  // Missing/undefined defaults to false (out of stock) — the safe default
  // before a full re-index backfills every doc.
  it("maps in_stock: true to inStock: true", () => {
    expect(
      hitToTireProduct({ id: "t3", handle: "h", title: "t", brand: "B", price_min: 0, in_stock: true } as any)
        .inStock
    ).toBe(true)
  })

  it("maps in_stock: false to inStock: false", () => {
    expect(
      hitToTireProduct({ id: "t4", handle: "h", title: "t", brand: "B", price_min: 0, in_stock: false } as any)
        .inStock
    ).toBe(false)
  })

  it("maps a missing in_stock field to inStock: false (safe default)", () => {
    expect(
      hitToTireProduct({ id: "t5", handle: "h", title: "t", brand: "B", price_min: 0 } as any).inStock
    ).toBe(false)
  })
})
