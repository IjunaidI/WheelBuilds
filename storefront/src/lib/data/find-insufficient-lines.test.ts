import { describe, it, expect } from "vitest"
import { findInsufficientLines } from "./find-insufficient-lines"

function line(overrides: Record<string, unknown> = {}) {
  return {
    variant_id: "variant_1",
    quantity: 2,
    product_title: "Petrol Wheel",
    ...overrides,
  }
}

function variant(overrides: Record<string, unknown> = {}) {
  return {
    id: "variant_1",
    manage_inventory: true,
    allow_backorder: false,
    inventory_quantity: 5,
    ...overrides,
  }
}

describe("findInsufficientLines", () => {
  it("sufficient stock: line is not flagged", () => {
    const result = findInsufficientLines(
      [line({ quantity: 2 })],
      [variant({ inventory_quantity: 5 })]
    )
    expect(result).toEqual([])
  })

  it("insufficient stock: flags the line, naming the item and live availability", () => {
    const result = findInsufficientLines(
      [line({ quantity: 5, product_title: "Petrol Wheel" })],
      [variant({ inventory_quantity: 2 })]
    )
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe("Petrol Wheel")
    expect(result[0].available).toBe(2)
  })

  it("backorder allowed: never flagged regardless of quantity", () => {
    const result = findInsufficientLines(
      [line({ quantity: 100 })],
      [variant({ allow_backorder: true, inventory_quantity: 1 })]
    )
    expect(result).toEqual([])
  })

  it("unmanaged inventory: never flagged regardless of quantity", () => {
    const result = findInsufficientLines(
      [line({ quantity: 100 })],
      [variant({ manage_inventory: false, inventory_quantity: 0 })]
    )
    expect(result).toEqual([])
  })

  it("missing live variant (lookup came back short): fails open, not flagged", () => {
    const result = findInsufficientLines(
      [line({ variant_id: "not_in_live_data", quantity: 100 })],
      [variant()]
    )
    expect(result).toEqual([])
  })

  it("line with no variant_id at all: skipped, not flagged", () => {
    const result = findInsufficientLines(
      [line({ variant_id: undefined, quantity: 100 })],
      [variant()]
    )
    expect(result).toEqual([])
  })

  it("names the first insufficient item across multiple lines", () => {
    const items = [
      line({ variant_id: "v1", quantity: 1, product_title: "OK Wheel" }),
      line({ variant_id: "v2", quantity: 10, product_title: "Short Wheel" }),
    ]
    const variants = [
      variant({ id: "v1", inventory_quantity: 5 }),
      variant({ id: "v2", inventory_quantity: 3 }),
    ]
    const result = findInsufficientLines(items, variants)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe("Short Wheel")
    expect(result[0].available).toBe(3)
  })

  it("falls back to item.title when product_title is absent", () => {
    const result = findInsufficientLines(
      [{ variant_id: "variant_1", quantity: 5, title: "Fallback Title" }],
      [variant({ inventory_quantity: 1 })]
    )
    expect(result[0].title).toBe("Fallback Title")
  })
})
