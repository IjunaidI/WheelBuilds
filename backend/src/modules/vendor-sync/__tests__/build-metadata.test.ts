import { buildProductMetadata } from "../pipeline/build-metadata"
import { WheelNormalizedRecord, TireNormalizedRecord } from "../adapters/types"

function makeWheelRecord(
  overrides: Partial<WheelNormalizedRecord> = {}
): WheelNormalizedRecord {
  return {
    productType: "wheel",
    partNumber: "000000000001058059",
    vendorCode: "wheelpros-wheels",
    title: "NOMAD SPLIT 17X8.5 5X5 71 -12 MTL-BLK",
    brand: "Teraflex",
    imageUrl: "https://cdn.example.com/wheels/058-blk.jpg",
    invOrderType: "ST",
    totalQoh: 20,
    msrpUsd: 369.99,
    mapUsd: 369.99,
    runDateVendor: new Date("2026-05-07T22:06:48"),
    stockByWarehouse: { "1001": 10, "1002": 5, "1003": 5 },
    displayStyleNo: "058",
    finish: "Matte Black",
    diameterIn: 17,
    widthIn: 8.5,
    boltCount: 5,
    boltCircleIn: 5.0,
    offsetMm: -12,
    centerBoreMm: 71.5,
    loadRatingLb: 2250,
    shippingWeightLb: 32,
    style: "NOMAD",
    ...overrides,
  }
}

function makeTireRecord(
  overrides: Partial<TireNormalizedRecord> = {}
): TireNormalizedRecord {
  return {
    productType: "tire",
    partNumber: "000000000001100200",
    vendorCode: "wheelpros-tires",
    title: "FALKEN WILDPEAK AT3W 285/70R17 116T",
    brand: "Falken",
    imageUrl: "https://cdn.example.com/tires/at3w.jpg",
    invOrderType: "ST",
    totalQoh: 50,
    msrpUsd: 249.99,
    mapUsd: 229.99,
    runDateVendor: new Date("2026-05-07T22:06:48"),
    stockByWarehouse: { "1001": 30, "1002": 20 },
    manufacturerPartNumber: "28065517",
    division: "Falken",
    tireWidthMm: 285,
    aspectRatio: 70,
    constructionType: "R",
    rimDiameterIn: 17,
    loadIndex: 116,
    speedRating: "T",
    plyRating: null,
    tirePrefix: "P",
    ...overrides,
  }
}

describe("buildProductMetadata", () => {
  it("includes common base fields for wheel records", () => {
    const meta = buildProductMetadata(makeWheelRecord())
    expect(meta.vendor_code).toBe("wheelpros-wheels")
    expect(meta.vendor_part_number).toBe("000000000001058059")
    expect(meta.vendor_map_usd).toBe(369.99)
    expect(meta.vendor_inv_order_type).toBe("ST")
    expect(meta.product_type).toBe("wheel")
  })

  it("includes common base fields for tire records", () => {
    const meta = buildProductMetadata(makeTireRecord())
    expect(meta.vendor_code).toBe("wheelpros-tires")
    expect(meta.vendor_part_number).toBe("000000000001100200")
    expect(meta.vendor_map_usd).toBe(229.99)
    expect(meta.vendor_inv_order_type).toBe("ST")
    expect(meta.product_type).toBe("tire")
  })

  it("produces wheel-specific metadata fields", () => {
    const meta = buildProductMetadata(makeWheelRecord())
    expect(meta.wheel_diameter_in).toBe(17)
    expect(meta.wheel_width_in).toBe(8.5)
    expect(meta.bolt_count).toBe(5)
    expect(meta.bolt_circle_in).toBe(5.0)
    expect(meta.offset_mm).toBe(-12)
    expect(meta.center_bore_mm).toBe(71.5)
    expect(meta.load_rating_lb).toBe(2250)
    expect(meta.finish).toBe("Matte Black")
    expect(meta.style).toBe("NOMAD")
    expect(meta.display_style_no).toBe("058")
  })

  it("produces tire-specific metadata fields", () => {
    const meta = buildProductMetadata(makeTireRecord())
    expect(meta.manufacturer_part_number).toBe("28065517")
    expect(meta.vendor_division).toBe("Falken")
    expect(meta.tire_width_mm).toBe(285)
    expect(meta.aspect_ratio).toBe(70)
    expect(meta.construction_type).toBe("R")
    expect(meta.rim_diameter_in).toBe(17)
    expect(meta.load_index).toBe(116)
    expect(meta.speed_rating).toBe("T")
    expect(meta.ply_rating).toBeNull()
    expect(meta.tire_prefix).toBe("P")
  })

  it("does not include tire fields in wheel metadata", () => {
    const meta = buildProductMetadata(makeWheelRecord())
    expect(meta).not.toHaveProperty("manufacturer_part_number")
    expect(meta).not.toHaveProperty("tire_width_mm")
    expect(meta).not.toHaveProperty("aspect_ratio")
    expect(meta).not.toHaveProperty("rim_diameter_in")
  })

  it("does not include wheel fields in tire metadata", () => {
    const meta = buildProductMetadata(makeTireRecord())
    expect(meta).not.toHaveProperty("wheel_diameter_in")
    expect(meta).not.toHaveProperty("wheel_width_in")
    expect(meta).not.toHaveProperty("bolt_count")
    expect(meta).not.toHaveProperty("finish")
  })

  it("handles nullable wheel fields", () => {
    const meta = buildProductMetadata(
      makeWheelRecord({
        centerBoreMm: null,
        loadRatingLb: null,
        finish: null,
        style: null,
        displayStyleNo: null,
      })
    )
    expect(meta.center_bore_mm).toBeNull()
    expect(meta.load_rating_lb).toBeNull()
    expect(meta.finish).toBeNull()
    expect(meta.style).toBeNull()
    expect(meta.display_style_no).toBeNull()
  })

  it("handles nullable tire fields", () => {
    const meta = buildProductMetadata(
      makeTireRecord({
        manufacturerPartNumber: null,
        division: null,
        tireWidthMm: null,
        aspectRatio: null,
        constructionType: null,
        rimDiameterIn: null,
        loadIndex: null,
        speedRating: null,
        plyRating: null,
        tirePrefix: null,
      })
    )
    expect(meta.manufacturer_part_number).toBeNull()
    expect(meta.vendor_division).toBeNull()
    expect(meta.tire_width_mm).toBeNull()
    expect(meta.aspect_ratio).toBeNull()
    expect(meta.construction_type).toBeNull()
    expect(meta.rim_diameter_in).toBeNull()
    expect(meta.load_index).toBeNull()
    expect(meta.speed_rating).toBeNull()
    expect(meta.ply_rating).toBeNull()
    expect(meta.tire_prefix).toBeNull()
  })
})
