import {
  TIRE_OPTION_TITLES,
  tireVariantAxisKey,
  buildTireProductOptions,
  buildTireVariantOptions,
  buildTireGroupTitle,
  buildTireGroupHandle,
  dedupeTireExactDuplicates,
} from "../pipeline/tire-grouping"
import { TireNormalizedRecord } from "../adapters/types"

function tire(overrides: Partial<TireNormalizedRecord> = {}): TireNormalizedRecord {
  return {
    productType: "tire", partNumber: "F1", vendorCode: "wheelpros-tires",
    title: "WDPEAK AT4W 305/45R22 118S", brand: "Falken", imageUrl: null,
    invOrderType: "ST", totalQoh: 1, msrpUsd: 100, mapUsd: 0,
    runDateVendor: new Date("2026-05-17T00:00:00.000Z"), stockByWarehouse: {},
    groupKey: "Falken|WDPEAK AT4W", model: "WDPEAK AT4W",
    manufacturerPartNumber: null, division: null,
    tireWidthMm: 305, aspectRatio: 45, constructionType: "R", rimDiameterIn: 22,
    loadIndex: 118, speedRating: "S", plyRating: null, tirePrefix: null,
    sizeToken: "305/45R22", ...overrides,
  } as TireNormalizedRecord
}

describe("tire grouping", () => {
  it("uses the size label as the variant axis", () => {
    expect(tireVariantAxisKey(tire())).toBe("305/45R22 118S")
  })

  it("builds one Size option with the union of labels, numerically-ish sorted", () => {
    const opts = buildTireProductOptions([
      tire({ sizeToken: "305/45R22", loadIndex: 118, speedRating: "S" }),
      tire({ sizeToken: "305/50R20", loadIndex: 120, speedRating: "T", partNumber: "F2" }),
    ])
    expect(opts).toHaveLength(1)
    expect(opts[0].title).toBe("Size")
    expect(opts[0].values).toEqual(["305/45R22 118S", "305/50R20 120T"])
  })

  it("maps a record to its variant option object", () => {
    expect(buildTireVariantOptions(tire())).toEqual({ Size: "305/45R22 118S" })
  })

  it("titles a grouped product as brand + model", () => {
    expect(buildTireGroupTitle(tire())).toBe("Falken WDPEAK AT4W")
  })

  it("titles a per-SKU fallback product with the raw description", () => {
    expect(buildTireGroupTitle(tire({ model: null, groupKey: "sku:F1" }))).toBe(
      "WDPEAK AT4W 305/45R22 118S"
    )
  })

  it("handles a grouped product from brand + model", () => {
    expect(buildTireGroupHandle(tire())).toBe("falken-wdpeak-at4w")
  })

  it("dedupes exact-duplicate size labels, keeping in-stock first", () => {
    const { survivors, dropped } = dedupeTireExactDuplicates([
      tire({ partNumber: "OUT", totalQoh: 0 }),
      tire({ partNumber: "IN", totalQoh: 5 }),
    ])
    expect(survivors.map((r) => r.partNumber)).toEqual(["IN"])
    expect(dropped.map((r) => r.partNumber)).toEqual(["OUT"])
  })
})
