import { describe, it, expect } from "vitest"
import { buildTireSpecRows } from "../tire-spec-rows"

describe("buildTireSpecRows", () => {
  it("emits present rows, hides zero/missing", () => {
    const rows = buildTireSpecRows({ construction: "Radial", plyRating: "E", tireType: "light-truck", weightLb: 32 })
    const labels = rows.map((r) => r.label)
    expect(labels).toContain("Construction")
    expect(labels).toContain("Ply rating")
    expect(labels).toContain("Type")
    expect(labels).toContain("Weight")
  })
  it("hides weight 0 and null construction/ply", () => {
    const rows = buildTireSpecRows({ construction: null, plyRating: null, tireType: "passenger", weightLb: 0 })
    const labels = rows.map((r) => r.label)
    expect(labels).not.toContain("Construction")
    expect(labels).not.toContain("Ply rating")
    expect(labels).not.toContain("Weight")
    expect(labels).toContain("Type") // type always present
  })
})
