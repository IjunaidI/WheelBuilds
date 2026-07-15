// storefront/src/lib/data/orders-page-params.test.ts
//
// WB-093 A6 -- `ordersPageParams` is the pure offset math backing the
// account orders pager. Pinning page 1 -> offset 0 and page 3 (limit 10)
// -> offset 20 per the task brief, plus the defensive page >= 1 clamp.
import { describe, it, expect } from "vitest"
import { ordersPageParams, ORDERS_PAGE_SIZE } from "./orders-page-params"

describe("ordersPageParams (WB-093 A6)", () => {
  it("page 1 -> offset 0 at the default limit", () => {
    expect(ordersPageParams(1)).toEqual({ limit: ORDERS_PAGE_SIZE, offset: 0 })
  })

  it("page 3, limit 10 -> offset 20", () => {
    expect(ordersPageParams(3, 10)).toEqual({ limit: 10, offset: 20 })
  })

  it("respects a non-default limit", () => {
    expect(ordersPageParams(2, 5)).toEqual({ limit: 5, offset: 5 })
  })

  it("clamps page 0 up to page 1 (offset 0)", () => {
    expect(ordersPageParams(0, 10)).toEqual({ limit: 10, offset: 0 })
  })

  it("clamps a negative page up to page 1 (offset 0)", () => {
    expect(ordersPageParams(-5, 10)).toEqual({ limit: 10, offset: 0 })
  })

  it("clamps a non-finite page (NaN) up to page 1", () => {
    expect(ordersPageParams(NaN, 10)).toEqual({ limit: 10, offset: 0 })
  })

  it("floors a fractional page number", () => {
    expect(ordersPageParams(2.9, 10)).toEqual({ limit: 10, offset: 10 })
  })
})
