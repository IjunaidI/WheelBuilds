import { canonicalTireSize, tireSizeLabel, classifyTireType } from "../pipeline/tire-facets"
import { TireNormalizedRecord } from "../adapters/types"

function tire(overrides: Partial<TireNormalizedRecord> = {}): TireNormalizedRecord {
  return {
    productType: "tire",
    partNumber: "F1",
    vendorCode: "wheelpros-tires",
    title: "WDPEAK AT4W 305/45R22 118S",
    brand: "Falken",
    imageUrl: null,
    invOrderType: "ST",
    totalQoh: 1,
    msrpUsd: 100,
    mapUsd: 0,
    runDateVendor: new Date("2026-05-17T00:00:00.000Z"),
    stockByWarehouse: {},
    groupKey: "Falken|WDPEAK AT4W",
    manufacturerPartNumber: null,
    division: null,
    tireWidthMm: 305,
    aspectRatio: 45,
    constructionType: "R",
    rimDiameterIn: 22,
    loadIndex: 118,
    speedRating: "S",
    plyRating: null,
    tirePrefix: null,
    sizeToken: "305/45R22",
    ...overrides,
  } as TireNormalizedRecord
}

describe("canonicalTireSize", () => {
  it("returns the size token uppercased", () => {
    expect(canonicalTireSize(tire())).toBe("305/45R22")
  })
  it("strips the Z speed modifier", () => {
    expect(canonicalTireSize(tire({ sizeToken: "255/35ZR19" }))).toBe("255/35R19")
  })
  it("keeps the LT inch token", () => {
    expect(canonicalTireSize(tire({ sizeToken: "LT37X12.50R18" }))).toBe("LT37X12.50R18")
  })
  it("returns null when there is no size token", () => {
    expect(canonicalTireSize(tire({ sizeToken: null }))).toBeNull()
  })
})

describe("tireSizeLabel", () => {
  it("appends the service description", () => {
    expect(tireSizeLabel(tire())).toBe("305/45R22 118S")
  })
  it("omits service when absent", () => {
    expect(tireSizeLabel(tire({ loadIndex: null, speedRating: null }))).toBe("305/45R22")
  })
  it("falls back to the part number when size is null", () => {
    expect(tireSizeLabel(tire({ sizeToken: null, partNumber: "F9" }))).toBe("F9")
  })
})

describe("classifyTireType", () => {
  it("classifies metric as passenger", () => {
    expect(classifyTireType(tire())).toBe("passenger")
  })
  it("classifies LT prefix as light-truck", () => {
    expect(classifyTireType(tire({ tirePrefix: "LT", tireWidthMm: null, aspectRatio: null, constructionType: "R" }))).toBe("light-truck")
  })
  it("classifies inch-format (no width, has construction) as light-truck", () => {
    expect(classifyTireType(tire({ tirePrefix: null, tireWidthMm: null, aspectRatio: null, constructionType: "R", sizeToken: "LT37X12.50R18" }))).toBe("light-truck")
  })
  it("classifies bias/ag (no width, no construction) as other", () => {
    expect(classifyTireType(tire({ tirePrefix: null, tireWidthMm: null, aspectRatio: null, constructionType: null, plyRating: "8PR", sizeToken: "12.4-24" }))).toBe("other")
  })
})
