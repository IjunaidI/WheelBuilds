import { parseCacheKey } from "../wheel-size-warm"

describe("parseCacheKey (WB-008 warm cron, WB-072 B3)", () => {
  it("routes a 4-digit year to year (new 5-part format: make|model|year|modificationSlug|region)", () => {
    expect(parseCacheKey("honda|accord|2021||usdm")).toEqual({ make: "honda", model: "accord", year: "2021", region: "usdm" })
  })
  it("routes a trim slug to modificationSlug (year slot empty)", () => {
    expect(parseCacheKey("audi|a3||eu-trim-836bce|usdm")).toEqual({ make: "audi", model: "a3", modificationSlug: "eu-trim-836bce", region: "usdm" })
  })
  it("treats empty slots as no year/modificationSlug", () => {
    expect(parseCacheKey("a|b|||usdm")).toEqual({ make: "a", model: "b", region: "usdm" })
  })
  it("returns null for a malformed key (<5 parts)", () => {
    expect(parseCacheKey("a|b|c")).toBeNull()
  })
})
