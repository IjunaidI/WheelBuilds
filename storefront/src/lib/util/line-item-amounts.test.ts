import { describe, it, expect } from "vitest"
import { lineItemAmounts } from "./line-item-amounts"

describe("lineItemAmounts", () => {
  it("reads the stored total and unit price when both are present", () => {
    expect(
      lineItemAmounts({ total: 739.98, unit_price: 369.99, quantity: 2 })
    ).toEqual({
      total: 739.98,
      unitPrice: 369.99,
    })
  })

  it("derives unit price from total/quantity when unit_price is missing", () => {
    expect(lineItemAmounts({ total: 100, quantity: 4 })).toEqual({
      total: 100,
      unitPrice: 25,
    })
  })

  it("a line with a missing/unpriced variant still renders the stored amounts (no NaN)", () => {
    // Simulates a discontinued (drafted) product: the live variant has no
    // resolvable calculated_price, but the line item itself still carries
    // the amount the customer was actually charged.
    const result = lineItemAmounts({
      total: 369.99,
      unit_price: 369.99,
      quantity: 1,
    })
    expect(result).toEqual({ total: 369.99, unitPrice: 369.99 })
    expect(Number.isNaN(result.total)).toBe(false)
    expect(Number.isNaN(result.unitPrice)).toBe(false)
  })

  it("falls back to 0 when total/unit_price/quantity are all missing", () => {
    expect(lineItemAmounts({})).toEqual({ total: 0, unitPrice: 0 })
  })

  it("treats null total/unit_price as missing, not NaN", () => {
    expect(
      lineItemAmounts({ total: null, unit_price: null, quantity: 3 })
    ).toEqual({ total: 0, unitPrice: 0 })
  })

  it("keeps a real $0 unit price instead of falling back (nullish, not falsy)", () => {
    expect(lineItemAmounts({ total: 0, unit_price: 0, quantity: 2 })).toEqual({
      total: 0,
      unitPrice: 0,
    })
  })

  // WB-118 Q-01. The live Store API response carries NO `total` on a cart line
  // item -- its full key set is id/quantity/unit_price/tax_lines/adjustments/
  // product/variant/..., with per-line totals simply not decorated. So
  // `item.total ?? 0` rendered "$0.00" in the cart's TOTAL column while the
  // unit price beside it was correct. Captured live 2026-07-29; see
  // docs/in-progress/plans/wb-118-task1-findings.md.
  //
  // NOTE this is the mirror image of the original hypothesis, which assumed
  // `unit_price` was the zero. It was not: unit_price was 333 and correct.
  it("derives the total from unit_price x quantity when total is ABSENT", () => {
    expect(lineItemAmounts({ quantity: 1, unit_price: 333 })).toEqual({
      total: 333,
      unitPrice: 333,
    })
  })

  it("derives the total for a multi-quantity line", () => {
    expect(lineItemAmounts({ quantity: 4, unit_price: 333 })).toEqual({
      total: 1332,
      unitPrice: 333,
    })
  })

  it("does not divide by zero on a zero-quantity line", () => {
    const out = lineItemAmounts({ quantity: 0, unit_price: 333 })
    expect(out.total).toBe(0)
    expect(Number.isFinite(out.unitPrice)).toBe(true)
  })
})
