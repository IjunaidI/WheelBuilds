import { describe, it, expect } from "vitest"
import { isSpecialOrder, leadTimeLine } from "./order-signal"
import {
  SHIP_LEAD_TIME,
  SPECIAL_ORDER_LEAD_TIME,
  SPECIAL_ORDER_UNAVAILABLE,
} from "./pdp-config"

describe("isSpecialOrder", () => {
  it('"SO" -> true', () => {
    expect(isSpecialOrder("SO")).toBe(true)
  })

  it('"ST" -> false (normal stock)', () => {
    expect(isSpecialOrder("ST")).toBe(false)
  })

  it('"N2" -> false (normal, non-SO vendor code)', () => {
    expect(isSpecialOrder("N2")).toBe(false)
  })

  it("undefined -> false (metadata key absent)", () => {
    expect(isSpecialOrder(undefined)).toBe(false)
  })

  it("null / wrong-case / wrong-type junk -> false (defensive — metadata is untyped)", () => {
    expect(isSpecialOrder(null)).toBe(false)
    expect(isSpecialOrder("so")).toBe(false) // exact-match only — vendor code is uppercase
    expect(isSpecialOrder(42)).toBe(false)
  })
})

describe("leadTimeLine", () => {
  it("SO + in_stock (addable) -> the extended-lead-time warning — honest because the button is enabled", () => {
    expect(
      leadTimeLine({ availability: "in_stock", isSpecialOrder: true })
    ).toBe(SPECIAL_ORDER_LEAD_TIME)
  })

  it("SO + low_stock (addable) -> also the extended-lead-time warning", () => {
    expect(
      leadTimeLine({ availability: "low_stock", isSpecialOrder: true })
    ).toBe(SPECIAL_ORDER_LEAD_TIME)
  })

  it("in_stock, not SO -> the normal SHIP_LEAD_TIME copy", () => {
    expect(
      leadTimeLine({ availability: "in_stock", isSpecialOrder: false })
    ).toBe(SHIP_LEAD_TIME)
  })

  it("low_stock, not SO -> treated like in_stock (still buyable, still ships)", () => {
    expect(
      leadTimeLine({ availability: "low_stock", isSpecialOrder: false })
    ).toBe(SHIP_LEAD_TIME)
  })

  it("out_of_stock, not SO -> null (nothing to promise)", () => {
    expect(
      leadTimeLine({ availability: "out_of_stock", isSpecialOrder: false })
    ).toBeNull()
  })

  it("out_of_stock AND flagged SO -> SPECIAL_ORDER_UNAVAILABLE, NOT SPECIAL_ORDER_LEAD_TIME and NOT null (fix-wave: Add to cart is disabled here, so the copy must not promise an actionable lead time)", () => {
    const result = leadTimeLine({
      availability: "out_of_stock",
      isSpecialOrder: true,
    })
    expect(result).toBe(SPECIAL_ORDER_UNAVAILABLE)
    expect(result).not.toBe(SPECIAL_ORDER_LEAD_TIME)
    expect(result).not.toBeNull()
  })
})
