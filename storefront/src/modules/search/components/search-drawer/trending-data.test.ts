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
