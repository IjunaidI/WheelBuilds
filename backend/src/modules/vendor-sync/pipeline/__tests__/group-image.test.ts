import {
  computeGroupImageFields,
  computeSurvivingGroupRecords,
  groupImageFieldsDiffer,
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

  // Regression (WB-115 thumbnail-recompute follow-up review, finding 1):
  // reproduces the reviewer's exact scenario. Run N drops finish A (dead
  // image); run N+1 is a routine price update on surviving finish B, which
  // lands the group in changed_part_numbers again. A's current row is still
  // tagged with the group and is NOT in THIS pass's removed_part_numbers
  // (it was removed last run), so a naive "exclude only this pass's
  // removals" rule lets it leak back into survivors -- and because it sorts
  // lowest by part_number, pickGroupRepresentative re-picks its dead image.
  // A row's own discontinued_at (set on the prior run) must exclude it
  // regardless of which pass set it.
  it("excludes a current row already discontinued in a PRIOR run even when this pass's removed_part_numbers is empty", () => {
    const rows = [
      {
        part_number: "126GB-211223",
        normalized: makeWheel({ partNumber: "126GB-211223" }),
        discontinued_at: new Date("2026-07-01T00:00:00.000Z"),
      },
      {
        part_number: "126SB-211224",
        normalized: makeWheel({
          partNumber: "126SB-211224",
          finish: "SATIN BLACK",
          imageUrl: "https://cdn.example.com/wheels/126sb-old.jpg",
        }),
        discontinued_at: null,
      },
    ]
    // Run N+1: a routine price update on the surviving finish B.
    const changedB = makeWheel({
      partNumber: "126SB-211224",
      finish: "SATIN BLACK",
      imageUrl: "https://cdn.example.com/wheels/126sb-old.jpg",
      msrpUsd: 340,
    })

    const result = computeSurvivingGroupRecords(rows, [changedB], [])

    expect(result.map((r) => r.partNumber)).toEqual(["126SB-211224"])

    // And the representative pick must not revert to A's dead image.
    const { thumbnail } = computeGroupImageFields(result)
    expect(thumbnail).toBe("https://cdn.example.com/wheels/126sb-old.jpg")
  })
})

describe("groupImageFieldsDiffer", () => {
  it("returns false when thumbnail and images match, regardless of images order", () => {
    const current = {
      thumbnail: "https://cdn.example.com/a.jpg",
      images: [{ url: "https://cdn.example.com/b.jpg" }, { url: "https://cdn.example.com/a.jpg" }],
    }
    const computed = {
      thumbnail: "https://cdn.example.com/a.jpg",
      images: [{ url: "https://cdn.example.com/a.jpg" }, { url: "https://cdn.example.com/b.jpg" }],
    }
    expect(groupImageFieldsDiffer(current, computed)).toBe(false)
  })

  it("treats a null current thumbnail as equivalent to an undefined computed thumbnail", () => {
    const current = { thumbnail: null, images: [] }
    const computed = { thumbnail: undefined, images: [] }
    expect(groupImageFieldsDiffer(current, computed)).toBe(false)
  })

  it("returns true when the thumbnail differs", () => {
    const current = {
      thumbnail: "https://cdn.example.com/dead.jpg",
      images: [{ url: "https://cdn.example.com/dead.jpg" }],
    }
    const computed = {
      thumbnail: "https://cdn.example.com/alive.jpg",
      images: [{ url: "https://cdn.example.com/alive.jpg" }],
    }
    expect(groupImageFieldsDiffer(current, computed)).toBe(true)
  })

  it("returns true when the images set gained or lost a URL", () => {
    const current = {
      thumbnail: "https://cdn.example.com/a.jpg",
      images: [{ url: "https://cdn.example.com/a.jpg" }],
    }
    const computed = {
      thumbnail: "https://cdn.example.com/a.jpg",
      images: [
        { url: "https://cdn.example.com/a.jpg" },
        { url: "https://cdn.example.com/b.jpg" },
      ],
    }
    expect(groupImageFieldsDiffer(current, computed)).toBe(true)
  })

  it("treats a missing current.images as an empty set", () => {
    const current = { thumbnail: undefined, images: undefined }
    const computed = { thumbnail: undefined, images: [] }
    expect(groupImageFieldsDiffer(current, computed)).toBe(false)
  })
})
