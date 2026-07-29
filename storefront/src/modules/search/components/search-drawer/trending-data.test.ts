import { describe, it, expect } from "vitest"
import { toTrendingProducts } from "./trending-data"
import type { DiscoveryProduct } from "@modules/discovery/data/types"

function product(overrides: Partial<DiscoveryProduct> = {}): DiscoveryProduct {
  return {
    id: "p1",
    handle: "p1-handle",
    brand: "BrandA",
    name: "Wheel A",
    priceCents: 123456,
    thumbnail: null,
    finishes: ["bronze"],
    diameter: 20,
    width: 9,
    boltPattern: "5x120",
    boltPatternsCanonical: ["5x120"],
    ...overrides,
  } as DiscoveryProduct
}

describe("toTrendingProducts (WB-085 N3)", () => {
  it("maps the newest products down to the trending tile prop shape", () => {
    const out = toTrendingProducts([product()])
    expect(out).toEqual([
      {
        handle: "p1-handle",
        brand: "BrandA",
        name: "Wheel A",
        priceCents: 123456,
        finish: "bronze",
      },
    ])
  })

  it("caps to the requested count (default 3)", () => {
    const newest = Array.from({ length: 10 }, (_, i) =>
      product({ id: `p${i}`, handle: `h${i}` })
    )
    expect(toTrendingProducts(newest)).toHaveLength(3)
    expect(toTrendingProducts(newest, 5)).toHaveLength(5)
  })

  it("leaves finish undefined when the product has no finish", () => {
    const out = toTrendingProducts([product({ finishes: [] })])
    expect(out[0].finish).toBeUndefined()
  })

  it("returns an empty array for an empty catalog", () => {
    expect(toTrendingProducts([])).toEqual([])
  })
})

// WB-120 Q-03 — the drawer's Trending tiles pushed products that cannot be
// bought. The mapper took `newest.slice(0, 3)` and DROPPED
// DiscoveryProduct.inStock, so the tile could neither prefer in-stock items
// nor badge one that wasn't. The QA tester hit all three tiles out of stock.
//
// Note the /store and /tires "In stock only" toggles were NOT broken —
// measured live: 1447 -> 1138 wheels and 611 -> 399 tyres, with zero
// out-of-stock badges on either filtered page. Only the drawer lacked a gate.
describe("toTrendingProducts (WB-120 Q-03 — availability)", () => {
  const inStock = (i: number) =>
    product({ id: `in${i}`, handle: `in${i}`, inStock: true } as any)
  const outOfStock = (i: number) =>
    product({ id: `out${i}`, handle: `out${i}`, inStock: false } as any)

  it("carries inStock through to the tile", () => {
    expect(toTrendingProducts([inStock(1)])[0].inStock).toBe(true)
    expect(toTrendingProducts([outOfStock(1)])[0].inStock).toBe(false)
  })

  it("prefers in-stock products when choosing the three", () => {
    const newest = [outOfStock(1), outOfStock(2), inStock(1), outOfStock(3), inStock(2)]
    expect(toTrendingProducts(newest).map((p) => p.handle)).toEqual([
      "in1",
      "in2",
      "out1",
    ])
  })

  it("preserves newest-first order within each availability group", () => {
    const newest = [inStock(1), inStock(2), inStock(3)]
    expect(toTrendingProducts(newest).map((p) => p.handle)).toEqual([
      "in1",
      "in2",
      "in3",
    ])
  })

  it("still returns three when fewer than three are in stock", () => {
    // Deliberately NOT a hard filter: three badged tiles beat one tile.
    const newest = [outOfStock(1), inStock(1), outOfStock(2), outOfStock(3)]
    const out = toTrendingProducts(newest)
    expect(out).toHaveLength(3)
    expect(out[0].handle).toBe("in1")
  })

  it("treats an unknown availability as not-in-stock for ORDERING, but does not mark it false", () => {
    // hitToProduct defaults a missing in_stock to false, so `undefined` should
    // not normally occur — but the tile must not badge on an unknown value.
    const unknown = product({ id: "u1", handle: "u1" })
    const out = toTrendingProducts([unknown, inStock(1)])
    expect(out[0].handle).toBe("in1")
    expect(out.find((p) => p.handle === "u1")?.inStock).toBeUndefined()
  })
})
