import { describe, it, expect } from "vitest"
import { mapTireDetail } from "../map-tire-detail"

const product = {
  id: "prod_t1", handle: "falken-wildpeak-at4w", title: "Falken WDPEAK AT4W",
  description: "All-terrain.", thumbnail: "t.jpg", weight: 14515, // grams → ~32 lb
  metadata: { brand: "Falken", product_type: "tire", tire_prefix: "LT" },
  variants: [
    { id: "v1", calculated_price: { calculated_amount: 462 }, inventory_quantity: 8,
      metadata: { size_label: "305/45R22 118S", canonical_size: "305/45R22", rim_diameter_in: 22,
        tire_width_mm: 305, aspect_ratio: 45, load_index: 118, speed_rating: "S", ply_rating: "E", construction_type: "R" } },
    { id: "v2", calculated_price: { calculated_amount: 405 }, inventory_quantity: 0,
      metadata: { size_label: "305/50R20 120T", canonical_size: "305/50R20", rim_diameter_in: 20,
        tire_width_mm: 305, aspect_ratio: 50, load_index: 120, speed_rating: "T", ply_rating: "E", construction_type: "R" } },
  ],
}

describe("mapTireDetail", () => {
  it("builds a TireProductDetail with kind, from-price, rims, size options, specs", () => {
    const d = mapTireDetail(product as any)
    expect(d.kind).toBe("tire")
    expect(d.brand).toBe("Falken")
    expect(d.name).toBe("Falken WDPEAK AT4W")
    expect(d.priceCents).toBe(40500) // min non-zero
    expect(d.tireType).toBe("light-truck") // LT prefix
    expect(d.rimDiameters).toEqual([20, 22])
    expect(d.sizeOptions.map((s) => s.variantId)).toEqual(["v2", "v1"]) // sorted rim 20 then 22
    expect(d.specs.weightLb).toBe(32) // 14515/453.592 ≈ 32
    expect(d.specs.tireType).toBe("light-truck")
    expect(d.specs.plyRating).toBe("E")
  })
})
