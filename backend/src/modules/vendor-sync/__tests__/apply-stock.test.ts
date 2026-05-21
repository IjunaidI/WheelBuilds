import { computeStockChanges } from "../pipeline/apply-stock"

describe("computeStockChanges", () => {
  const inventoryItemId = "inv_item_001"

  it("creates levels for a new product with 3 warehouse entries", () => {
    const currentStaging = [
      { warehouse_code: "1001", qoh: 5 },
      { warehouse_code: "1002", qoh: 10 },
      { warehouse_code: "1003", qoh: 3 },
    ]
    const previousStock: Record<string, number> = {}
    const existingLevels = new Map<string, { id: string; stocked_quantity: number }>()
    const warehouseToLocationMap = new Map([
      ["1001", "loc_1001"],
      ["1002", "loc_1002"],
      ["1003", "loc_1003"],
    ])

    const result = computeStockChanges(
      currentStaging,
      previousStock,
      existingLevels,
      warehouseToLocationMap,
      inventoryItemId
    )

    expect(result.creates).toHaveLength(3)
    expect(result.updates).toHaveLength(0)
    expect(result.creates).toEqual(
      expect.arrayContaining([
        {
          inventory_item_id: inventoryItemId,
          location_id: "loc_1001",
          stocked_quantity: 5,
        },
        {
          inventory_item_id: inventoryItemId,
          location_id: "loc_1002",
          stocked_quantity: 10,
        },
        {
          inventory_item_id: inventoryItemId,
          location_id: "loc_1003",
          stocked_quantity: 3,
        },
      ])
    )
  })

  it("updates an existing product with 1 changed warehouse", () => {
    const currentStaging = [{ warehouse_code: "1001", qoh: 20 }]
    const previousStock: Record<string, number> = { "1001": 10 }
    const existingLevels = new Map([
      ["loc_1001", { id: "level_001", stocked_quantity: 10 }],
    ])
    const warehouseToLocationMap = new Map([["1001", "loc_1001"]])

    const result = computeStockChanges(
      currentStaging,
      previousStock,
      existingLevels,
      warehouseToLocationMap,
      inventoryItemId
    )

    expect(result.creates).toHaveLength(0)
    expect(result.updates).toHaveLength(1)
    expect(result.updates[0]).toEqual({
      id: "level_001",
      inventory_item_id: inventoryItemId,
      location_id: "loc_1001",
      stocked_quantity: 20,
    })
  })

  it("zeroes out a warehouse that previously had stock but is now missing", () => {
    const currentStaging: Array<{ warehouse_code: string; qoh: number }> = []
    const previousStock: Record<string, number> = { "1001": 15 }
    const existingLevels = new Map([
      ["loc_1001", { id: "level_001", stocked_quantity: 15 }],
    ])
    const warehouseToLocationMap = new Map([["1001", "loc_1001"]])

    const result = computeStockChanges(
      currentStaging,
      previousStock,
      existingLevels,
      warehouseToLocationMap,
      inventoryItemId
    )

    expect(result.creates).toHaveLength(0)
    expect(result.updates).toHaveLength(1)
    expect(result.updates[0]).toEqual({
      id: "level_001",
      inventory_item_id: inventoryItemId,
      location_id: "loc_1001",
      stocked_quantity: 0,
    })
  })

  it("returns empty arrays when there are no stock changes", () => {
    const currentStaging = [{ warehouse_code: "1001", qoh: 10 }]
    const previousStock: Record<string, number> = { "1001": 10 }
    const existingLevels = new Map([
      ["loc_1001", { id: "level_001", stocked_quantity: 10 }],
    ])
    const warehouseToLocationMap = new Map([["1001", "loc_1001"]])

    const result = computeStockChanges(
      currentStaging,
      previousStock,
      existingLevels,
      warehouseToLocationMap,
      inventoryItemId
    )

    expect(result.creates).toHaveLength(0)
    expect(result.updates).toHaveLength(0)
  })

  it("handles mixed scenario: new locations, updates, and zeroed-out warehouses", () => {
    const currentStaging = [
      { warehouse_code: "1001", qoh: 20 }, // updated (was 10)
      { warehouse_code: "1003", qoh: 7 },  // new location
    ]
    const previousStock: Record<string, number> = {
      "1001": 10,
      "1002": 5, // will be zeroed out (missing from staging)
    }
    const existingLevels = new Map([
      ["loc_1001", { id: "level_001", stocked_quantity: 10 }],
      ["loc_1002", { id: "level_002", stocked_quantity: 5 }],
    ])
    const warehouseToLocationMap = new Map([
      ["1001", "loc_1001"],
      ["1002", "loc_1002"],
      ["1003", "loc_1003"],
    ])

    const result = computeStockChanges(
      currentStaging,
      previousStock,
      existingLevels,
      warehouseToLocationMap,
      inventoryItemId
    )

    // 1 create for warehouse 1003
    expect(result.creates).toHaveLength(1)
    expect(result.creates[0]).toEqual({
      inventory_item_id: inventoryItemId,
      location_id: "loc_1003",
      stocked_quantity: 7,
    })

    // 2 updates: warehouse 1001 (qty change) and warehouse 1002 (zeroed out)
    expect(result.updates).toHaveLength(2)
    expect(result.updates).toEqual(
      expect.arrayContaining([
        {
          id: "level_001",
          inventory_item_id: inventoryItemId,
          location_id: "loc_1001",
          stocked_quantity: 20,
        },
        {
          id: "level_002",
          inventory_item_id: inventoryItemId,
          location_id: "loc_1002",
          stocked_quantity: 0,
        },
      ])
    )
  })

  it("skips warehouse codes with no location mapping", () => {
    const currentStaging = [
      { warehouse_code: "1001", qoh: 5 },
      { warehouse_code: "9999", qoh: 3 }, // no mapping
    ]
    const previousStock: Record<string, number> = {}
    const existingLevels = new Map<string, { id: string; stocked_quantity: number }>()
    const warehouseToLocationMap = new Map([["1001", "loc_1001"]])

    const result = computeStockChanges(
      currentStaging,
      previousStock,
      existingLevels,
      warehouseToLocationMap,
      inventoryItemId
    )

    expect(result.creates).toHaveLength(1)
    expect(result.creates[0].location_id).toBe("loc_1001")
    expect(result.updates).toHaveLength(0)
  })

  it("does not zero out a previous warehouse that already had 0 stock", () => {
    const currentStaging: Array<{ warehouse_code: string; qoh: number }> = []
    const previousStock: Record<string, number> = { "1001": 0 }
    const existingLevels = new Map([
      ["loc_1001", { id: "level_001", stocked_quantity: 0 }],
    ])
    const warehouseToLocationMap = new Map([["1001", "loc_1001"]])

    const result = computeStockChanges(
      currentStaging,
      previousStock,
      existingLevels,
      warehouseToLocationMap,
      inventoryItemId
    )

    expect(result.creates).toHaveLength(0)
    expect(result.updates).toHaveLength(0)
  })
})
