import { describe, it, expect } from "vitest"
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
})
