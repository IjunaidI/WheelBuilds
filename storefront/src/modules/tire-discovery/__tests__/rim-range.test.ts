import { describe, it, expect } from "vitest"
import { rimRangeLabel } from "../components/grid/tire-product-card"

describe("rimRangeLabel", () => {
  it("shows a range for multiple rim diameters", () => {
    expect(rimRangeLabel([18, 20, 22])).toBe('18"–22"')
  })
  it("shows a single value for one rim diameter", () => {
    expect(rimRangeLabel([22])).toBe('22"')
  })
  it("returns empty string for no rim diameters", () => {
    expect(rimRangeLabel([])).toBe("")
  })
})
