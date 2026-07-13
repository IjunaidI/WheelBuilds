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

import { stockOnlyPartsToApply } from "../pipeline/stock-select"

describe("stockOnlyPartsToApply (WB-089 L5)", () => {
  it("selects a part that has NO stock rows this run (sold out everywhere) as long as it is staged + current", () => {
    // Part A is in the feed (so it's in feed-staging) but sold out at every
    // warehouse, so it would be ABSENT from stock-staging. It must still be
    // selected so applyStockLevels can zero its Medusa levels.
    expect(stockOnlyPartsToApply(["A", "B"], new Set(["A", "B"]))).toEqual(["A", "B"])
  })
  it("excludes a staged part that has no current Medusa product", () => {
    expect(stockOnlyPartsToApply(["A", "X"], new Set(["A"]))).toEqual(["A"])
  })
})
