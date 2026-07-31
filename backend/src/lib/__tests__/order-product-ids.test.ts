// WB-128 — a purchase decrements inventory but emits no product event, so the
// Meilisearch plugin (which subscribes only to product.*/product-category.*/
// meilisearch.sync) never learns that something sold out. The only backstop a
// purchase can rely on is the DAILY 04:00 reconcile, so the index could
// advertise "in stock" for up to ~24h after the last unit was bought.
import {
  MAX_REINDEX_PER_ORDER,
  productIdsFromOrder,
} from "../order-product-ids"

describe("productIdsFromOrder", () => {
  it("reads product_id off the line items", () => {
    expect(
      productIdsFromOrder({ items: [{ product_id: "prod_1" }, { product_id: "prod_2" }] })
    ).toEqual(["prod_1", "prod_2"])
  })

  it("dedupes when several sizes of the same product are ordered", () => {
    // The common wheel order: four of one product across two variants.
    expect(
      productIdsFromOrder({
        items: [{ product_id: "prod_1" }, { product_id: "prod_1" }],
      })
    ).toEqual(["prod_1"])
  })

  it("falls back to the expanded variant when product_id is not denormalised", () => {
    expect(
      productIdsFromOrder({ items: [{ variant: { product_id: "prod_9" } }] })
    ).toEqual(["prod_9"])
  })

  it("prefers the line item's own product_id over the variant's", () => {
    expect(
      productIdsFromOrder({
        items: [{ product_id: "prod_1", variant: { product_id: "prod_other" } }],
      })
    ).toEqual(["prod_1"])
  })

  it("skips items with no resolvable product", () => {
    expect(
      productIdsFromOrder({
        items: [null, {}, { product_id: null }, { product_id: "" }, { product_id: "prod_1" }],
      })
    ).toEqual(["prod_1"])
  })

  it("survives a missing or empty items array", () => {
    expect(productIdsFromOrder({})).toEqual([])
    expect(productIdsFromOrder({ items: null })).toEqual([])
    expect(productIdsFromOrder({ items: [] })).toEqual([])
  })

  it("caps a pathological order so checkout cannot queue hundreds of index writes", () => {
    const items = Array.from({ length: MAX_REINDEX_PER_ORDER + 40 }, (_, i) => ({
      product_id: `prod_${i}`,
    }))
    expect(productIdsFromOrder({ items })).toHaveLength(MAX_REINDEX_PER_ORDER)
  })
})
