// storefront/src/modules/home/data/get-featured.test.ts
//
// WB-074 Task 4 (D6/D7) — the home Featured card mapper (toFeatured) must
// read the finish UNION from variant metadata (not the retired
// product.metadata.finish, which normalizeFinish(undefined) always resolves
// to "black" for post-WB-059 catalogs), and must drop a WB-048 "BLANK"
// placeholder bolt pattern instead of printing it on the card.
import { describe, it, expect } from "vitest"
import { HttpTypes } from "@medusajs/types"
import { toFeatured } from "./get-featured"

function variant(overrides: Record<string, unknown> = {}, priceMajor = 100) {
  return {
    id: "v1",
    metadata: overrides,
    calculated_price: { calculated_amount: priceMajor },
  } as unknown as HttpTypes.StoreProductVariant
}

function product(
  variants: HttpTypes.StoreProductVariant[],
  overrides: Partial<HttpTypes.StoreProduct> = {}
): HttpTypes.StoreProduct {
  return {
    id: "p1",
    handle: "p1",
    title: "Test Wheel",
    thumbnail: null,
    metadata: { brand: "BrandA" },
    variants,
    ...overrides,
  } as unknown as HttpTypes.StoreProduct
}

describe("toFeatured — D6 finish union", () => {
  it("derives finishes from the variant-metadata union, not product.metadata.finish", () => {
    const p = product(
      [variant({ finish: "Bronze" }), variant({ finish: "Matte Black" })],
      { metadata: { brand: "BrandA", finish: "SHOULD BE IGNORED" } as any }
    )
    const out = toFeatured(p)
    expect([...out.finishes].sort()).toEqual(["black", "bronze"])
  })

  it("omits finishes when no variant carries real finish data — never defaults to black", () => {
    const p = product([variant({})])
    const out = toFeatured(p)
    expect(out.finishes).toEqual([])
  })
})

describe("toFeatured — D7 no BLANK bolt pattern", () => {
  it("drops the WB-048 BLANK placeholder", () => {
    const p = product([variant({ bolt_pattern_raw: "BLANK" })])
    const out = toFeatured(p)
    expect(out.boltPattern).toBe("")
    expect(out.boltPatternsCanonical).toEqual([])
  })

  it("keeps a real bolt pattern", () => {
    const p = product([variant({ bolt_pattern_raw: "5x120" })])
    const out = toFeatured(p)
    expect(out.boltPattern).toBe("5x120")
    expect(out.boltPatternsCanonical.length).toBeGreaterThan(0)
  })
})
