// storefront/src/modules/product-detail/data/get-product.test.ts
//
// WB-074 Task 4 (D6/D7) — the related-products card mapper (toRelatedProduct)
// must read the finish UNION from variant metadata (not the retired
// product.metadata.finish, which normalizeFinish(undefined) always resolves
// to "black" for post-WB-059 catalogs — every related card showed black), and
// must drop a WB-048 "BLANK" placeholder bolt pattern instead of printing it
// on the card ("18\" · BLANK").
import { describe, it, expect, vi } from "vitest"
import { HttpTypes } from "@medusajs/types"
import { toRelatedProduct, getProductDetail } from "./get-product"

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))
vi.mock("@lib/data/regions", () => ({ getRegion: vi.fn(async () => ({ id: "reg_1" })) }))
vi.mock("@lib/data/products", () => ({
  getProductByHandle: vi.fn(),
  getProductsList: vi.fn(),
}))
vi.mock("@lib/data/fitment", () => ({
  getFitmentByProduct: vi.fn(async () => []),
  getFitmentByTireProduct: vi.fn(async () => []),
}))

import { getProductByHandle } from "@lib/data/products"

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

describe("toRelatedProduct — D6 finish union", () => {
  it("derives finishes from the variant-metadata union, not product.metadata.finish", () => {
    const p = product(
      [variant({ finish: "Matte Black" }), variant({ finish: "Gloss Silver" })],
      { metadata: { brand: "BrandA", finish: "SHOULD BE IGNORED" } as any }
    )
    const out = toRelatedProduct(p)
    expect([...out.finishes].sort()).toEqual(["black", "silver"])
  })

  it("omits finishes (empty array) when no variant carries real finish data — never defaults to black", () => {
    const p = product([variant({}), variant({ finish: "" })])
    const out = toRelatedProduct(p)
    expect(out.finishes).toEqual([])
  })
})

describe("toRelatedProduct — D7 no BLANK bolt pattern", () => {
  it("drops the WB-048 BLANK placeholder — boltPattern is empty, not 'BLANK'", () => {
    const p = product([variant({ bolt_pattern_raw: "BLANK" })])
    const out = toRelatedProduct(p)
    expect(out.boltPattern).toBe("")
    expect(out.boltPatternsCanonical).toEqual([])
  })

  it("keeps a real bolt pattern", () => {
    const p = product([variant({ bolt_pattern_raw: "5x114.3" })])
    const out = toRelatedProduct(p)
    expect(out.boltPattern).toBe("5x114.3")
    expect(out.boltPatternsCanonical.length).toBeGreaterThan(0)
  })
})

describe("getProductDetail — WB-084 image gate", () => {
  it("404s (notFound) a product with no thumbnail", async () => {
    ;(getProductByHandle as any).mockResolvedValueOnce({
      id: "p1", handle: "p1", title: "No Image Wheel",
      thumbnail: null, metadata: { brand: "B" }, variants: [],
    })
    await expect(getProductDetail("p1", "us")).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("does NOT 404 a product that has a thumbnail", async () => {
    ;(getProductByHandle as any).mockResolvedValueOnce({
      id: "p2", handle: "p2", title: "Real Wheel",
      thumbnail: "https://cdn.example.com/x.jpg", metadata: { brand: "B" }, variants: [],
    })
    await expect(getProductDetail("p2", "us")).resolves.toMatchObject({ id: "p2" })
  })
})
