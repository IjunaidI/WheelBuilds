import { parseCacheKey, isV2CacheKey, filterWarmableRows } from "../wheel-size-warm"

describe("warm skips orphaned v1 rows (WB-077 I3)", () => {
  it("isV2CacheKey: true only when the key carries the trailing |v2 slot", () => {
    expect(isV2CacheKey("bmw|3-series|2020||usdm|v2")).toBe(true)
    expect(isV2CacheKey("bmw|3-series|2020||usdm")).toBe(false) // legacy 5-slot v1
    expect(isV2CacheKey("a|b|c")).toBe(false)
  })
  it("filterWarmableRows: keeps v2-keyed rows, drops orphaned v1 rows so they stop consuming the nightly warm budget", () => {
    const rows = [
      { cache_key: "bmw|3-series|2020||usdm", fetched_at: null },   // v1 → dropped
      { cache_key: "audi|a3|2019||usdm|v2", fetched_at: null },     // v2 → kept
      { cache_key: "honda|accord|2021||usdm|v2", fetched_at: null },// v2 → kept
    ]
    expect(filterWarmableRows(rows).map((r) => r.cache_key)).toEqual([
      "audi|a3|2019||usdm|v2",
      "honda|accord|2021||usdm|v2",
    ])
  })
})

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
  it("parses a v2 6-slot key", () => {
    expect(parseCacheKey("bmw|3-series|2020||usdm|v2"))
      .toEqual({ make: "bmw", model: "3-series", year: "2020", modificationSlug: undefined, region: "usdm" })
  })
  it("still parses a legacy 5-slot key (no version)", () => {
    expect(parseCacheKey("bmw|3-series|2020||usdm"))
      .toEqual({ make: "bmw", model: "3-series", year: "2020", modificationSlug: undefined, region: "usdm" })
  })
})
