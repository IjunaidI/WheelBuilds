import { describe, it, expect } from "vitest"
import { YEARS, slugifyYmm } from "./vehicle-data"

describe("YEARS", () => {
  it("includes 2026 and 2027 (N4: the static seed was stale, ending at 2025)", () => {
    expect(YEARS).toContain(2026)
    expect(YEARS).toContain(2027)
  })
  it("keeps the descending shape, newest year first", () => {
    expect(YEARS[0]).toBe(2027)
    for (let i = 1; i < YEARS.length; i++) {
      expect(YEARS[i]).toBe(YEARS[i - 1] - 1)
    }
  })
})

describe("slugifyYmm", () => {
  it("lowercases and joins words with a single dash", () => {
    expect(slugifyYmm("Silverado 1500")).toBe("silverado-1500")
    expect(slugifyYmm("X5 M")).toBe("x5-m")
    expect(slugifyYmm("3 Series")).toBe("3-series")
  })
  it("leaves an already-hyphenated slug-shaped value alone", () => {
    expect(slugifyYmm("F-150")).toBe("f-150")
  })
  it("trims leading/trailing dashes produced by punctuation", () => {
    expect(slugifyYmm("  Ford  ")).toBe("ford")
    expect(slugifyYmm("!!Grand Cherokee!!")).toBe("grand-cherokee")
  })
  it("collapses runs of non-alphanumeric characters into one dash", () => {
    expect(slugifyYmm("Land   Cruiser -- 1958")).toBe("land-cruiser-1958")
  })
})
