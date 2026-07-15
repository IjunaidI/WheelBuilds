import { describe, expect, it } from "vitest"

import { hiddenProductCount } from "./hidden-product-count"

describe("hiddenProductCount (WB-093 A14)", () => {
  it("returns 0 when every product is within the shown slice", () => {
    const items = [{ id: "1" }, { id: "2" }]
    expect(hiddenProductCount(items, 3)).toBe(0)
  })

  it("returns 0 when the product count exactly matches the shown slice", () => {
    const items = [{ id: "1" }, { id: "2" }, { id: "3" }]
    expect(hiddenProductCount(items, 3)).toBe(0)
  })

  it("counts hidden PRODUCTS, not summed quantity (the bug being fixed)", () => {
    // 5 line items, shown=3 -> 2 hidden products, regardless of quantity.
    // The old `numberOfLines - 4` math would have used the sum of
    // `quantity` (17) minus a hardcoded 4, giving a nonsense "+13 more".
    const items = [
      { id: "1", quantity: 10 },
      { id: "2", quantity: 3 },
      { id: "3", quantity: 1 },
      { id: "4", quantity: 2 },
      { id: "5", quantity: 1 },
    ]
    expect(hiddenProductCount(items, 3)).toBe(2)
  })

  it("never returns a negative count", () => {
    expect(hiddenProductCount([{ id: "1" }], 3)).toBe(0)
  })

  it("treats a missing/undefined items array as zero products", () => {
    expect(hiddenProductCount(undefined, 3)).toBe(0)
    expect(hiddenProductCount(null, 3)).toBe(0)
  })
})
