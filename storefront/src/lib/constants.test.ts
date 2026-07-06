import { describe, it, expect } from "vitest"
import { filterCustomerPaymentMethods } from "./constants"

const stripe = { id: "pp_stripe_stripe" }
const manual = { id: "pp_system_default" }

describe("filterCustomerPaymentMethods", () => {
  it("drops Manual Payment in production", () => {
    expect(filterCustomerPaymentMethods([stripe, manual], { isProduction: true }))
      .toEqual([stripe])
  })
  it("keeps Manual Payment outside production (for testing)", () => {
    expect(filterCustomerPaymentMethods([stripe, manual], { isProduction: false }))
      .toEqual([stripe, manual])
  })
  it("is a no-op on an empty list", () => {
    expect(filterCustomerPaymentMethods([], { isProduction: true })).toEqual([])
  })
})
