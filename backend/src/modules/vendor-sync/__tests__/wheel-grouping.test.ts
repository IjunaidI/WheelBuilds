import {
  WHEEL_OPTION_TITLES,
  buildGroupHandle,
  buildGroupTitle,
  buildProductOptions,
  buildVariantOptions,
  findAxisCollision,
  formatNumericOption,
  pickGroupRepresentative,
  slugify,
  variantAxisKey,
} from "../pipeline/wheel-grouping"
import { WheelNormalizedRecord } from "../adapters/types"

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
    totalQoh: 0,
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

describe("slugify", () => {
  it("lowercases and replaces non-alphanumeric with hyphens", () => {
    expect(slugify("Performance Replicas")).toBe("performance-replicas")
    expect(slugify("GLOSS BLACK")).toBe("gloss-black")
    expect(slugify("DUB 1PC")).toBe("dub-1pc")
  })

  it("strips leading and trailing hyphens", () => {
    expect(slugify("  Hello!  ")).toBe("hello")
    expect(slugify("---test---")).toBe("test")
  })

  it("preserves digits", () => {
    expect(slugify("Tuff T04")).toBe("tuff-t04")
  })
})

describe("formatNumericOption", () => {
  it("keeps integers as integers", () => {
    expect(formatNumericOption(20)).toBe("20")
    expect(formatNumericOption(-12)).toBe("-12")
  })

  it("trims trailing zeros for fractional values", () => {
    expect(formatNumericOption(9.5)).toBe("9.5")
    expect(formatNumericOption(8.5)).toBe("8.5")
  })

  it("produces the same string for the same value across calls", () => {
    expect(formatNumericOption(10)).toBe(formatNumericOption(10))
    expect(formatNumericOption(9.5)).toBe(formatNumericOption(9.5))
  })
})

describe("variantAxisKey", () => {
  it("combines all four axes into a stable key", () => {
    const r = makeWheel()
    expect(variantAxisKey(r)).toBe("5X120|20|10|23")
  })

  it("yields different keys when any axis differs", () => {
    const base = makeWheel()
    expect(variantAxisKey(base)).not.toBe(
      variantAxisKey(makeWheel({ offsetMm: 35 }))
    )
    expect(variantAxisKey(base)).not.toBe(
      variantAxisKey(makeWheel({ diameterIn: 22 }))
    )
    expect(variantAxisKey(base)).not.toBe(
      variantAxisKey(makeWheel({ widthIn: 11 }))
    )
    expect(variantAxisKey(base)).not.toBe(
      variantAxisKey(makeWheel({ boltPatternRaw: "6X5.5" }))
    )
  })
})

describe("findAxisCollision", () => {
  it("returns null for a group with all-distinct axis tuples", () => {
    const records = [
      makeWheel({ partNumber: "A", offsetMm: 23 }),
      makeWheel({ partNumber: "B", offsetMm: 35 }),
      makeWheel({ partNumber: "C", diameterIn: 22, offsetMm: 23 }),
    ]
    expect(findAxisCollision(records)).toBeNull()
  })

  it("reports a collision and includes both colliding SKUs", () => {
    const records = [
      makeWheel({ partNumber: "A" }),
      makeWheel({ partNumber: "B" }),
    ]
    const result = findAxisCollision(records)
    expect(result).not.toBeNull()
    expect(result?.partNumbers).toEqual(["A", "B"])
    expect(result?.axisKey).toBe("5X120|20|10|23")
  })

  it("flags hidden distinction when colliding SKUs differ on centerBore", () => {
    const records = [
      makeWheel({ partNumber: "A", centerBoreMm: 71.5 }),
      makeWheel({ partNumber: "B", centerBoreMm: 67.1 }),
    ]
    const result = findAxisCollision(records)
    expect(result?.hasHiddenDistinction).toBe(true)
    expect(result?.hiddenFieldsDiffering).toEqual(["centerBoreMm"])
  })

  it("flags hidden distinction when colliding SKUs differ on loadRating", () => {
    const records = [
      makeWheel({ partNumber: "A", loadRatingLb: 2200 }),
      makeWheel({ partNumber: "B", loadRatingLb: 2500 }),
    ]
    const result = findAxisCollision(records)
    expect(result?.hasHiddenDistinction).toBe(true)
    expect(result?.hiddenFieldsDiffering).toEqual(["loadRatingLb"])
  })

  it("does not flag hidden distinction when only nullable hidden fields are null on all sides", () => {
    const records = [
      makeWheel({ partNumber: "A", centerBoreMm: null, loadRatingLb: null }),
      makeWheel({ partNumber: "B", centerBoreMm: null, loadRatingLb: null }),
    ]
    const result = findAxisCollision(records)
    expect(result?.hasHiddenDistinction).toBe(false)
  })
})

describe("buildProductOptions", () => {
  it("emits the four wheel axes with deduplicated values", () => {
    const records = [
      makeWheel({ partNumber: "A", diameterIn: 20, widthIn: 10, offsetMm: 23 }),
      makeWheel({ partNumber: "B", diameterIn: 20, widthIn: 10, offsetMm: 35 }),
      makeWheel({ partNumber: "C", diameterIn: 20, widthIn: 11, offsetMm: 43 }),
      makeWheel({ partNumber: "D", diameterIn: 22, widthIn: 9, offsetMm: 30 }),
    ]
    const options = buildProductOptions(records)

    const byTitle = Object.fromEntries(options.map((o) => [o.title, o.values]))
    expect(byTitle[WHEEL_OPTION_TITLES.BOLT_PATTERN]).toEqual(["5X120"])
    expect(byTitle[WHEEL_OPTION_TITLES.DIAMETER]).toEqual(["20", "22"])
    expect(byTitle[WHEEL_OPTION_TITLES.WIDTH]).toEqual(["9", "10", "11"])
    expect(byTitle[WHEEL_OPTION_TITLES.OFFSET]).toEqual(["23", "30", "35", "43"])
  })

  it("includes BLANK bolt pattern as an opaque value", () => {
    const records = [
      makeWheel({ boltPatternRaw: "5X120" }),
      makeWheel({ boltPatternRaw: "BLANK" }),
    ]
    const options = buildProductOptions(records)
    const boltOpt = options.find(
      (o) => o.title === WHEEL_OPTION_TITLES.BOLT_PATTERN
    )!
    expect(boltOpt.values.sort()).toEqual(["5X120", "BLANK"])
  })
})

describe("buildVariantOptions", () => {
  it("maps to the same option titles used by buildProductOptions", () => {
    const r = makeWheel()
    const variantOpts = buildVariantOptions(r)
    const productOpts = buildProductOptions([r])

    for (const opt of productOpts) {
      expect(variantOpts[opt.title]).toBeDefined()
      expect(opt.values).toContain(variantOpts[opt.title])
    }
  })

  it("produces strings that round-trip with formatNumericOption", () => {
    const r = makeWheel({ widthIn: 8.5, offsetMm: -12 })
    const opts = buildVariantOptions(r)
    expect(opts[WHEEL_OPTION_TITLES.WIDTH]).toBe("8.5")
    expect(opts[WHEEL_OPTION_TITLES.OFFSET]).toBe("-12")
  })
})

describe("buildGroupTitle", () => {
  it("joins brand + displayStyleNo + finish with spaces when grouped", () => {
    const r = makeWheel({
      brand: "Performance Replicas",
      displayStyleNo: "126",
      finish: "GLOSS BLACK",
    })
    expect(buildGroupTitle(r)).toBe("Performance Replicas 126 GLOSS BLACK")
  })

  it("omits finish when blank but model is present", () => {
    const r = makeWheel({
      brand: "Asanti Forged",
      displayStyleNo: "172",
      finish: null,
    })
    expect(buildGroupTitle(r)).toBe("Asanti Forged 172")
  })

  it("falls back to the CSV PartDescription when displayStyleNo is empty", () => {
    const r = makeWheel({
      displayStyleNo: null,
      title: "NOMAD SPLIT 17X8.5 5X5 71 -12 MTL-BLK",
    })
    expect(buildGroupTitle(r)).toBe("NOMAD SPLIT 17X8.5 5X5 71 -12 MTL-BLK")
  })
})

describe("buildGroupHandle", () => {
  it("derives from brand + displayStyleNo + finish, slugified", () => {
    const r = makeWheel({
      brand: "Performance Replicas",
      displayStyleNo: "126",
      finish: "GLOSS BLACK",
    })
    expect(buildGroupHandle(r)).toBe("performance-replicas-126-gloss-black")
  })

  it("omits finish in the handle when blank", () => {
    const r = makeWheel({
      brand: "Asanti Forged",
      displayStyleNo: "172",
      finish: null,
    })
    expect(buildGroupHandle(r)).toBe("asanti-forged-172")
  })

  it("derives from brand + partNumber for per-SKU fallback rows", () => {
    const r = makeWheel({
      brand: "DUB 1PC",
      displayStyleNo: null,
      partNumber: "Y305198543+2515",
    })
    expect(buildGroupHandle(r)).toBe("dub-1pc-y305198543-2515")
  })

  it("does NOT collide for two T-named tuff styles (T04 vs T13)", () => {
    // Style column would collapse T04/T07/T13 to "T-13" but DisplayStyleNo
    // keeps them apart; the handle must reflect DisplayStyleNo.
    const a = makeWheel({
      brand: "Tuff",
      displayStyleNo: "T04",
      finish: "FLAT BLACK",
      style: "T-13",
    })
    const b = makeWheel({
      brand: "Tuff",
      displayStyleNo: "T13",
      finish: "FLAT BLACK",
      style: "T-13",
    })
    expect(buildGroupHandle(a)).not.toBe(buildGroupHandle(b))
  })
})

describe("pickGroupRepresentative", () => {
  it("returns the lexicographically smallest partNumber for determinism", () => {
    const records = [
      makeWheel({ partNumber: "126GB-211235" }),
      makeWheel({ partNumber: "126GB-211223" }),
      makeWheel({ partNumber: "126GB-2110043" }),
    ]
    expect(pickGroupRepresentative(records).partNumber).toBe("126GB-2110043")
  })

  it("returns the only record when the group has one member", () => {
    const r = makeWheel({ partNumber: "ONLY-ONE" })
    expect(pickGroupRepresentative([r]).partNumber).toBe("ONLY-ONE")
  })
})
