// storefront/src/modules/discovery/data/get-products.build-filters.test.ts
//
// WB-100 Task 3 — buildFilters must push an `in_stock = true` clause when
// DiscoveryFilters.inStockOnly is truthy, and omit it entirely when
// undefined/false (mirrors how priceMinCents/priceMaxCents push their own
// clauses only when set). This clause is NOT skippable — like price, it's a
// global narrowing that must also apply to every per-dimension facet query;
// buildFilters's `skip` arg only ever excludes ONE of the array facets
// (brands/diameters/boltPatterns/finishes), never price or in_stock.
import { describe, it, expect } from "vitest"
import { buildFilters } from "./get-products"
import { EMPTY_FILTERS, DiscoveryQuery } from "./types"

const baseQuery: DiscoveryQuery = { filters: EMPTY_FILTERS, sort: "relevance", page: 1 }

describe("buildFilters — in_stock (WB-100 Task 3)", () => {
  it("adds `in_stock = true` when inStockOnly is true", () => {
    const clauses = buildFilters({ ...EMPTY_FILTERS, inStockOnly: true }, baseQuery)
    expect(clauses).toContain("in_stock = true")
  })

  it("omits the clause when inStockOnly is undefined", () => {
    const clauses = buildFilters(EMPTY_FILTERS, baseQuery)
    expect(clauses.some((c) => c.startsWith("in_stock"))).toBe(false)
  })

  it("omits the clause when inStockOnly is false", () => {
    const clauses = buildFilters({ ...EMPTY_FILTERS, inStockOnly: false }, baseQuery)
    expect(clauses.some((c) => c.startsWith("in_stock"))).toBe(false)
  })

  it("still applies in_stock when a facet dimension is skipped (never itself skippable, like price)", () => {
    const clauses = buildFilters(
      { ...EMPTY_FILTERS, inStockOnly: true, brands: ["Petrol"] },
      baseQuery,
      "brands"
    )
    expect(clauses).toContain("in_stock = true")
    expect(clauses.some((c) => c.startsWith("brand IN"))).toBe(false)
  })
})
