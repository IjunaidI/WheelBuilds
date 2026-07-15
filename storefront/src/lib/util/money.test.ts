import { describe, it, expect } from "vitest"
import { convertToLocale, formatCentsUsd } from "./money"

describe("formatCentsUsd", () => {
  it("shows exact cents, never rounding to whole dollars", () => {
    expect(formatCentsUsd(36999)).toBe("$369.99")
    expect(formatCentsUsd(147996)).toBe("$1,479.96")
  })
  it("pads whole-dollar amounts to .00", () => {
    expect(formatCentsUsd(37000)).toBe("$370.00")
  })
  it("handles zero", () => {
    expect(formatCentsUsd(0)).toBe("$0.00")
  })
})

describe("convertToLocale currency contract (WB-092 fixwave C1)", () => {
  // line-item-price / line-item-unit-price used to source currency_code from
  // getPricesForVariant(item.variant), which is null for a discontinued
  // (unpriced) variant -- the exact case those components exist to render
  // correctly. The fix is to always pass the cart/order's currency_code
  // instead, which this pins as the contract: a defined currency_code always
  // yields a "$"-prefixed string, regardless of whether the live variant
  // price resolved.
  it("renders with the currency symbol when a currency_code is supplied, even with no live variant price", () => {
    expect(
      convertToLocale({ amount: 369.99, currency_code: "usd" })
    ).toBe("$369.99")
  })

  it("regression: an undefined currency_code (the pre-fix bug) silently drops the currency symbol", () => {
    // This is what happened when currency_code was sourced from a null
    // getPricesForVariant() result: convertToLocale falls back to a bare
    // `amount.toString()` with no "$". Pinning this here documents exactly
    // why currencyCode must be threaded from the cart/order, not the variant.
    expect(
      convertToLocale({ amount: 369.99, currency_code: undefined as any })
    ).toBe("369.99")
  })
})
