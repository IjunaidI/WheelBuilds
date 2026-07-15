import { describe, it, expect } from "vitest"
import { formatShippingMethod } from "./format-shipping-method"

describe("formatShippingMethod", () => {
  it("formats the amount as exact dollars-and-cents, no euro-style decimal swap", () => {
    const result = formatShippingMethod({
      shipping_methods: [{ name: "Standard Shipping", total: 10 }],
      currency_code: "usd",
    })
    expect(result.name).toBe("Standard Shipping")
    expect(result.amountLabel).toBe("$10.00")
    expect(result.amountLabel).not.toContain("$10,00")
  })

  it("does not throw on an empty (but present) shipping_methods array", () => {
    expect(() =>
      formatShippingMethod({ shipping_methods: [], currency_code: "usd" })
    ).not.toThrow()
    expect(formatShippingMethod({ shipping_methods: [], currency_code: "usd" })).toEqual({
      name: "",
      amountLabel: "$0.00",
    })
  })

  it("does not throw when shipping_methods is null", () => {
    expect(() =>
      formatShippingMethod({ shipping_methods: null, currency_code: "usd" })
    ).not.toThrow()
  })

  it("does not throw when shipping_methods is undefined", () => {
    expect(() => formatShippingMethod({ currency_code: "usd" })).not.toThrow()
  })

  it("renders a real fractional amount correctly (regression: no rounding, no swap)", () => {
    const result = formatShippingMethod({
      shipping_methods: [{ name: "Freight", total: 24.5 }],
      currency_code: "usd",
    })
    expect(result.amountLabel).toBe("$24.50")
  })
})
