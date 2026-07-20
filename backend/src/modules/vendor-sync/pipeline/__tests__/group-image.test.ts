import {
  computeGroupImageFields,
  computeSurvivingGroupRecords,
} from "../group-image"
import { WheelNormalizedRecord } from "../../adapters/types"

function makeWheel(
  overrides: Partial<WheelNormalizedRecord> = {}
): WheelNormalizedRecord {
  return {
    productType: "wheel",
    partNumber: "126GB-211223",
    vendorCode: "wheelpros-wheels",
    title: "126 GLOSS BLACK 20X10 5X120 23",
    brand: "Performance Replicas",
    imageUrl: "https://cdn.example.com/wheels/126gb.jpg",
    invOrderType: "ST",
    totalQoh: 5,
    msrpUsd: 320,
    mapUsd: 320,
    runDateVendor: new Date("2026-05-07T22:06:48"),
    stockByWarehouse: {},
    groupKey: "Performance Replicas|126|GLOSS BLACK",
    displayStyleNo: "126",
    finish: "GLOSS BLACK",
    diameterIn: 20,
    widthIn: 10,
    boltCount: 5,
    boltCircleIn: 4.724,
    boltPatternRaw: "5X120",
    offsetMm: 23,
    centerBoreMm: 71.5,
    loadRatingLb: 2200,
    shippingWeightLb: 35,
    style: "PR126",
    ...overrides,
  }
}

describe("computeGroupImageFields", () => {
  it("recomputes thumbnail/images from surviving rows when the picked representative's finish died", () => {
    // Group has finish A (lowest part_number -> would be the representative)
    // and finish B. A's row was dropped this apply (dead image URL, WB-115) so
    // it is NOT in the surviving set passed in here -- only B survives.
    const finishB = makeWheel({
      partNumber: "126SB-211224",
      finish: "SATIN BLACK",
      imageUrl: "https://cdn.example.com/wheels/126sb.jpg",
    })

    const result = computeGroupImageFields([finishB])

    expect(result.thumbnail).toBe("https://cdn.example.com/wheels/126sb.jpg")
    expect(result.images).toEqual([
      { url: "https://cdn.example.com/wheels/126sb.jpg" },
    ])
  })

  it("picks the same representative (lowest part_number) as the create path among multiple survivors", () => {
    const higher = makeWheel({
      partNumber: "126SB-211224",
      finish: "SATIN BLACK",
      imageUrl: "https://cdn.example.com/wheels/126sb.jpg",
    })
    const lower = makeWheel({
      partNumber: "126GM-211220",
      finish: "GUNMETAL",
      imageUrl: "https://cdn.example.com/wheels/126gm.jpg",
    })

    const result = computeGroupImageFields([higher, lower])

    expect(result.thumbnail).toBe("https://cdn.example.com/wheels/126gm.jpg")
    expect(result.images).toEqual(
      expect.arrayContaining([
        { url: "https://cdn.example.com/wheels/126sb.jpg" },
        { url: "https://cdn.example.com/wheels/126gm.jpg" },
      ])
    )
    expect(result.images).toHaveLength(2)
  })

  it("dedupes identical image URLs across surviving variants", () => {
    const a = makeWheel({ partNumber: "A1", imageUrl: "https://cdn.example.com/x.jpg" })
    const b = makeWheel({ partNumber: "A2", imageUrl: "https://cdn.example.com/x.jpg" })

    const result = computeGroupImageFields([a, b])

    expect(result.images).toEqual([{ url: "https://cdn.example.com/x.jpg" }])
  })

  it("returns an undefined thumbnail and no images for an empty survivor set (defensive; should not occur in practice)", () => {
    const result = computeGroupImageFields([])
    expect(result.thumbnail).toBeUndefined()
    expect(result.images).toEqual([])
  })
})

describe("computeSurvivingGroupRecords", () => {
  const currentRows = [
    { part_number: "126GB-211223", normalized: makeWheel({ partNumber: "126GB-211223" }) },
    {
      part_number: "126SB-211224",
      normalized: makeWheel({
        partNumber: "126SB-211224",
        finish: "SATIN BLACK",
        imageUrl: "https://cdn.example.com/wheels/126sb-old.jpg",
      }),
    },
  ]

  it("excludes removed part numbers", () => {
    const result = computeSurvivingGroupRecords(currentRows, [], [
      "126GB-211223",
    ])
    expect(result.map((r) => r.partNumber)).toEqual(["126SB-211224"])
  })

  it("overrides a stale current row with its freshly-changed record", () => {
    const changed = makeWheel({
      partNumber: "126SB-211224",
      finish: "SATIN BLACK",
      imageUrl: "https://cdn.example.com/wheels/126sb-new.jpg",
    })
    const result = computeSurvivingGroupRecords(currentRows, [changed], [
      "126GB-211223",
    ])
    expect(result).toEqual([changed])
  })

  it("includes newly added records alongside surviving current rows", () => {
    const added = makeWheel({
      partNumber: "126TB-211225",
      finish: "TITANIUM",
      imageUrl: "https://cdn.example.com/wheels/126tb.jpg",
    })
    const result = computeSurvivingGroupRecords(currentRows, [added], [])
    expect(result.map((r) => r.partNumber).sort()).toEqual(
      ["126GB-211223", "126SB-211224", "126TB-211225"].sort()
    )
  })

  it("returns an empty array when every current row is removed and nothing is added", () => {
    const result = computeSurvivingGroupRecords(
      currentRows,
      [],
      ["126GB-211223", "126SB-211224"]
    )
    expect(result).toEqual([])
  })
})
