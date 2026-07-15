// storefront/src/modules/checkout/utils/furthest-allowed-step.test.ts
//
// WB-092 C11 -- a `?step=` deep link beyond what the cart actually supports
// (e.g. `?step=payment` with no address on file) used to render an inert
// collapsed section with no summary and no edit control. `furthestAllowedStep`
// derives how far the cart has actually progressed; `clampStep` uses it to
// decide whether a requested step should pass through or get redirected down.
import { describe, it, expect } from "vitest"
import { clampStep, furthestAllowedStep } from "./furthest-allowed-step"

const cart = (overrides: Record<string, unknown> = {}) => ({
  shipping_address: null,
  shipping_methods: [],
  payment_collection: null,
  gift_cards: [],
  total: 100,
  ...overrides,
})

describe("furthestAllowedStep", () => {
  it("no cart at all -> address", () => {
    expect(furthestAllowedStep(null)).toBe("address")
    expect(furthestAllowedStep(undefined)).toBe("address")
  })

  it("cart with no shipping address -> address", () => {
    expect(furthestAllowedStep(cart())).toBe("address")
  })

  it("has address, no shipping method -> delivery", () => {
    expect(
      furthestAllowedStep(cart({ shipping_address: { id: "addr_1" } }))
    ).toBe("delivery")
  })

  it("has address + shipping method, no payment session -> payment", () => {
    expect(
      furthestAllowedStep(
        cart({
          shipping_address: { id: "addr_1" },
          shipping_methods: [{ id: "sm_1" }],
        })
      )
    ).toBe("payment")
  })

  it("has payment_collection but no PENDING session -> still payment", () => {
    expect(
      furthestAllowedStep(
        cart({
          shipping_address: { id: "addr_1" },
          shipping_methods: [{ id: "sm_1" }],
          payment_collection: {
            payment_sessions: [{ status: "canceled" }],
          },
        })
      )
    ).toBe("payment")
  })

  it("has a pending payment session -> review", () => {
    expect(
      furthestAllowedStep(
        cart({
          shipping_address: { id: "addr_1" },
          shipping_methods: [{ id: "sm_1" }],
          payment_collection: {
            payment_sessions: [{ status: "pending" }],
          },
        })
      )
    ).toBe("review")
  })

  it("paid entirely by gift card (total 0) skips the payment gate -> review", () => {
    expect(
      furthestAllowedStep(
        cart({
          shipping_address: { id: "addr_1" },
          shipping_methods: [{ id: "sm_1" }],
          gift_cards: [{ id: "gc_1" }],
          total: 0,
        })
      )
    ).toBe("review")
  })

  it("gift card present but total not zero still requires a payment session -> payment", () => {
    expect(
      furthestAllowedStep(
        cart({
          shipping_address: { id: "addr_1" },
          shipping_methods: [{ id: "sm_1" }],
          gift_cards: [{ id: "gc_1" }],
          total: 50,
        })
      )
    ).toBe("payment")
  })

  it("gift card total-zero cart still needs a shipping method first -> delivery", () => {
    expect(
      furthestAllowedStep(
        cart({
          shipping_address: { id: "addr_1" },
          gift_cards: [{ id: "gc_1" }],
          total: 0,
        })
      )
    ).toBe("delivery")
  })
})

describe("clampStep — the deep-link clamp table (WB-092 C11)", () => {
  // Fixture names track the FURTHEST step each cart state allows, per the
  // furthestAllowedStep table above: no address -> "address"; address only
  // -> "delivery"; address + shipping method -> "payment"; + a pending
  // payment session -> "review".
  const noAddress = cart()
  const furthestIsDelivery = cart({ shipping_address: { id: "addr_1" } })
  const furthestIsPayment = cart({
    shipping_address: { id: "addr_1" },
    shipping_methods: [{ id: "sm_1" }],
  })
  const furthestIsReview = cart({
    shipping_address: { id: "addr_1" },
    shipping_methods: [{ id: "sm_1" }],
    payment_collection: { payment_sessions: [{ status: "pending" }] },
  })

  it("missing step -> clamps to furthest allowed", () => {
    expect(clampStep(undefined, noAddress)).toBe("address")
    expect(clampStep(undefined, furthestIsPayment)).toBe("payment")
  })

  it("unrecognized step -> clamps to furthest allowed", () => {
    expect(clampStep("bogus", furthestIsPayment)).toBe("payment")
  })

  it("requested step AHEAD of the furthest allowed one -> clamps down", () => {
    expect(clampStep("payment", furthestIsDelivery)).toBe("delivery")
    expect(clampStep("review", furthestIsDelivery)).toBe("delivery")
    expect(clampStep("review", furthestIsPayment)).toBe("payment")
    expect(clampStep("delivery", noAddress)).toBe("address")
  })

  it("requested step AT the furthest allowed one -> passes through", () => {
    expect(clampStep("address", noAddress)).toBe("address")
    expect(clampStep("delivery", furthestIsDelivery)).toBe("delivery")
    expect(clampStep("payment", furthestIsPayment)).toBe("payment")
    expect(clampStep("review", furthestIsReview)).toBe("review")
  })

  it("requested step BEHIND the furthest allowed one -> passes through (Edit buttons still work)", () => {
    expect(clampStep("address", furthestIsReview)).toBe("address")
    expect(clampStep("delivery", furthestIsReview)).toBe("delivery")
    expect(clampStep("payment", furthestIsReview)).toBe("payment")
  })
})
