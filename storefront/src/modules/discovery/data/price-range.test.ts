// storefront/src/modules/discovery/data/price-range.test.ts
//
// WB-088 D8 — commitPriceRange is the pure parse/clamp/swap step behind the
// price Min/Max inputs' commit-on-blur/Enter behavior (both discovery
// surfaces). Golden cases: negatives clamp to 0, min > max swaps, and blank
// input becomes undefined (clears the filter) rather than 0 or NaN.
import { describe, it, expect } from "vitest"
import { commitPriceRange } from "./price-range"

describe("commitPriceRange (WB-088 D8)", () => {
  it("passes through a valid, already-ordered range unchanged", () => {
    expect(commitPriceRange("100", "500")).toEqual({ min: 100, max: 500 })
  })

  it("clamps negative min to 0", () => {
    expect(commitPriceRange("-50", "500")).toEqual({ min: 0, max: 500 })
  })

  it("clamps negative max to 0, then swaps since clamped max < min", () => {
    // Clamp runs before swap: max "-1" clamps to 0, which is now < min
    // (100), so the pair swaps to keep the range non-inverted.
    expect(commitPriceRange("100", "-1")).toEqual({ min: 0, max: 100 })
  })

  it("swaps min and max when min > max", () => {
    expect(commitPriceRange("500", "100")).toEqual({ min: 100, max: 500 })
  })

  it("treats blank strings as undefined (clears the filter)", () => {
    expect(commitPriceRange("", "")).toEqual({ min: undefined, max: undefined })
  })

  it("treats a blank min with a valid max as an open-ended range", () => {
    expect(commitPriceRange("", "500")).toEqual({ min: undefined, max: 500 })
  })

  it("treats a blank max with a valid min as an open-ended range", () => {
    expect(commitPriceRange("100", "")).toEqual({ min: 100, max: undefined })
  })

  it("treats non-numeric input as undefined", () => {
    expect(commitPriceRange("abc", "xyz")).toEqual({
      min: undefined,
      max: undefined,
    })
  })

  it("does not swap when only one side is present", () => {
    expect(commitPriceRange("500", "")).toEqual({ min: 500, max: undefined })
    expect(commitPriceRange("", "100")).toEqual({ min: undefined, max: 100 })
  })

  it("passes through equal min and max without swapping", () => {
    expect(commitPriceRange("250", "250")).toEqual({ min: 250, max: 250 })
  })
})
