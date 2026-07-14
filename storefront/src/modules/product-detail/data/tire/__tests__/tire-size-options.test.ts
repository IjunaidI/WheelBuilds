import { describe, it, expect } from "vitest"
import { buildTireSizeOptions, sizesForRim, pickDefaultTireSize } from "../tire-size-options"

const variant = (over: any = {}) => ({
  id: over.id ?? "var_1",
  calculated_price: { calculated_amount: over.amount ?? 462 },
  inventory_quantity: over.qty ?? 8,
  metadata: {
    size_label: over.size_label ?? "305/45R22 118S", canonical_size: over.canonical_size ?? "305/45R22",
    rim_diameter_in: over.rim ?? 22, tire_width_mm: over.width ?? 305, aspect_ratio: over.aspect ?? 45,
    load_index: over.load ?? 118, speed_rating: over.speed ?? "S", ply_rating: over.ply ?? null,
    construction_type: over.construction ?? "R",
  },
})

describe("buildTireSizeOptions", () => {
  it("maps a variant to a TireSizeOption with cents price + availability + variantId", () => {
    const [o] = buildTireSizeOptions([variant()] as any)
    expect(o).toMatchObject({
      sizeLabel: "305/45R22 118S", canonicalSize: "305/45R22", rimDiameterIn: 22,
      sectionWidthMm: 305, aspectRatio: 45, loadIndex: 118, speedRating: "S",
      variantId: "var_1", priceCents: 46200, availability: "in_stock", quantity: 8,
    })
  })
  it("marks out_of_stock at qty 0 and low_stock at/under the threshold", () => {
    expect(buildTireSizeOptions([variant({ qty: 0 })] as any)[0].availability).toBe("out_of_stock")
    expect(buildTireSizeOptions([variant({ qty: 2 })] as any)[0].availability).toBe("low_stock")
  })
  it("sorts by rim then width then aspect", () => {
    const opts = buildTireSizeOptions([
      variant({ id: "a", rim: 22, width: 305, aspect: 50, size_label: "305/50R22" }),
      variant({ id: "b", rim: 20, width: 305, aspect: 45, size_label: "305/45R20" }),
      variant({ id: "c", rim: 22, width: 305, aspect: 45, size_label: "305/45R22" }),
    ] as any)
    expect(opts.map((o) => o.variantId)).toEqual(["b", "c", "a"])
  })
})

describe("sizesForRim", () => {
  it("filters to a rim", () => {
    const opts = buildTireSizeOptions([
      variant({ id: "a", rim: 22 }), variant({ id: "b", rim: 20 }),
    ] as any)
    expect(sizesForRim(opts, 20).map((o) => o.variantId)).toEqual(["b"])
  })
})

describe("pickDefaultTireSize", () => {
  it("picks the first in-stock size, else the first", () => {
    const opts = buildTireSizeOptions([
      variant({ id: "out", qty: 0 }), variant({ id: "in", qty: 5, size_label: "x", rim: 22, width: 306 }),
    ] as any)
    expect(pickDefaultTireSize(opts)?.variantId).toBe("in")
    const allOut = buildTireSizeOptions([variant({ id: "z", qty: 0 })] as any)
    expect(pickDefaultTireSize(allOut)?.variantId).toBe("z")
  })
})
