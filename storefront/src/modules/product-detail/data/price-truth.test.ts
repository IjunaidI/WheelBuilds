import { describe, it, expect } from "vitest"
import { headlinePriceCents, canPurchasePrice } from "./price-truth"

describe("headlinePriceCents", () => {
  it("returns the selected variant's own positive price", () => {
    expect(headlinePriceCents(36999)).toBe(36999)
  })
  it("treats a $0 own price as unavailable, not a real price", () => {
    expect(headlinePriceCents(0)).toBeNull()
  })
  it("treats a negative own price as unavailable", () => {
    expect(headlinePriceCents(-100)).toBeNull()
  })
  it("treats a missing own price as unavailable — no sibling fallback", () => {
    expect(headlinePriceCents(undefined)).toBeNull()
  })
  it("treats a null own price as unavailable", () => {
    expect(headlinePriceCents(null)).toBeNull()
  })
})

describe("canPurchasePrice", () => {
  it("is purchasable when resolved/in-stock AND priced", () => {
    expect(canPurchasePrice(true, 36999)).toBe(true)
  })
  it("is not purchasable when unresolved, even if a price is present", () => {
    expect(canPurchasePrice(false, 36999)).toBe(false)
  })
  it("is not purchasable when resolved but price is unavailable (null)", () => {
    expect(canPurchasePrice(true, null)).toBe(false)
  })
  it("is not purchasable when resolved but price is $0 (defensive, not just null)", () => {
    expect(canPurchasePrice(true, 0)).toBe(false)
  })
})
