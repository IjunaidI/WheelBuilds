import { describe, it, expect } from "vitest"
import { firstPayment, paymentMethodTitle } from "./payment-summary"

describe("firstPayment", () => {
  it("returns the first payment of the first collection", () => {
    expect(
      firstPayment([{ payments: [{ provider_id: "pp_stripe_stripe" }] }])
    ).toEqual({ provider_id: "pp_stripe_stripe" })
  })

  it("does not throw when payment_collections is an empty array", () => {
    expect(() => firstPayment([])).not.toThrow()
    expect(firstPayment([])).toBeUndefined()
  })

  it("does not throw when the first collection has no payments", () => {
    expect(firstPayment([{ payments: [] }])).toBeUndefined()
    expect(firstPayment([{}])).toBeUndefined()
  })

  it("does not throw when payment_collections is null or undefined", () => {
    expect(firstPayment(null)).toBeUndefined()
    expect(firstPayment(undefined)).toBeUndefined()
  })
})

describe("paymentMethodTitle", () => {
  const map = { pp_stripe_stripe: { title: "Credit card" } }

  it("returns the mapped title for a known provider", () => {
    expect(paymentMethodTitle("pp_stripe_stripe", map)).toBe("Credit card")
  })

  it("falls back to the raw provider id for an unmapped provider (no crash)", () => {
    expect(paymentMethodTitle("pp_some_new_provider", map)).toBe(
      "pp_some_new_provider"
    )
  })

  it("falls back on an empty map", () => {
    expect(paymentMethodTitle("pp_stripe_stripe", {})).toBe("pp_stripe_stripe")
  })
})
