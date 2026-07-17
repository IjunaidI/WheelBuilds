import { describe, it, expect } from "vitest"
import { showOutOfStock } from "./show-out-of-stock"

// WB-100 Task 4: pins the strict `=== false` rule so a future refactor can't
// regress this to `!inStock` (which would badge every related/featured
// product — see the docstring on show-out-of-stock.ts for why).
describe("showOutOfStock (WB-100 Task 4)", () => {
  it("false (confirmed out of stock) → badge", () => {
    expect(showOutOfStock(false)).toBe(true)
  })

  it("true (confirmed in stock) → no badge", () => {
    expect(showOutOfStock(true)).toBe(false)
  })

  it("undefined (unknown — related/featured cards) → no badge", () => {
    expect(showOutOfStock(undefined)).toBe(false)
  })
})
