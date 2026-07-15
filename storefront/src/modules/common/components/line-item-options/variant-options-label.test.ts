import { describe, it, expect } from "vitest"
import { variantOptionsLabel } from "./variant-options-label"

describe("variantOptionsLabel", () => {
  it("renders a single option value (seed Sweatshirt/Sweatpants: title === the size)", () => {
    expect(
      variantOptionsLabel({ title: "S", options: [{ value: "S" }] })
    ).toBe("S")
  })

  it("joins multiple option values with the checkout-summary separator", () => {
    expect(
      variantOptionsLabel({
        title: "Some Wheel - Bronze / 20x9 / 5x114.3",
        options: [
          { value: "Bronze" },
          { value: "20 x 9" },
          { value: "5x114.3" },
        ],
      })
    ).toBe("Bronze · 20 x 9 · 5x114.3")
  })

  it("shows the finish so it is no longer invisible on the cart line", () => {
    const label = variantOptionsLabel({
      options: [{ value: "Bronze" }, { value: "22 x 9.5" }],
    })
    expect(label).toContain("Bronze")
  })

  it("falls back to title when options is empty", () => {
    expect(variantOptionsLabel({ title: "Default", options: [] })).toBe(
      "Default"
    )
  })

  it("falls back to title when option values are all blank", () => {
    expect(
      variantOptionsLabel({ title: "Default", options: [{ value: "" }, { value: null }] })
    ).toBe("Default")
  })

  it("returns an empty string for an undefined variant", () => {
    expect(variantOptionsLabel(undefined)).toBe("")
  })

  it("returns an empty string when there are no options and no title", () => {
    expect(variantOptionsLabel({})).toBe("")
  })
})
