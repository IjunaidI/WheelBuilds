// WB-126 — searching from the tyre catalogue used to bounce you to wheels, and
// any tyre-only brand was therefore unfindable. Verified live: "Falken" is a
// TYRE brand with 65 products and 0 wheels, so a wheel-scoped search honestly
// returned nothing while the products plainly existed.
import { describe, expect, it } from "vitest"

import {
  pathForSurface,
  searchDestination,
  surfaceFromPathname,
} from "./search-destination"

describe("surfaceFromPathname", () => {
  it("recognises the tyre listing, with and without a country code", () => {
    expect(surfaceFromPathname("/us/tires")).toBe("tires")
    expect(surfaceFromPathname("/tires")).toBe("tires")
    expect(surfaceFromPathname("/us/tires?rim_diameters=20")).toBe("tires")
  })

  it("treats everything else as wheels", () => {
    for (const p of ["/us/store", "/us", "/", "/us/brands/fuel", "/us/cart"]) {
      expect(surfaceFromPathname(p)).toBe("wheels")
    }
  })

  it("does not match a path that merely starts with the letters 'tires'", () => {
    // A future "/tires-guide" editorial page must not hijack search routing.
    expect(surfaceFromPathname("/us/tires-guide")).toBe("wheels")
  })

  it("defaults to wheels for null/undefined/empty", () => {
    expect(surfaceFromPathname(null)).toBe("wheels")
    expect(surfaceFromPathname(undefined)).toBe("wheels")
    expect(surfaceFromPathname("")).toBe("wheels")
  })

  it("is case-insensitive about the country-code prefix", () => {
    // middleware canonicalises case, but this must not depend on that.
    expect(surfaceFromPathname("/US/tires")).toBe("tires")
  })
})

describe("pathForSurface", () => {
  it("maps surfaces to their listing paths", () => {
    expect(pathForSurface("tires")).toBe("/tires")
    expect(pathForSurface("wheels")).toBe("/store")
  })
})

describe("searchDestination", () => {
  it("keeps a tyre search on the tyre catalogue", () => {
    expect(searchDestination("us", "/us/tires", "falken")).toBe("/us/tires?q=falken")
  })

  it("sends a search from anywhere else to wheels", () => {
    expect(searchDestination("us", "/us/store", "fuel")).toBe("/us/store?q=fuel")
    expect(searchDestination("us", "/us", "fuel")).toBe("/us/store?q=fuel")
  })

  it("carries the fit=0 opt-out through (WB-088 D13)", () => {
    // Without this, searching from inside "Show all wheels" silently
    // re-enabled fitment filtering on the results page.
    expect(searchDestination("us", "/us/store", "fuel", { fit: "0" })).toBe(
      "/us/store?q=fuel&fit=0"
    )
  })

  it("encodes a query with spaces and symbols", () => {
    const url = searchDestination("us", "/us/store", "black rhino & co")
    expect(new URLSearchParams(url.split("?")[1]).get("q")).toBe("black rhino & co")
  })

  it("respects the country code it is given", () => {
    expect(searchDestination("de", "/de/tires", "falken")).toBe("/de/tires?q=falken")
  })
})
