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

  it("differs when vehicleFitment differs", () => {
    const withFitment: DiscoveryQuery = {
      ...base,
      vehicleFitment: {
        canonicalBoltPatterns: ["5x114.3"],
        hubBoreMm: 64.1,
        diameterWindow: { min: 17, max: 19 },
        widthWindow: { min: 7, max: 8.5 },
        offsetWindow: { min: 35, max: 45 },
      },
    }
    expect(discoveryCacheKey(base)).not.toBe(discoveryCacheKey(withFitment))
  })
})
