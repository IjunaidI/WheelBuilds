// storefront/src/modules/discovery/data/use-discovery-query.test.ts
//
// WB-087 D3 — the active `?q` search term was invisible and unclearable on
// the discovery results page: `isAnyFilterActive` never looked at `q`, so a
// query-only visit (no filters) rendered as if nothing was active. This
// exercises the exported `hasActiveQueryOrFilter` helper the hook's
// `isAnyFilterActive` is built from.
import { describe, it, expect } from "vitest"
import { hasActiveQueryOrFilter, clearAllTarget } from "./use-discovery-query"

describe("hasActiveQueryOrFilter (WB-087 D3)", () => {
  it("q alone counts as an active query (WB-087 D3)", () => {
    expect(
      hasActiveQueryOrFilter(
        {
          brands: [],
          diameters: [],
          boltPatterns: [],
          finishes: [],
          priceMinCents: null,
          priceMaxCents: null,
        } as any,
        "nomad"
      )
    ).toBe(true)
    expect(
      hasActiveQueryOrFilter(
        {
          brands: [],
          diameters: [],
          boltPatterns: [],
          finishes: [],
          priceMinCents: null,
          priceMaxCents: null,
        } as any,
        ""
      )
    ).toBe(false)
  })

  it("is true when a filter is active even with no q", () => {
    expect(
      hasActiveQueryOrFilter(
        {
          brands: ["Petrol"],
          diameters: [],
          boltPatterns: [],
          finishes: [],
          priceMinCents: null,
          priceMaxCents: null,
        } as any,
        undefined
      )
    ).toBe(true)
  })

  it("is false when neither q nor filters are active", () => {
    expect(
      hasActiveQueryOrFilter(
        {
          brands: [],
          diameters: [],
          boltPatterns: [],
          finishes: [],
          priceMinCents: null,
          priceMaxCents: null,
        } as any,
        undefined
      )
    ).toBe(false)
  })

  it("treats a whitespace-only q as inactive", () => {
    expect(
      hasActiveQueryOrFilter(
        {
          brands: [],
          diameters: [],
          boltPatterns: [],
          finishes: [],
          priceMinCents: null,
          priceMaxCents: null,
        } as any,
        "   "
      )
    ).toBe(false)
  })
})

// WB-099 Task 1 — `clearAll` used to hardcode `/${countryCode}/store`, so on
// a future pinned-filter page (e.g. `/brands/fuel`) "Clear all filters" would
// navigate AWAY to the unscoped `/store`, dropping the brand pin entirely.
// `clearAllTarget` is the pure decision `clearAll` now pushes to: the CURRENT
// base path (whatever page mounted the discovery rail), so clearing filters
// re-runs that same page's server-side pin instead of leaving it.
describe("clearAllTarget (WB-099)", () => {
  it("stays on a pinned brand page", () => {
    expect(clearAllTarget("/us/brands/fuel")).toBe("/us/brands/fuel")
  })

  it("stays on /store unchanged (no regression for the existing catalog page)", () => {
    expect(clearAllTarget("/us/store")).toBe("/us/store")
  })
})
