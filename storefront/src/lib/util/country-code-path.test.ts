// storefront/src/lib/util/country-code-path.test.ts
//
// WB-096 X8 bug 2 -- `/US/store` redirecting to `/us/US/store` (a 404).
//
// `getCountryCode` (middleware.ts) always resolves a LOWERCASE code -- it
// lowercases the pathname's first segment before checking it against the
// region map. The old `urlHasCountryCode` check then compared that
// lowercase code against the pathname's RAW (un-lowercased) first segment,
// so a valid but upper-cased prefix like "/US" read as having NO country
// code at all. Falling into the "prepend the country code" branch then
// prepended the (lowercase) code onto the STILL-RAW, STILL-UPPERCASE
// pathname -- "/US/store" became "/us/US/store" instead of "/us/store".
//
// `countryCodeRedirectPath` fixes this by comparing lowercased on both
// sides when deciding whether an existing segment is "the same code,
// just differently cased" (in which case it must be STRIPPED before the
// canonical code is prepended) versus "no country-code segment at all"
// (in which case the full pathname is code-less and safe to prepend onto
// as before).
import { describe, it, expect } from "vitest"
import { countryCodeRedirectPath } from "./country-code-path"

describe("countryCodeRedirectPath", () => {
  it("already canonical (exact lowercase match) -- no redirect needed", () => {
    expect(countryCodeRedirectPath("/us/store", "", "us")).toBeNull()
    expect(countryCodeRedirectPath("/us", "", "us")).toBeNull()
  })

  it("uppercase prefix -- same code, different case: STRIPS the existing segment instead of duplicating it", () => {
    // This is the exact bug report shape: must come back "/us/store", never
    // "/us/US/store".
    expect(countryCodeRedirectPath("/US/store", "", "us")).toBe("/us/store")
  })

  it("uppercase prefix preserves the query string", () => {
    expect(countryCodeRedirectPath("/US/store", "?q=wheels", "us")).toBe(
      "/us/store?q=wheels"
    )
  })

  it("mixed-case prefix (\"Us\") also matches case-insensitively", () => {
    expect(countryCodeRedirectPath("/Us/store", "", "us")).toBe("/us/store")
  })

  it("no country-code segment at all -- prepends fresh (pre-existing, unbroken behavior)", () => {
    expect(countryCodeRedirectPath("/store", "", "us")).toBe("/us/store")
  })

  it("root path with no segment -- prepends just the code", () => {
    expect(countryCodeRedirectPath("/", "", "us")).toBe("/us")
  })

  it("uppercase root-only country segment (\"/US\") -- strips down to just the code, no trailing slash artifact", () => {
    expect(countryCodeRedirectPath("/US", "", "us")).toBe("/us")
  })

  it("a genuinely different 2-letter segment that happens to look code-shaped (\"/de\") is NOT treated as the same code -- prepends fresh rather than stripping a real path segment", () => {
    expect(countryCodeRedirectPath("/de/store", "", "us")).toBe("/us/de/store")
  })
})

// WB-121 Q-17 — "/US/STORE" 404'd because only the country code was
// canonicalised; the route segment kept its case and matched no route.
describe("countryCodeRedirectPath — route-segment case (WB-121 Q-17)", () => {
  it("lowercases the route segment alongside the country code", () => {
    expect(countryCodeRedirectPath("/US/STORE", "", "us")).toBe("/us/store")
  })

  it("corrects a wrong-cased route even when the country code is fine", () => {
    expect(countryCodeRedirectPath("/us/STORE", "", "us")).toBe("/us/store")
    expect(countryCodeRedirectPath("/us/Tires", "", "us")).toBe("/us/tires")
  })

  it("returns null when both segments are already canonical (no redirect loop)", () => {
    expect(countryCodeRedirectPath("/us/store", "", "us")).toBeNull()
    expect(countryCodeRedirectPath("/us", "", "us")).toBeNull()
  })

  it("preserves the query string verbatim", () => {
    expect(countryCodeRedirectPath("/US/STORE", "?brands=Fuel%201PC", "us")).toBe(
      "/us/store?brands=Fuel%201PC"
    )
  })

  it("⚠️ NEVER touches a case-sensitive id below the route segment", () => {
    // The order ULID is the guest's ONLY route back to their order, via the
    // link in the confirmation email. Lowercasing it would turn a cosmetic
    // 404 into a lost order.
    expect(
      countryCodeRedirectPath("/US/order/confirmed/order_01KYPQK3ERBAQCC9VGCJE5Y2SS", "", "us")
    ).toBe("/us/order/confirmed/order_01KYPQK3ERBAQCC9VGCJE5Y2SS")
  })

  it("leaves product handles and slugs untouched", () => {
    expect(countryCodeRedirectPath("/US/PRODUCTS/Asanti-Forged-832", "", "us")).toBe(
      "/us/products/Asanti-Forged-832"
    )
  })

  it("leaves an unknown segment alone so it still 404s", () => {
    // Silently rewriting an unknown path would mask real broken links.
    expect(countryCodeRedirectPath("/US/NOT-A-ROUTE", "", "us")).toBe("/us/NOT-A-ROUTE")
  })
})
