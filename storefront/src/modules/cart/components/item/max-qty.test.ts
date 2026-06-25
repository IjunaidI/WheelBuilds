import { describe, it, expect } from "vitest"
import { maxSelectableQty } from "./max-qty"

describe("maxSelectableQty", () => {
  it("managed + no backorder: caps at live stock", () => {
    expect(maxSelectableQty({ manage_inventory: true, inventory_quantity: 3 }, 1)).toBe(3)
  })
  it("never returns below the qty already in the cart", () => {
    expect(maxSelectableQty({ manage_inventory: true, inventory_quantity: 3 }, 5)).toBe(5)
  })
  it("unmanaged inventory: falls back to FALLBACK_MAX (10)", () => {
    expect(maxSelectableQty({ manage_inventory: false, inventory_quantity: 2 }, 1)).toBe(10)
  })
  it("backorder allowed: falls back to FALLBACK_MAX (10)", () => {
    expect(maxSelectableQty({ manage_inventory: true, allow_backorder: true, inventory_quantity: 2 }, 1)).toBe(10)
  })
  it("zero stock but item already in cart: stays at current qty", () => {
    expect(maxSelectableQty({ manage_inventory: true, inventory_quantity: 0 }, 2)).toBe(2)
  })
  it("undefined variant: FALLBACK_MAX", () => {
    expect(maxSelectableQty(undefined, 1)).toBe(10)
  })
})
