import { computeInStock } from "../search/compute-in-stock"

const v = (stocked: number, reserved: number, discontinued = false) => ({
  metadata: discontinued ? { discontinued: true } : {},
  inventory_items: [{ inventory: { stocked_quantity: stocked, reserved_quantity: reserved } }],
})

describe("computeInStock", () => {
  it("is true when at least one variant has available stock (mixed)", () => {
    expect(computeInStock([v(0, 0), v(5, 2)])).toBe(true)
  })

  it("is false when every variant is out of stock", () => {
    expect(computeInStock([v(0, 0), v(3, 3)])).toBe(false)
  })

  it("is true for a single in-stock variant", () => {
    expect(computeInStock([v(1, 0)])).toBe(true)
  })

  it("is false for an empty variant list", () => {
    expect(computeInStock([])).toBe(false)
  })

  it("does not count a discontinued variant even if it has stock", () => {
    expect(computeInStock([v(10, 0, true), v(0, 0)])).toBe(false)
  })

  it("treats reserved >= stocked as out of stock (fully reserved)", () => {
    expect(computeInStock([v(4, 4)])).toBe(false)
  })

  it("ignores a variant with no inventory_items", () => {
    expect(computeInStock([{ metadata: {}, inventory_items: [] }])).toBe(false)
  })

  it("ignores a variant with missing inventory data (no throw)", () => {
    expect(computeInStock([{ metadata: {} }, { metadata: {}, inventory_items: [{}] }])).toBe(false)
  })
})
