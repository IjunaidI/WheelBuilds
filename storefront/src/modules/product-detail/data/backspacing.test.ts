import { describe, it, expect } from "vitest"
import { deriveBackspacing } from "./backspacing"

describe("deriveBackspacing", () => {
  it("9in wide x +15mm offset -> 5.59\" ((4.5) + 0.5 + (15/25.4))", () => {
    expect(deriveBackspacing(9, 15)).toBe('5.59"')
  })

  it("8in wide x -12mm offset -> 4.03\" ((4) + 0.5 + (-12/25.4))", () => {
    expect(deriveBackspacing(8, -12)).toBe('4.03"')
  })

  it("returns \"\" for a null width", () => {
    expect(deriveBackspacing(null, 15)).toBe("")
  })

  it("returns \"\" for a null offset", () => {
    expect(deriveBackspacing(9, null)).toBe("")
  })

  it("returns \"\" for a NaN width", () => {
    expect(deriveBackspacing(NaN, 15)).toBe("")
  })

  it("returns \"\" for a NaN offset", () => {
    expect(deriveBackspacing(9, NaN)).toBe("")
  })

  it("returns \"\" for an undefined width", () => {
    expect(deriveBackspacing(undefined, 15)).toBe("")
  })

  it("returns \"\" for an undefined offset", () => {
    expect(deriveBackspacing(9, undefined)).toBe("")
  })
})
