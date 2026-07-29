// WB-118 Q-05 — the "$199+" figure was written independently in five places
// while the rule lived only in a backend script that had never been run
// against production, so every surface advertised a promise the cart did not
// honour.
import { describe, expect, it } from "vitest"

import {
  FREE_SHIPPING_THRESHOLD_USD,
  freeShippingLabel,
} from "./shipping-threshold"

describe("free shipping threshold", () => {
  it("is 199 USD, matching FREE_SHIP_THRESHOLD_USD in the backend script", () => {
    // LOCKSTEP TWIN: backend/src/scripts/update-shipping-prices.ts. If this
    // assertion is updated, that script must be updated AND re-run against
    // every environment, or the site advertises a threshold the cart ignores.
    expect(FREE_SHIPPING_THRESHOLD_USD).toBe(199)
  })

  it("is a positive whole number of dollars, not cents", () => {
    // The repo convention is dollars in Medusa, cents only in the search
    // index. A value like 19900 here would silently disable free shipping.
    expect(Number.isInteger(FREE_SHIPPING_THRESHOLD_USD)).toBe(true)
    expect(FREE_SHIPPING_THRESHOLD_USD).toBeGreaterThan(0)
    expect(FREE_SHIPPING_THRESHOLD_USD).toBeLessThan(10_000)
  })

  it("renders the customer-facing label from that one number", () => {
    expect(freeShippingLabel()).toBe("Free shipping $199+")
  })

  it("keeps the label and the number in agreement", () => {
    expect(freeShippingLabel()).toContain(String(FREE_SHIPPING_THRESHOLD_USD))
  })
})
