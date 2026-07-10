import { describe, it, expect } from "vitest"
import { pickDefaultSize, boltPatternsForFinish } from "../group-sizes"

describe("pickDefaultSize", () => {
  it("returns null (not undefined) for an empty size list", () => {
    expect(pickDefaultSize([])).toBeNull()
  })
})

describe("boltPatternsForFinish", () => {
  it("distinct patterns from a finish's sizes", () => {
    const sizes = [
      { boltPattern: "6x139.7", diameter: 20, width: 9, offsetMm: 18 },
      { boltPattern: "6x139.7", diameter: 22, width: 9, offsetMm: 12 },
      { boltPattern: "5x127", diameter: 20, width: 9, offsetMm: 18 },
    ] as any
    expect(boltPatternsForFinish(sizes)).toEqual(["6x139.7", "5x127"])
  })
})
