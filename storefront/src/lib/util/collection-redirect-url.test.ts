import { describe, it, expect } from "vitest"
import { collectionRedirectUrl } from "./collection-redirect-url"

describe("collectionRedirectUrl (WB-086 D1)", () => {
  it("encodes a brand title with a space into the /store ?brands= join", () => {
    expect(
      collectionRedirectUrl("us", { title: "BLACKLINE FORGED" })
    ).toBe("/us/store?brands=BLACKLINE%20FORGED")
  })

  it("passes a title through untouched (no trim/uppercase/normalize) other than encoding", () => {
    // Provenance: `ensureBrandCollection` sets `title: brand` verbatim from
    // the same vendor `rep` object that feeds the product metadata `brand`
    // field and the Meilisearch `brand` facet — normalizing here would
    // break the join.
    expect(collectionRedirectUrl("us", { title: "fuel" })).toBe(
      "/us/store?brands=fuel"
    )
  })

  it("falls back to /store when the collection is null", () => {
    expect(collectionRedirectUrl("us", null)).toBe("/us/store")
  })

  it("falls back to /store when the collection is undefined", () => {
    expect(collectionRedirectUrl("us", undefined)).toBe("/us/store")
  })

  it("falls back to /store when the collection has no title", () => {
    expect(collectionRedirectUrl("us", { title: "" })).toBe("/us/store")
  })

  it("prefixes the country code", () => {
    expect(collectionRedirectUrl("ca", { title: "FUEL" })).toBe(
      "/ca/store?brands=FUEL"
    )
  })
})
