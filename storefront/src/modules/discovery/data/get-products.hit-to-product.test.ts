// storefront/src/modules/discovery/data/get-products.hit-to-product.test.ts
//
// WB-074 D6/D7 whole-branch review (Task 6) — hitToProduct must gate
// h.bolt_patterns[0] through isRealBoltPattern before it reaches
// DiscoveryProduct.boltPattern. The backend transformer
// (build-search-document.ts) indexes bolt_pattern_raw into Meili
// `bolt_patterns` WITHOUT filtering the WB-048 "BLANK" placeholder, so
// without this gate the flagship discovery grid card renders the literal
// string "BLANK" (e.g. `18" · BLANK`). This mirrors the same gate already
// applied at toFeatured (home/data/get-featured.ts) and mapToDetail
// (product-detail/data/get-product.ts) — this was the 4th, previously
// un-gated site.
import { it, expect, describe } from "vitest"
import { hitToProduct, type Hit } from "./get-products"

function makeHit(overrides: Partial<Hit> = {}): Hit {
  return {
    id: "p1",
    handle: "p1",
    title: "Test Wheel",
    brand: "BrandA",
    finishes: ["black"],
    thumbnail: null,
    diameters: [18],
    widths: [9],
    bolt_patterns: ["5x114.3"],
    bolt_patterns_canonical: ["5x114.3"],
    price_min: 10000,
    price_max: 10000,
    created_at: null,
    ...overrides,
  } as Hit
}

describe("hitToProduct — bolt pattern gated through isRealBoltPattern (WB-074 D6/D7)", () => {
  it('a hit whose representative bolt pattern is the vendor placeholder "BLANK" maps to boltPattern: ""', () => {
    const hit = makeHit({ bolt_patterns: ["BLANK"] })
    const product = hitToProduct(hit)
    expect(product.boltPattern).toBe("")
  })

  it("is case/whitespace insensitive, matching isRealBoltPattern's own normalization", () => {
    expect(hitToProduct(makeHit({ bolt_patterns: [" blank "] })).boltPattern).toBe("")
    expect(hitToProduct(makeHit({ bolt_patterns: ["N/A"] })).boltPattern).toBe("")
  })

  it("a real bolt pattern passes through unchanged", () => {
    const hit = makeHit({ bolt_patterns: ["5x114.3"] })
    const product = hitToProduct(hit)
    expect(product.boltPattern).toBe("5x114.3")
  })

  it("an empty/missing bolt_patterns array maps to boltPattern: \"\" (unchanged prior behavior)", () => {
    expect(hitToProduct(makeHit({ bolt_patterns: [] })).boltPattern).toBe("")
    expect(
      hitToProduct(makeHit({ bolt_patterns: undefined as unknown as string[] })).boltPattern
    ).toBe("")
  })

  it("does not affect boltPatternsCanonical (the FitBadge's own data source, untouched by this gate)", () => {
    const hit = makeHit({ bolt_patterns: ["BLANK"], bolt_patterns_canonical: ["5x114.3"] })
    const product = hitToProduct(hit)
    expect(product.boltPatternsCanonical).toEqual(["5x114.3"])
  })
})

// WB-100 Task 3 — hit.in_stock maps to product.inStock. Missing/undefined
// (a doc from before the re-index backfill, or the non-wheel stub) treats
// the product as OUT of stock — the safe default: better to under-claim
// stock than over-claim it to a shopper.
describe("hitToProduct — in_stock → inStock (WB-100 Task 3)", () => {
  it("maps in_stock: true to inStock: true", () => {
    expect(hitToProduct(makeHit({ in_stock: true })).inStock).toBe(true)
  })

  it("maps in_stock: false to inStock: false", () => {
    expect(hitToProduct(makeHit({ in_stock: false })).inStock).toBe(false)
  })

  it("maps a missing in_stock field to inStock: false (safe default)", () => {
    const hit = makeHit()
    delete (hit as Partial<Hit>).in_stock
    expect(hitToProduct(hit).inStock).toBe(false)
  })
})
