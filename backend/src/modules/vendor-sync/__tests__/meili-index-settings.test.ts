import { MEILI_PRODUCT_FIELDS, MEILI_SEARCHABLE_ATTRIBUTES, MEILI_SYNONYMS } from "../search/meili-index-settings"

describe("MEILI_PRODUCT_FIELDS (WB-089 L1)", () => {
  it("includes 'status' so the plugin can evict drafted/discontinued products", () => {
    expect(MEILI_PRODUCT_FIELDS).toContain("status")
  })
  it("still requests metadata + variants for the transformer", () => {
    expect(MEILI_PRODUCT_FIELDS).toEqual(
      expect.arrayContaining(["metadata", "variants.metadata", "variants.prices.amount"])
    )
  })
})

describe("MEILI_PRODUCT_FIELDS (WB-100)", () => {
  it("requests per-variant inventory stock/reserved so the transformer can compute in_stock", () => {
    expect(MEILI_PRODUCT_FIELDS).toEqual(
      expect.arrayContaining([
        "variants.inventory_items.inventory.stocked_quantity",
        "variants.inventory_items.inventory.reserved_quantity",
      ])
    )
  })
})

describe("Meili search settings (WB-087)", () => {
  it("searches title/brand/style/skus/search_text", () => {
    expect(MEILI_SEARCHABLE_ATTRIBUTES).toEqual(
      expect.arrayContaining(["title", "brand", "style", "skus", "search_text"])
    )
  })
  it("has rims↔wheels and tyre↔tire synonyms", () => {
    expect(MEILI_SYNONYMS.rims).toContain("wheels")
    expect(MEILI_SYNONYMS.tyre).toContain("tire")
  })
})
