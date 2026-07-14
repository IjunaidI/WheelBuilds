import { describe, it, expect } from "vitest"
import { diameterLabel } from "./diameter-label"

describe("diameterLabel (WB-088 D5)", () => {
  it("range for multi-size", () => {
    expect(diameterLabel([17, 20, 24])).toBe('17″–24″')
  })
  it("single size", () => {
    expect(diameterLabel([20])).toBe('20″')
  })
  it("matching diameter when a filter is active", () => {
    expect(diameterLabel([17, 20, 22], [20])).toBe('20″')
  })
  it("empty → N sizes fallback handled by caller (returns null)", () => {
    expect(diameterLabel([])).toBeNull()
  })
})
