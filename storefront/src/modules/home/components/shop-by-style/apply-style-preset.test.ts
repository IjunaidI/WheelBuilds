import { describe, it, expect } from "vitest"

import { EMPTY_FILTERS } from "@modules/discovery/data/types"
import type { DiscoveryFilters } from "@modules/discovery/data/types"

import { applyStylePreset } from "./apply-style-preset"
import { STYLE_DEFS } from "./style-map"

// One real STYLE_DEFS entry per StyleParam variant actually in use.
const streetDef = STYLE_DEFS.find((d) => d.label === "STREET")! // param: diameters
const luxuryDef = STYLE_DEFS.find((d) => d.label === "LUXURY")! // param: finishes
const utvDef = STYLE_DEFS.find((d) => d.label === "UTV")! // param: brands

describe("applyStylePreset", () => {
  describe("diameters preset (STREET)", () => {
    it("bare: fills an empty diameters dimension, coerced to number[]", () => {
      const filters: DiscoveryFilters = { ...EMPTY_FILTERS }
      const result = applyStylePreset(filters, streetDef)
      expect(result.diameters).toEqual([18, 19, 20])
      result.diameters.forEach((d) => expect(typeof d).toBe("number"))
    })

    it("refined: keeps the URL's non-empty diameters, preset NOT applied", () => {
      const filters: DiscoveryFilters = { ...EMPTY_FILTERS, diameters: [19] }
      const result = applyStylePreset(filters, streetDef)
      expect(result.diameters).toEqual([19])
    })
  })

  describe("finishes preset (LUXURY)", () => {
    it("bare: fills an empty finishes dimension, coerced to Finish[]", () => {
      const filters: DiscoveryFilters = { ...EMPTY_FILTERS }
      const result = applyStylePreset(filters, luxuryDef)
      expect(result.finishes).toEqual(["silver"])
    })

    it("refined: keeps the URL's non-empty finishes, preset NOT applied", () => {
      const filters: DiscoveryFilters = { ...EMPTY_FILTERS, finishes: ["black"] }
      const result = applyStylePreset(filters, luxuryDef)
      expect(result.finishes).toEqual(["black"])
    })
  })

  describe("brands preset (UTV)", () => {
    it("bare: fills an empty brands dimension with the preset", () => {
      const filters: DiscoveryFilters = { ...EMPTY_FILTERS }
      const result = applyStylePreset(filters, utvDef)
      expect(result.brands).toEqual(["Black Rhino Hard Alloys - UTV"])
    })

    it("refined: keeps the URL's non-empty brands, preset NOT applied", () => {
      const filters: DiscoveryFilters = { ...EMPTY_FILTERS, brands: ["Fuel"] }
      const result = applyStylePreset(filters, utvDef)
      expect(result.brands).toEqual(["Fuel"])
    })
  })

  it("passes every other dimension through untouched", () => {
    const filters: DiscoveryFilters = {
      ...EMPTY_FILTERS,
      boltPatterns: ["5x114.3"],
      priceMinCents: 10_000,
      priceMaxCents: 50_000,
    }
    const result = applyStylePreset(filters, streetDef)
    expect(result.boltPatterns).toEqual(["5x114.3"])
    expect(result.priceMinCents).toBe(10_000)
    expect(result.priceMaxCents).toBe(50_000)
    // The def's own dimension still got filled (bare case).
    expect(result.diameters).toEqual([18, 19, 20])
  })

  it("is pure: never mutates the input filters object", () => {
    const filters: DiscoveryFilters = { ...EMPTY_FILTERS }
    const result = applyStylePreset(filters, streetDef)
    expect(filters.diameters).toEqual([])
    expect(result).not.toBe(filters)
  })

  it("returns the same reference when the dimension is already non-empty", () => {
    const filters: DiscoveryFilters = { ...EMPTY_FILTERS, diameters: [19] }
    const result = applyStylePreset(filters, streetDef)
    expect(result).toBe(filters)
  })
})
