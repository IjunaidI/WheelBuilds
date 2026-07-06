import { describe, it, expect } from "vitest"
import { formatCentsUsd } from "./money"

describe("formatCentsUsd", () => {
  it("shows exact cents, never rounding to whole dollars", () => {
    expect(formatCentsUsd(36999)).toBe("$369.99")
    expect(formatCentsUsd(147996)).toBe("$1,479.96")
  })
  it("pads whole-dollar amounts to .00", () => {
    expect(formatCentsUsd(37000)).toBe("$370.00")
  })
  it("handles zero", () => {
    expect(formatCentsUsd(0)).toBe("$0.00")
  })
})
