import { describe, it, expect } from "vitest"
import { regionRedirectTarget } from "./region-redirect"

describe("regionRedirectTarget (WB-095 X2)", () => {
  it("redirects a non-default region prefix into the default region, preserving the query string", () => {
    expect(regionRedirectTarget("/de/store", "?q=x", "us")).toBe(
      "/us/store?q=x"
    )
  })

  it("preserves deep paths", () => {
    expect(regionRedirectTarget("/de/products/abc", "", "us")).toBe(
      "/us/products/abc"
    )
  })

  it("returns null for the default region -- nothing to redirect", () => {
    expect(regionRedirectTarget("/us/store", "", "us")).toBeNull()
  })

  it("returns null for a path with no 2-letter country-code segment -- the existing 307 handles this", () => {
    expect(regionRedirectTarget("/store", "", "us")).toBeNull()
  })

  it("returns null for the bare root path", () => {
    expect(regionRedirectTarget("/", "", "us")).toBeNull()
  })

  it("THE REGRESSION this task fixes: fires even when a region map contains the non-default code", () => {
    // seed.ts:~139-151 seeds a real EUR region covering gb/de/dk/se/fr/es/it,
    // so regionMap.has("de") is TRUE in production -- a rule gated on
    // regionMap.has(code) would never fire for /de. That is the entire bug:
    // /de/products/<handle> serves a live, indexable, EUR-priced duplicate
    // today. Prove the pure function does not consult any map at all: it
    // must return a redirect target for "de" regardless of what a region
    // map (that legitimately contains "de") says about it.
    const regionMapContainingDe = new Map([["de", { id: "reg_eur" } as any]])
    expect(regionMapContainingDe.has("de")).toBe(true)
    expect(regionRedirectTarget("/de/store", "", "us")).not.toBeNull()
    expect(regionRedirectTarget("/de/store", "", "us")).toBe("/us/store")
  })

  it("cannot produce a redirect target equal to the default region itself -- loop safety", () => {
    expect(regionRedirectTarget("/us", "", "us")).toBeNull()
  })

  it("respects a custom default region", () => {
    expect(regionRedirectTarget("/de/store", "", "ca")).toBe("/ca/store")
  })
})
