import { MEILI_PRODUCT_FIELDS } from "../search/meili-index-settings"

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
