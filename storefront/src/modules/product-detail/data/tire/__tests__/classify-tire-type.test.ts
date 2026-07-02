import { describe, it, expect } from "vitest"
import { classifyTireType } from "../classify-tire-type"

describe("classifyTireType", () => {
  it("prefix wins: LT → light-truck, P → passenger, ST → other", () => {
    expect(classifyTireType("LT", {})).toBe("light-truck")
    expect(classifyTireType("P", {})).toBe("passenger")
    expect(classifyTireType("ST", {})).toBe("other")
  })
  it("structural fallback: width+aspect → passenger", () => {
    expect(classifyTireType(null, { tire_width_mm: 305, aspect_ratio: 45 })).toBe("passenger")
  })
  it("structural fallback: construction (no width) → light-truck", () => {
    expect(classifyTireType(null, { construction_type: "R" })).toBe("light-truck")
  })
  it("otherwise → other", () => {
    expect(classifyTireType(null, {})).toBe("other")
  })
})
