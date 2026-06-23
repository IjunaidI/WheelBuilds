import { describe, it, expect } from "vitest"
import {
  groupVariantsIntoSizes,
  sizesForBoltPattern,
  pickDefaultSize,
  boresFor,
  loadsFor,
  loadsForBore,
  resolveLeafVariant,
} from "./group-sizes"

// Minimal variant factory mirroring the Medusa Store API shape the loader reads.
function variant(
  id: string,
  diameter: number,
  width: number,
  offset: number,
  bolt: string,
  qty: number,
  priceMajor: number
) {
  return {
    id,
    metadata: {
      wheel_diameter_in: diameter,
      wheel_width_in: width,
      offset_mm: offset,
      bolt_pattern_raw: bolt,
    },
    inventory_quantity: qty,
    calculated_price: { calculated_amount: priceMajor },
  } as any
}

describe("groupVariantsIntoSizes — bolt-pattern scoping", () => {
  it("keeps the same Diameter×Width in two patterns as TWO size options", () => {
    const sizes = groupVariantsIntoSizes(
      [
        variant("v_a", 20, 9, 18, "5x114.3", 10, 300),
        variant("v_b", 20, 9, 35, "6x139.7", 10, 400),
      ],
      28
    )
    expect(sizes).toHaveLength(2)
    const fivelug = sizes.find((s) => s.boltPattern === "5x114.3")!
    const sixlug = sizes.find((s) => s.boltPattern === "6x139.7")!
    expect(fivelug.offsetVariants?.map((o) => o.variantId)).toEqual(["v_a"])
    expect(sixlug.offsetVariants?.map((o) => o.variantId)).toEqual(["v_b"])
    expect(fivelug.priceCentsOverride).toBe(30000)
    expect(sixlug.priceCentsOverride).toBe(40000)
  })

  it("accumulates sibling offsets WITHIN a pattern, not across patterns", () => {
    const sizes = groupVariantsIntoSizes(
      [
        variant("v_a", 20, 9, 18, "5x114.3", 10, 300),
        variant("v_b", 20, 9, 35, "5x114.3", 2, 320),
        variant("v_c", 20, 9, 40, "6x139.7", 10, 400),
      ],
      28
    )
    const fivelug = sizes.find((s) => s.boltPattern === "5x114.3")!
    expect(fivelug.offsetVariants).toHaveLength(2)
    // best-availability across the 5x114.3 siblings (in_stock beats low_stock)
    expect(fivelug.availability).toBe("in_stock")
    // min non-zero price within the pattern
    expect(fivelug.priceCentsOverride).toBe(30000)
  })

  it("treats a single-pattern product exactly as one size per distinct D×W", () => {
    const sizes = groupVariantsIntoSizes(
      [
        variant("v_a", 20, 9, 18, "5x114.3", 10, 300),
        variant("v_b", 20, 10, 20, "5x114.3", 10, 320),
      ],
      28
    )
    expect(sizes).toHaveLength(2)
    expect(sizes.every((s) => s.boltPattern === "5x114.3")).toBe(true)
  })
})

describe("sizesForBoltPattern", () => {
  const base = groupVariantsIntoSizes(
    [
      variant("v_a", 20, 9, 18, "5x114.3", 10, 300),
      variant("v_b", 20, 9, 35, "6x139.7", 10, 400),
    ],
    28
  )
  it("returns only the matching pattern's sizes", () => {
    const r = sizesForBoltPattern(base, "6x139.7")
    expect(r).toHaveLength(1)
    expect(r[0].boltPattern).toBe("6x139.7")
  })
  it("falls back to ALL sizes when the pattern is absent/unknown", () => {
    expect(sizesForBoltPattern(base, "8x180")).toHaveLength(2)
  })
})

describe("pickDefaultSize", () => {
  it("returns the first in-stock size", () => {
    const sizes = groupVariantsIntoSizes(
      [
        variant("v_oos", 20, 9, 18, "5x114.3", 0, 300),
        variant("v_ok", 20, 10, 20, "5x114.3", 10, 320),
      ],
      28
    )
    expect(pickDefaultSize(sizes).diameter).toBe(20)
    expect(pickDefaultSize(sizes).width).toBe(10)
  })
  it("falls back to the first when all are out of stock", () => {
    const sizes = groupVariantsIntoSizes(
      [variant("v_oos", 20, 9, 18, "5x114.3", 0, 300)],
      28
    )
    expect(pickDefaultSize(sizes).width).toBe(9)
  })
})

// Optional bore/load extension of the factory (defaults keep existing tests valid).
function variantCB(
  id: string, diameter: number, width: number, offset: number, bolt: string,
  qty: number, priceMajor: number, centerBore: number | null, load: number | null
) {
  return {
    id,
    metadata: {
      wheel_diameter_in: diameter, wheel_width_in: width, offset_mm: offset,
      bolt_pattern_raw: bolt, center_bore_mm: centerBore, load_rating_lb: load,
    },
    inventory_quantity: qty,
    calculated_price: { calculated_amount: priceMajor },
  } as any
}

describe("center-bore / load-rating leaf resolution (WB-051)", () => {
  const sizes = groupVariantsIntoSizes(
    [
      variantCB("v_a", 22, 8.25, 105, "8x6.5", 0, 360, 78.1, 2500),
      variantCB("v_b", 22, 8.25, 105, "8x6.5", 8, 360, 87.1, 2500),
    ],
    40
  )
  const size = sizes[0]

  it("keeps both center-bore variants under one (size, offset)", () => {
    expect(size.offsetVariants).toHaveLength(2)
    expect(boresFor(size.offsetVariants!, 105)).toEqual([78.1, 87.1])
  })
  it("resolves the exact variant by (offset, centerBore)", () => {
    expect(resolveLeafVariant(size, 105, 87.1)?.variantId).toBe("v_b")
    expect(resolveLeafVariant(size, 105, 78.1)?.variantId).toBe("v_a")
  })
  it("prefers an in-stock candidate when bore is unspecified", () => {
    expect(resolveLeafVariant(size, 105)?.variantId).toBe("v_b") // v_b has stock
  })
  it("a single-bore (size, offset) reports no branch", () => {
    const single = groupVariantsIntoSizes(
      [variantCB("v_x", 20, 9, 18, "5x114.3", 5, 300, 73.1, 2000)],
      28
    )[0]
    expect(boresFor(single.offsetVariants!, 18)).toEqual([73.1])
    expect(loadsFor(single.offsetVariants!, 18)).toEqual([2000])
  })
})

describe("loadsForBore (cascade off bore) — WB-051", () => {
  const size = groupVariantsIntoSizes(
    [
      variantCB("v_a", 22, 8.25, 105, "8x6.5", 5, 360, 78.1, 2200),
      variantCB("v_b", 22, 8.25, 105, "8x6.5", 5, 360, 78.1, 2500),
      variantCB("v_c", 22, 8.25, 105, "8x6.5", 5, 360, 87.1, 3000),
    ],
    40
  )[0]
  it("returns only loads available for the selected bore", () => {
    expect(loadsForBore(size.offsetVariants!, 105, 78.1)).toEqual([2200, 2500])
    expect(loadsForBore(size.offsetVariants!, 105, 87.1)).toEqual([3000])
  })
  it("returns all loads at the offset when bore is unspecified (wildcard)", () => {
    expect(loadsForBore(size.offsetVariants!, 105, null)).toEqual([2200, 2500, 3000])
  })
})
