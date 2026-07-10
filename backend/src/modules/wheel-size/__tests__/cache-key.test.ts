import { buildFitmentCacheKey } from "../cache-key"

describe("buildFitmentCacheKey", () => {
  it("keeps the year even when a trim slug is present (F-B1)", () => {
    const a = buildFitmentCacheKey({ make: "bmw", model: "3-series", year: "2018", modificationSlug: "330i", region: "usdm" })
    const b = buildFitmentCacheKey({ make: "bmw", model: "3-series", year: "2020", modificationSlug: "330i", region: "usdm" })
    expect(a).not.toBe(b) // same trim, different year -> distinct rows
  })
  it("is stable and includes all parts", () => {
    expect(buildFitmentCacheKey({ make: "bmw", model: "3-series", year: "2020", modificationSlug: "330i", region: "usdm" }))
      .toBe("bmw|3-series|2020|330i|usdm|v2")
  })
  it("tolerates a missing trim", () => {
    expect(buildFitmentCacheKey({ make: "bmw", model: "3-series", year: "2020", region: "usdm" }))
      .toBe("bmw|3-series|2020||usdm|v2")
  })
  it("appends a v2 version slot so v1 rows are orphaned", () => {
    expect(buildFitmentCacheKey({ make: "bmw", model: "3-series", year: "2020", modificationSlug: "330i", region: "usdm" }))
      .toBe("bmw|3-series|2020|330i|usdm|v2")
  })
})
