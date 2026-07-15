import { describe, it, expect } from "vitest"
import { orderFitSummary, type FitSummaryItem } from "./order-fit-summary"

// 2019 Porsche 911: 5x130, runs ~19-20in.
const porsche = {
  canonicalBoltPatterns: ["5x130"],
  hubBoreMm: 71.5,
  diameterWindow: { min: 19, max: 20 },
  widthWindow: { min: 8, max: 12 },
  offsetWindow: { min: 45, max: 75 },
}

const fittingItem: FitSummaryItem = {
  variant: {
    metadata: {
      bolt_pattern_raw: "5x130",
      wheel_diameter_in: 20,
      wheel_width_in: 9,
      offset_mm: 55,
      center_bore_mm: 71.6,
    },
  },
}

const checkTierItem: FitSummaryItem = {
  variant: {
    metadata: {
      bolt_pattern_raw: "5x130",
      wheel_diameter_in: 22, // out of window -> "check", not "fits"
      wheel_width_in: 9,
      offset_mm: 55,
      center_bore_mm: 71.6,
    },
  },
}

const nonFittingItem: FitSummaryItem = {
  variant: {
    metadata: {
      bolt_pattern_raw: "5x114.3", // wrong bolt pattern -> "no"
      wheel_diameter_in: 20,
      wheel_width_in: 9,
      offset_mm: 55,
      center_bore_mm: 71.6,
    },
  },
}

describe("orderFitSummary", () => {
  it("returns 'all' when every line fits (the guarantee claim is allowed)", () => {
    expect(orderFitSummary([fittingItem, fittingItem], porsche)).toBe("all")
  })

  it("returns 'partial' — NOT 'all' — when one line fits and another does not (C10: no blanket guarantee off a single fit)", () => {
    expect(orderFitSummary([fittingItem, nonFittingItem], porsche)).toBe(
      "partial"
    )
  })

  it("returns 'partial' when lines only reach 'check' tier, never 'fits'", () => {
    expect(orderFitSummary([checkTierItem, nonFittingItem], porsche)).toBe(
      "partial"
    )
  })

  it("returns 'none' when nothing on the order fits or check-fits", () => {
    expect(orderFitSummary([nonFittingItem, nonFittingItem], porsche)).toBe(
      "none"
    )
  })

  it("returns 'none' when there is no active vehicle", () => {
    expect(orderFitSummary([fittingItem], null)).toBe("none")
  })

  it("returns 'none' when there are no items", () => {
    expect(orderFitSummary([], porsche)).toBe("none")
    expect(orderFitSummary(undefined, porsche)).toBe("none")
  })
})
