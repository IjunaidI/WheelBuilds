import { describe, it, expect } from "vitest"
import { clampQty, stepperCap } from "./qty-bounds"

describe("clampQty", () => {
  it("clamps a proposed quantity down to the cap", () => {
    expect(clampQty(10, 3)).toBe(3)
  })
  it("never returns below 1, even when cap is 0 (OOS)", () => {
    expect(clampQty(5, 0)).toBe(1)
    expect(clampQty(0, 0)).toBe(1)
  })
  it("passes a qty through unchanged when it's already within bounds", () => {
    expect(clampQty(2, 5)).toBe(2)
  })
  it("floors a qty below 1 up to 1", () => {
    expect(clampQty(-3, 10)).toBe(1)
  })
})

describe("stepperCap", () => {
  it("caps at the real available quantity when it's below the flat 99 ceiling", () => {
    expect(stepperCap(3)).toBe(3)
  })
  it("caps at 99 when available exceeds it", () => {
    expect(stepperCap(500)).toBe(99)
  })
  it("falls back to 99 when available is 0 (genuinely OOS — Add to cart is disabled elsewhere)", () => {
    expect(stepperCap(0)).toBe(99)
  })
  it("falls back to 99 when available is undefined (unresolved variant / missing data)", () => {
    expect(stepperCap(undefined)).toBe(99)
  })
})
