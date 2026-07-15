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
})
