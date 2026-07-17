// storefront/src/modules/tire-discovery/__tests__/use-tire-query.test.ts
//
// Tire twin of discovery/data/use-discovery-query.test.ts (WB-087 D3) — the
// active `?q` search term was invisible/unclearable on the tire results page
// too; `isAnyFilterActive` never looked at `q`. Exercises the exported
// `hasActiveQueryOrFilter` the hook's `isAnyFilterActive` is built from.
import { describe, it, expect } from "vitest"
import { hasActiveQueryOrFilter } from "../use-tire-query"

const emptyFilters = {
  brands: [],
  rimDiameters: [],
  sizes: [],
  tireTypes: [],
  speedRatings: [],
  loadIndexes: [],
  priceMinCents: undefined,
  priceMaxCents: undefined,
} as any

describe("hasActiveQueryOrFilter — tires (WB-087 D3)", () => {
  it("q alone counts as an active query", () => {
    expect(hasActiveQueryOrFilter(emptyFilters, "nomad")).toBe(true)
    expect(hasActiveQueryOrFilter(emptyFilters, "")).toBe(false)
  })

  it("is true when a filter is active even with no q", () => {
    expect(
      hasActiveQueryOrFilter({ ...emptyFilters, brands: ["Petrol"] }, undefined)
    ).toBe(true)
  })

  it("is false when neither q nor filters are active", () => {
    expect(hasActiveQueryOrFilter(emptyFilters, undefined)).toBe(false)
  })

  it("treats a whitespace-only q as inactive", () => {
    expect(hasActiveQueryOrFilter(emptyFilters, "   ")).toBe(false)
  })

  // WB-100 Task 3 — tire twin: inStockOnly counts as an active filter.
  it("is true when inStockOnly is set even with no q", () => {
    expect(
      hasActiveQueryOrFilter({ ...emptyFilters, inStockOnly: true }, undefined)
    ).toBe(true)
  })
})
