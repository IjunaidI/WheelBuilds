import { describe, it, expect } from "vitest"
import { variantFitsVehicle, productHasFittingVariant } from "../product-has-fitting-variant"

const v = (bolt: string, dia: number, width: number, offset: number, bore = 72) => ({
  metadata: {
    bolt_pattern_raw: bolt, wheel_diameter_in: dia, wheel_width_in: width, offset_mm: offset, center_bore_mm: bore,
  },
})

// 2019 Porsche 911: 5x130, runs ~19-20in.
const porsche = { canonicalBoltPatterns: ["5x130"], hubBoreMm: 71.5,
  diameterWindow: { min: 19, max: 20 }, widthWindow: { min: 8, max: 12 }, offsetWindow: { min: 45, max: 75 } }

describe("variantFitsVehicle", () => {
  it("fits when bolt pattern + bore + size all match", () => {
    expect(variantFitsVehicle({ boltPatternRaw: "5x130", diameterIn: 20, widthIn: 9, offsetMm: 55, centerBoreMm: 71.6 }, porsche)).toBe(true)
  })
  it("does not fit when the bolt pattern differs", () => {
    expect(variantFitsVehicle({ boltPatternRaw: "5x114.3", diameterIn: 20, widthIn: 9, offsetMm: 55 }, porsche)).toBe(false)
  })
  it("does not fit when the diameter is out of the window (right pattern, wrong size)", () => {
    expect(variantFitsVehicle({ boltPatternRaw: "5x130", diameterIn: 22, widthIn: 9, offsetMm: 55 }, porsche)).toBe(false)
  })
  it("does not fit when the bore is smaller than the hub", () => {
    expect(variantFitsVehicle({ boltPatternRaw: "5x130", diameterIn: 20, widthIn: 9, offsetMm: 55, centerBoreMm: 60 }, porsche)).toBe(false)
  })
})

describe("productHasFittingVariant", () => {
  it("EXCLUDES a multi-pattern wheel whose 5x130 variant is the wrong size (the reported bug)", () => {
    // Variant A: 5x130 but 22in (wrong size). Variant B: 19in but 5x114.3 (wrong pattern).
    // The coarse index sees "has 5x130" + "has 19in" and wrongly matches; the real
    // per-variant check sees no single variant that is BOTH 5x130 AND 19-20in.
    const wheel = [v("5x130", 22, 11, 50), v("5x114.3", 19, 8.5, 40)]
    expect(productHasFittingVariant(wheel, porsche)).toBe(false)
  })
  it("INCLUDES a wheel that has a genuinely-fitting 5x130 variant", () => {
    const wheel = [v("5x130", 20, 9, 55), v("5x114.3", 19, 8.5, 40)]
    expect(productHasFittingVariant(wheel, porsche)).toBe(true)
  })
  it("is false for a vehicle with no bolt-pattern data", () => {
    expect(productHasFittingVariant([v("5x130", 20, 9, 55)], { hubBoreMm: 71.5 })).toBe(false)
  })
})
