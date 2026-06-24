import { parseCacheKey } from "../wheel-size-warm"

describe("parseCacheKey (WB-008 warm cron)", () => {
  it("routes a 4-digit year middle slot to year (so by_model gets its required year)", () => {
    expect(parseCacheKey("honda|accord|2021|usdm")).toEqual({ make: "honda", model: "accord", year: "2021", region: "usdm" })
  })
  it("routes a trim slug middle slot to modificationSlug", () => {
    expect(parseCacheKey("audi|a3|eu-trim-836bce|usdm")).toEqual({ make: "audi", model: "a3", modificationSlug: "eu-trim-836bce", region: "usdm" })
  })
  it("treats an empty middle slot as no modificationSlug/year", () => {
    expect(parseCacheKey("a|b||usdm")).toEqual({ make: "a", model: "b", modificationSlug: undefined, region: "usdm" })
  })
  it("returns null for a malformed key (<4 parts)", () => {
    expect(parseCacheKey("a|b|c")).toBeNull()
  })
})
