import { describe, it, expect } from "vitest"
import { discoveryCacheKey } from "../cache-key"
import { EMPTY_FILTERS, type DiscoveryQuery } from "../types"

const base: DiscoveryQuery = { filters: EMPTY_FILTERS, sort: "relevance", page: 1 }

describe("discoveryCacheKey", () => {
  it("is identical for identical queries", () => {
    expect(discoveryCacheKey(base)).toBe(discoveryCacheKey({ ...base }))
  })

  it("is order-independent within a filter dimension", () => {
    const a: DiscoveryQuery = { ...base, filters: { ...EMPTY_FILTERS, brands: ["FUEL", "RBP"] } }
    const b: DiscoveryQuery = { ...base, filters: { ...EMPTY_FILTERS, brands: ["RBP", "FUEL"] } }
    expect(discoveryCacheKey(a)).toBe(discoveryCacheKey(b))
  })

  it("differs when the page differs", () => {
    expect(discoveryCacheKey(base)).not.toBe(discoveryCacheKey({ ...base, page: 2 }))
  })

  it("differs when a filter value differs", () => {
    const a: DiscoveryQuery = { ...base, filters: { ...EMPTY_FILTERS, brands: ["FUEL"] } }
    expect(discoveryCacheKey(base)).not.toBe(discoveryCacheKey(a))
  })

  it("differs when the free-text query differs", () => {
    expect(discoveryCacheKey(base)).not.toBe(discoveryCacheKey({ ...base, q: "matte" }))
  })
})
