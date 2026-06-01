import { it, expect, describe } from "vitest"
import { unwrapFitment } from "./fitment-unwrap"

const sample = {
  status: "ok",
  canonicalBoltPatterns: ["5x114.3"],
  hubBoreMm: 67.1,
  diameterWindow: null,
  widthWindow: null,
  offsetWindow: null,
  source: { modificationSlug: "x", region: "usdm" },
}

describe("unwrapFitment", () => {
  it("reads the bare fitment object (legacy unwrapped response)", () => {
    expect(unwrapFitment(sample)?.canonicalBoltPatterns).toEqual(["5x114.3"])
  })
  it("reads the wrapped { fitment } envelope (current backend)", () => {
    expect(unwrapFitment({ fitment: sample })?.canonicalBoltPatterns).toEqual(["5x114.3"])
  })
  it("passes through a not_found fitment (has the contract keys)", () => {
    const nf = { ...sample, status: "not_found", canonicalBoltPatterns: [] }
    expect(unwrapFitment({ fitment: nf })?.status).toBe("not_found")
  })
  it("returns null for an unrelated/empty body", () => {
    expect(unwrapFitment(undefined)).toBeNull()
    expect(unwrapFitment(null)).toBeNull()
    expect(unwrapFitment({})).toBeNull()
    expect(unwrapFitment({ error: "unavailable" })).toBeNull()
  })
})
