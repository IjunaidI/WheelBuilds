import { describe, it, expect } from "vitest"
import type { OemTire } from "@lib/garage/types"
import { tireDiscoveryCacheKey } from "../data/cache-key"
import { EMPTY_TIRE_FILTERS } from "../data/types"

const base = { filters: EMPTY_TIRE_FILTERS, sort: "relevance" as const, page: 1 }

describe("tireDiscoveryCacheKey", () => {
  it("is order-independent across filter arrays", () => {
    const a = tireDiscoveryCacheKey({ ...base, filters: { ...EMPTY_TIRE_FILTERS, brands: ["A", "B"] } })
    const b = tireDiscoveryCacheKey({ ...base, filters: { ...EMPTY_TIRE_FILTERS, brands: ["B", "A"] } })
    expect(a).toBe(b)
  })
  it("carries a tire discriminant so it can't collide with wheel keys", () => {
    expect(tireDiscoveryCacheKey(base)).toContain("tire")
  })
  it("differs when a filter changes", () => {
    const a = tireDiscoveryCacheKey(base)
    const b = tireDiscoveryCacheKey({ ...base, filters: { ...EMPTY_TIRE_FILTERS, tireTypes: ["passenger"] } })
    expect(a).not.toBe(b)
  })

  // WB-100 Task 3 — tire twin of the wheel cache-key test: without this,
  // `?in_stock=1` would collapse to the same cache key as the bare query.
  it("differs when inStockOnly differs", () => {
    const a = tireDiscoveryCacheKey(base)
    const b = tireDiscoveryCacheKey({ ...base, filters: { ...EMPTY_TIRE_FILTERS, inStockOnly: true } })
    expect(a).not.toBe(b)
  })

  describe("multi-axis vehicleOemTires (WB-068)", () => {
    const sameSizeHigherLoad: OemTire = { size: "305/45R22", loadIndex: 120, speedRating: "S" }
    const sameSizeLowerLoad: OemTire = { size: "305/45R22", loadIndex: 118, speedRating: "S" }

    it("is order-independent across vehicleOemTires", () => {
      const tires: OemTire[] = [
        { size: "225/55R18", loadIndex: 98, speedRating: "V" },
        { size: "255/35R19", loadIndex: null, speedRating: null },
      ]
      const a = tireDiscoveryCacheKey({ ...base, vehicleOemTires: tires })
      const b = tireDiscoveryCacheKey({ ...base, vehicleOemTires: [...tires].reverse() })
      expect(a).toBe(b)
    })

    it("differs for a same-size, different-load fit query (not just size-keyed)", () => {
      const a = tireDiscoveryCacheKey({ ...base, vehicleOemTires: [sameSizeHigherLoad] })
      const b = tireDiscoveryCacheKey({ ...base, vehicleOemTires: [sameSizeLowerLoad] })
      expect(a).not.toBe(b)
    })

    it("differs a multi-axis fit query from a size-only one for the same size", () => {
      const sizeOnly = tireDiscoveryCacheKey({
        ...base,
        vehicleOemTires: [{ size: "305/45R22", loadIndex: null, speedRating: null }],
      })
      const multiAxis = tireDiscoveryCacheKey({ ...base, vehicleOemTires: [sameSizeHigherLoad] })
      expect(sizeOnly).not.toBe(multiAxis)
    })

    it("no vehicleOemTires → empty fit/fitl/fits (unchanged from size-only baseline)", () => {
      expect(tireDiscoveryCacheKey(base)).toBe(tireDiscoveryCacheKey({ ...base, vehicleOemTires: [] }))
    })
  })
})
