import { describe, it, expect } from "vitest"
import { setPriceLine } from "./set-price"

describe("setPriceLine", () => {
  it('qty 4 @ $369.99 -> "$369.99 × 4 = $1,479.96 per set"', () => {
    expect(setPriceLine(36999, 4)).toEqual({
      show: true,
      text: "$369.99 × 4 = $1,479.96 per set",
    })
  })

  it("hides the row when qty is 1 — nothing to add up over the unit price", () => {
    expect(setPriceLine(36999, 1)).toEqual({ show: false, text: "" })
  })

  it("hides the row for qty 0 (defensive — the stepper never goes below 1)", () => {
    expect(setPriceLine(36999, 0)).toEqual({ show: false, text: "" })
  })

  it("hides the row when the unit price is null — nothing to multiply", () => {
    expect(setPriceLine(null, 4)).toEqual({ show: false, text: "" })
  })
})
