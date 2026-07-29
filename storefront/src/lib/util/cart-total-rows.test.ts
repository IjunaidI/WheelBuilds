// WB-118 Q-02 — the displayed money breakdown must reconcile with the charged
// total. See the docstring on cart-total-rows.ts for the Medusa 2.13.6 totals
// semantics this encodes, and docs/in-progress/plans/wb-118-task1-findings.md
// for the live capture that proved the old rows overstated by exactly
// shipping_total.
import { describe, expect, it } from "vitest"

import { cartTotalRows } from "./cart-total-rows"
import realCart from "./__fixtures__/cart-payment-step.json"

const base = {
  currency_code: "usd",
  item_subtotal: 1000,
  shipping_subtotal: 0,
  tax_total: 0,
  discount_subtotal: 0,
  credit_line_total: 0,
  total: 1000,
}

/** Sum the rows the way a shopper reads them down the page. */
const sum = (view: ReturnType<typeof cartTotalRows>) =>
  view.rows.reduce((acc, r) => acc + (r.negative ? -r.amount : r.amount), 0)

describe("cartTotalRows", () => {
  it("rows sum to cart.total for an items-only cart", () => {
    const view = cartTotalRows(base)
    expect(sum(view)).toBeCloseTo(view.total, 2)
    expect(view.total).toBe(1000)
  })

  it("does NOT double-count shipping (the Q-02 regression)", () => {
    // Medusa: subtotal already contains shipping_subtotal, and tax_total
    // already contains shipping tax. total = subtotal + tax - discount.
    const cart = {
      ...base,
      item_subtotal: 1000,
      shipping_subtotal: 11,
      shipping_total: 12, // includes $1 shipping tax
      tax_total: 1,
      total: 1012, // (1000 + 11) + 1
    }
    const view = cartTotalRows(cart)
    expect(sum(view)).toBeCloseTo(1012, 2)
    // The old code rendered subtotal(1011) + shipping_total(12) + tax(1) = 1024
    expect(sum(view)).not.toBeCloseTo(1024, 2)
  })

  it("subtracts discount_subtotal, not discount_total", () => {
    const cart = {
      ...base,
      item_subtotal: 1000,
      tax_total: 90,
      discount_subtotal: 100,
      discount_total: 110, // subtotal + its tax — must NOT be the row used
      total: 990, // (1000 + 90) - 100
    }
    const view = cartTotalRows(cart)
    expect(sum(view)).toBeCloseTo(990, 2)
    expect(view.rows.find((r) => r.key === "discount")?.amount).toBe(100)
  })

  it("omits zero-value optional rows but always keeps items and tax", () => {
    const view = cartTotalRows(base)
    expect(view.rows.map((r) => r.key)).toEqual(["items", "tax"])
  })

  it("shows a credit row only when non-zero", () => {
    const cart = { ...base, credit_line_total: 50, total: 950 }
    const view = cartTotalRows(cart)
    expect(view.rows.find((r) => r.key === "credit")?.amount).toBe(50)
    expect(sum(view)).toBeCloseTo(950, 2)
  })

  it("treats missing numeric fields as 0 rather than NaN", () => {
    const view = cartTotalRows({ currency_code: "usd", total: 0 } as any)
    expect(Number.isNaN(sum(view))).toBe(false)
    expect(view.rows.every((r) => Number.isFinite(r.amount))).toBe(true)
  })

  it("falls back to usd when the cart carries no currency", () => {
    expect(cartTotalRows({ total: 0 } as any).currencyCode).toBe("usd")
  })

  it("INVARIANT: rows sum to total on the real captured cart", () => {
    const view = cartTotalRows(realCart as any)
    expect(sum(view)).toBeCloseTo(view.total, 2)
  })

  it("falls back to discount_total when discount_subtotal is absent (orders)", () => {
    // BaseOrder does not declare discount_subtotal, so the order-confirmation
    // page would otherwise drop the row and over-state a discounted order.
    const order = {
      currency_code: "usd",
      item_subtotal: 1000,
      shipping_subtotal: 0,
      tax_total: 0,
      discount_total: 100,
      total: 900,
    }
    const view = cartTotalRows(order as any)
    expect(view.rows.find((r) => r.key === "discount")?.amount).toBe(100)
    expect(sum(view)).toBeCloseTo(900, 2)
    expect(view.rows.find((r) => r.key === "adjustments")).toBeUndefined()
  })

  it("ALWAYS reconciles: an unknown component becomes an explicit row", () => {
    // e.g. a gift card (stubbed out in decorateCartTotals) or a future field.
    // Rendering numbers that visibly fail to add up is the defect this file
    // exists to prevent, so a residual is surfaced rather than ignored.
    const cart = { ...base, item_subtotal: 1000, tax_total: 0, total: 940 }
    const view = cartTotalRows(cart)
    const adj = view.rows.find((r) => r.key === "adjustments")
    expect(adj?.amount).toBeCloseTo(60, 2)
    expect(adj?.negative).toBe(true)
    expect(sum(view)).toBeCloseTo(940, 2)
  })

  it("does not add a reconciling row for sub-cent float noise", () => {
    const cart = { ...base, item_subtotal: 1000, tax_total: 0, total: 1000.001 }
    expect(
      cartTotalRows(cart).rows.find((r) => r.key === "adjustments")
    ).toBeUndefined()
  })

  it("reproduces the exact live numbers from the Task 1 capture", () => {
    // Live 2026-07-29: items 333.00, shipping 10.00 (pre-tax), tax 34.30,
    // total 377.30. The page displayed 343.00 + 11.00 + 34.30 = 388.30.
    const view = cartTotalRows(realCart as any)
    expect(view.total).toBeCloseTo(377.3, 2)
    expect(view.rows.find((r) => r.key === "items")?.amount).toBeCloseTo(333, 2)
    expect(view.rows.find((r) => r.key === "shipping")?.amount).toBeCloseTo(10, 2)
    expect(view.rows.find((r) => r.key === "tax")?.amount).toBeCloseTo(34.3, 2)
    // The old rendering; kept as an explicit tombstone for the regression.
    expect(sum(view)).not.toBeCloseTo(388.3, 2)
  })
})
