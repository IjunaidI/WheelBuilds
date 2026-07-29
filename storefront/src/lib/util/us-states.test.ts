// WB-118 Q-07 — the province field was free text, so "Chicago" in the state
// box passed validation, reached the tax lookup and the carrier, and produced
// the wrong tax and an undeliverable label with no error anywhere.
import { describe, expect, it } from "vitest"

import { US_STATES, normalizeUsState } from "./us-states"

describe("US_STATES", () => {
  it("has 50 states plus DC", () => {
    expect(US_STATES).toHaveLength(51)
  })

  it("has unique, well-formed two-letter codes", () => {
    const codes = US_STATES.map((s) => s.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes.every((c) => /^[A-Z]{2}$/.test(c))).toBe(true)
  })

  it("is sorted by name so the picker reads alphabetically", () => {
    const names = US_STATES.map((s) => s.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
})

describe("normalizeUsState", () => {
  it("accepts a two-letter code in any case", () => {
    expect(normalizeUsState("il")).toBe("IL")
    expect(normalizeUsState("IL")).toBe("IL")
  })

  it("accepts a full state name", () => {
    expect(normalizeUsState("Illinois")).toBe("IL")
    expect(normalizeUsState("  california ")).toBe("CA")
  })

  it("rejects a city (the reported bug)", () => {
    expect(normalizeUsState("Chicago")).toBeNull()
    expect(normalizeUsState("Los Angeles")).toBeNull()
  })

  it("rejects empty, junk and non-string input", () => {
    expect(normalizeUsState("")).toBeNull()
    expect(normalizeUsState("   ")).toBeNull()
    expect(normalizeUsState("ZZ")).toBeNull()
    expect(normalizeUsState(undefined as any)).toBeNull()
    expect(normalizeUsState(null as any)).toBeNull()
  })

  it("round-trips every state by both code and name", () => {
    for (const { code, name } of US_STATES) {
      expect(normalizeUsState(code)).toBe(code)
      expect(normalizeUsState(name)).toBe(code)
      expect(normalizeUsState(name.toLowerCase())).toBe(code)
    }
  })
})
