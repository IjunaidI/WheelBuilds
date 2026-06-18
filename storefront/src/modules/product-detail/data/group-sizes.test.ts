import { describe, it, expect } from "vitest"
import {
  groupVariantsIntoSizes,
  sizesForBoltPattern,
  pickDefaultSize,
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
