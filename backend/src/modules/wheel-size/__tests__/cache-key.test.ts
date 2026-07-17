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

  // WB-113: the fitment cache now stores the raw by_model body and filters by
  // sub-model at read time (service.ts), so the service never feeds a
  // sub-model value into this key anymore — two different sub-model requests
  // for the same vehicle collapse onto the SAME row (one fetch serves both).
  it("WB-113: omitting the sub-model (as the fitment cache now always does) collapses distinct sub-model requests onto ONE key", () => {
    const forLE = buildFitmentCacheKey({ make: "toyota", model: "corolla", year: "2019", region: "usdm" })
    const forXSE = buildFitmentCacheKey({ make: "toyota", model: "corolla", year: "2019", region: "usdm" })
    expect(forLE).toBe(forXSE)
    expect(forLE).toBe("toyota|corolla|2019||usdm|v2") // the modificationSlug slot stays empty
  })
})
