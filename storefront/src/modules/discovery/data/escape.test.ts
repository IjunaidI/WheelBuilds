// storefront/src/modules/discovery/data/escape.test.ts
//
// WB-088 D12 — `lit` must escape backslashes BEFORE quotes so a value that
// already contains a backslash round-trips through the Meilisearch filter
// literal instead of the quote-escaping backslash getting re-escaped (or,
// with the naive quotes-first order, a literal `\"` in the input being
// misread as an escaped quote rather than a backslash followed by a quote).
// Shared file — both the wheel (get-products.ts) and tire
// (get-tire-products.ts) adapters import this same `lit`, so one fix here
// covers both surfaces.
import { describe, it, expect } from "vitest"
import { lit } from "./escape"

describe("lit (WB-088 D12 — backslash-before-quote escaping)", () => {
  it("escapes a value containing both a backslash and a quote", () => {
    expect(lit('a\\b"c')).toBe('"a\\\\b\\"c"')
  })

  it("passes numbers through as bare (unquoted) literals", () => {
    expect(lit(18)).toBe("18")
  })

  it("quotes a plain string with no special characters", () => {
    expect(lit("Petrol")).toBe('"Petrol"')
  })

  it("escapes a lone backslash with no quote", () => {
    expect(lit("a\\b")).toBe('"a\\\\b"')
  })

  it("escapes a lone quote with no backslash", () => {
    expect(lit('a"b')).toBe('"a\\"b"')
  })
})
