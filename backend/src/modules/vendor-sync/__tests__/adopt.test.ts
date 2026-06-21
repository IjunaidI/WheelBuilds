import { partitionRecordsBySku, indexVariantsBySku } from "../pipeline/adopt"

describe("partitionRecordsBySku", () => {
  const recs = [{ partNumber: "A" }, { partNumber: "B" }, { partNumber: "C" }]

  it("creates all when none exist", () => {
    const { toCreate, toAdopt } = partitionRecordsBySku(recs, new Set())
    expect(toCreate.map((r) => r.partNumber)).toEqual(["A", "B", "C"])
    expect(toAdopt).toEqual([])
  })
  it("adopts all when all exist", () => {
    const { toCreate, toAdopt } = partitionRecordsBySku(recs, new Set(["A", "B", "C"]))
    expect(toCreate).toEqual([])
    expect(toAdopt.map((r) => r.partNumber)).toEqual(["A", "B", "C"])
  })
  it("splits a mix", () => {
    const { toCreate, toAdopt } = partitionRecordsBySku(recs, new Set(["B"]))
    expect(toCreate.map((r) => r.partNumber)).toEqual(["A", "C"])
    expect(toAdopt.map((r) => r.partNumber)).toEqual(["B"])
  })
})

describe("indexVariantsBySku", () => {
  it("maps sku -> variantId + inventoryItemId, skipping sku-less rows", () => {
    const index = indexVariantsBySku([
      { id: "var_1", sku: "A", inventory_items: [{ inventory_item_id: "inv_1" }] },
      { id: "var_2", sku: "B", inventory_items: [] },
      { id: "var_3" },
    ])
    expect(index.get("A")).toEqual({ variantId: "var_1", inventoryItemId: "inv_1" })
    expect(index.get("B")).toEqual({ variantId: "var_2", inventoryItemId: null })
    expect(index.size).toBe(2)
  })
})
