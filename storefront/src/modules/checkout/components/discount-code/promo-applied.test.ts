import { describe, it, expect } from "vitest"
import { promoApplied } from "./index"

describe("promoApplied", () => {
  it("true when the code is present (case-insensitive)", () => {
    expect(promoApplied([{ code: "SAVE10" }], "save10")).toBe(true)
  })
  it("false when absent", () => {
    expect(promoApplied([{ code: "SAVE10" }], "BOGUS")).toBe(false)
  })
  it("false on empty promotions", () => {
    expect(promoApplied([], "SAVE10")).toBe(false)
  })
})
