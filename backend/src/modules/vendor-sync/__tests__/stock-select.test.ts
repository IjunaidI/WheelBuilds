import { selectStockPartNumbers } from "../pipeline/stock-select"

describe("selectStockPartNumbers", () => {
  it("keeps only staged parts that have a current row, de-duped, staged order", () => {
    expect(
      selectStockPartNumbers(["A", "B", "C", "A"], new Set(["A", "C", "D"]))
    ).toEqual(["A", "C"])
  })
  it("returns empty when nothing intersects", () => {
    expect(selectStockPartNumbers(["X"], new Set(["Y"]))).toEqual([])
  })
})
