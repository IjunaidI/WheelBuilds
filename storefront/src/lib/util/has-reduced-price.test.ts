import { describe, it, expect } from "vitest"
import { hasReducedPrice } from "./has-reduced-price"

describe("hasReducedPrice", () => {
  it("is false when there is no live price at all (discontinued/unpriced variant)", () => {
    expect(hasReducedPrice(null)).toBe(false)
    expect(hasReducedPrice(undefined)).toBe(false)
  })

  it("is true for a genuine, currently-active sale (live calculated < live original)", () => {
    expect(
      hasReducedPrice({
        calculated_price_number: 314.99,
        original_price_number: 369.99,
      } as any)
    ).toBe(true)
  })

  it("is false when calculated equals original (no active promotion)", () => {
    expect(
      hasReducedPrice({
        calculated_price_number: 369.99,
        original_price_number: 369.99,
      } as any)
    ).toBe(false)
  })

  // WB-092 fixwave C4: the regression this guards against. The item was
  // added to the cart when the list price was $300 (so item.total/unit_price
  // are stored at $300), but the list price has since risen to $400 with no
  // promotion running (live calculated === live original === $400). The old
  // `storedPrice < liveOriginalPrice` comparison (300 < 400) would have
  // fabricated a discount badge here. Comparing live-vs-live correctly shows
  // no badge, regardless of what the stored/charged price was.
  it("is false when the list price rose after the item was added to the cart (no fabricated discount)", () => {
    const livePricesAfterPriceRise = {
      calculated_price_number: 400,
      original_price_number: 400,
    } as any

    expect(hasReducedPrice(livePricesAfterPriceRise)).toBe(false)
  })

  it("is false in the defensive case where calculated exceeds original", () => {
    expect(
      hasReducedPrice({
        calculated_price_number: 400,
        original_price_number: 369.99,
      } as any)
    ).toBe(false)
  })
})
