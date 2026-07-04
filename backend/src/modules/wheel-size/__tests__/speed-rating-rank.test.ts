import { readFileSync } from "node:fs"
import { join } from "node:path"
import { speedRatingRank } from "../speed-rating-rank"

// from backend/src/modules/wheel-size/__tests__/ up to repo root:
// __tests__ → wheel-size → modules → src → backend → root = 5
const golden = JSON.parse(
  readFileSync(join(__dirname, "../../../../../fixtures/speed-rating-rank-golden.json"), "utf8")
) as { order: string[]; cases: { in: string; rank: number }[] }

describe("speedRatingRank", () => {
  it("ranks the standard order ascending (H between U and V)", () => {
    const ranks = golden.order.map((s) => speedRatingRank(s))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(speedRatingRank("U")).toBeLessThan(speedRatingRank("H"))
    expect(speedRatingRank("H")).toBeLessThan(speedRatingRank("V"))
  })
  it("matches every golden case (case-insensitive; Z high; unknown/empty → -1)", () => {
    for (const c of golden.cases) expect(speedRatingRank(c.in)).toBe(c.rank)
  })
  it("treats null/undefined as unknown (-1)", () => {
    expect(speedRatingRank(null)).toBe(-1)
    expect(speedRatingRank(undefined)).toBe(-1)
  })
})
