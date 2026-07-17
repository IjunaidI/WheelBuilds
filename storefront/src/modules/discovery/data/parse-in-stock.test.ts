// storefront/src/modules/discovery/data/parse-in-stock.test.ts
//
// WB-100 Task 3 — parseQueryFromSearchParams reads `?in_stock=1` into
// DiscoveryFilters.inStockOnly: true. Mirrors parse-fit.test.ts's
// granularity (one small file per URL-param concern).
import { it, expect, describe } from "vitest"
import { parseQueryFromSearchParams } from "./types"

describe("parseQueryFromSearchParams — in_stock param (WB-100 Task 3)", () => {
  it("reads in_stock=1 as inStockOnly: true", () => {
    expect(parseQueryFromSearchParams({ in_stock: "1" }).filters.inStockOnly).toBe(true)
  })

  it("omits inStockOnly when in_stock is absent", () => {
    expect(parseQueryFromSearchParams({}).filters.inStockOnly).toBeUndefined()
  })

  it("treats in_stock=0 as not set (falsy)", () => {
    expect(parseQueryFromSearchParams({ in_stock: "0" }).filters.inStockOnly).toBeUndefined()
  })
})
