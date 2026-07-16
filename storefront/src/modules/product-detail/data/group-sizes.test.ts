import { describe, it, expect } from "vitest"
import {
  groupVariantsIntoSizes,
  sizesForBoltPattern,
  pickDefaultSize,
  boresFor,
  loadsFor,
  loadsForBore,
  resolveLeafVariant,
  isRealBoltPattern,
  availabilityOf,
  boltPatternsForFinish,
  bestAvailabilityOffset,
  sizeKey,
  findBySizeKey,
  formatOffset,
  gramsToLb,
} from "./group-sizes"
import type { OffsetVariant } from "./types"

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

describe("groupVariantsIntoSizes — quantity threading (WB-090 P2/P18)", () => {
  it("keeps the raw inventory_quantity on each offset variant instead of discarding it after deriving availability", () => {
    const sizes = groupVariantsIntoSizes(
      [variant("v_a", 20, 9, 18, "5x114.3", 3, 300)],
      28
    )
    expect(sizes[0].offsetVariants?.[0].quantity).toBe(3)
  })
})

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
    expect(pickDefaultSize(sizes)!.diameter).toBe(20)
    expect(pickDefaultSize(sizes)!.width).toBe(10)
  })
  it("falls back to the first when all are out of stock", () => {
    const sizes = groupVariantsIntoSizes(
      [variant("v_oos", 20, 9, 18, "5x114.3", 0, 300)],
      28
    )
    expect(pickDefaultSize(sizes)!.width).toBe(9)
  })
  it("returns null (not undefined) for an empty size list", () => {
    expect(pickDefaultSize([])).toBeNull()
  })
})

describe("boltPatternsForFinish", () => {
  it("distinct patterns from a finish's sizes", () => {
    const sizes = [
      { boltPattern: "6x139.7", diameter: 20, width: 9, offsetMm: 18 },
      { boltPattern: "6x139.7", diameter: 22, width: 9, offsetMm: 12 },
      { boltPattern: "5x127", diameter: 20, width: 9, offsetMm: 18 },
    ] as any
    expect(boltPatternsForFinish(sizes)).toEqual(["6x139.7", "5x127"])
  })

  it("drops a placeholder ('') bolt pattern mixed with a real one (WB-048 regression)", () => {
    const sizes = [
      { boltPattern: "6x139.7", diameter: 20, width: 9, offsetMm: 18 },
      { boltPattern: "", diameter: 20, width: 10, offsetMm: 20 },
    ] as any
    expect(boltPatternsForFinish(sizes)).toEqual(["6x139.7"])
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

describe("isRealBoltPattern", () => {
  it("rejects placeholders (empty, whitespace, BLANK, N/A — any case)", () => {
    for (const raw of ["", "   ", "BLANK", "blank", "Blank", "N/A", "n/a", "NA", "na", "CALL", "call", null, undefined]) {
      expect(isRealBoltPattern(raw)).toBe(false)
    }
  })
  it("accepts real patterns", () => {
    for (const raw of ["5x114.3", "5X114.3", "6x139.7", "6X135/5.5"]) {
      expect(isRealBoltPattern(raw)).toBe(true)
    }
  })
})

describe("groupVariantsIntoSizes — placeholder bolt patterns", () => {
  it("keys a BLANK-pattern variant under '' so it stays reachable via the all-sizes fallback", () => {
    const sizes = groupVariantsIntoSizes(
      [variant("v_blank", 20, 9, 18, "BLANK", 10, 300)],
      28
    )
    expect(sizes).toHaveLength(1)
    expect(sizes[0].boltPattern).toBe("")
    // The fallback surfaces it when no real pattern is selected.
    expect(sizesForBoltPattern(sizes, "")).toHaveLength(1)
  })
})

describe("availabilityOf — configurable low-stock threshold", () => {
  it("uses the default threshold (4) when none is passed", () => {
    expect(availabilityOf(0)).toBe("out_of_stock")
    expect(availabilityOf(4)).toBe("low_stock")
    expect(availabilityOf(5)).toBe("in_stock")
  })
  it("honors an explicit threshold", () => {
    expect(availabilityOf(2, 2)).toBe("low_stock")
    expect(availabilityOf(3, 2)).toBe("in_stock")
  })
})

describe("bestAvailabilityOffset", () => {
  const ov = (
    value: number,
    availability: OffsetVariant["availability"],
    variantId = `v-${value}`
  ): OffsetVariant => ({
    value,
    backspaceIn: "",
    variantId,
    availability,
    centerBoreMm: null,
    loadRatingLb: null,
    quantity: 10,
  })

  it("picks the in-stock offset over a first-listed out-of-stock sibling", () => {
    const offsets = [ov(35, "out_of_stock"), ov(20, "in_stock")]
    expect(bestAvailabilityOffset(offsets)).toBe(20)
  })

  it("ties resolve to the first-listed offset", () => {
    expect(bestAvailabilityOffset([ov(35, "in_stock"), ov(20, "in_stock")])).toBe(35)
  })

  it("prefers low_stock over out_of_stock when nothing is fully in stock", () => {
    expect(bestAvailabilityOffset([ov(35, "out_of_stock"), ov(20, "low_stock")])).toBe(20)
  })

  it("returns undefined for an empty list (total — never crashes)", () => {
    expect(bestAvailabilityOffset([])).toBeUndefined()
  })
})

describe("groupVariantsIntoSizes — drops placeholder 0×0 sizes (WB-090 P19)", () => {
  it("drops a variant whose diameter is 0 (non-vendor / malformed metadata)", () => {
    const sizes = groupVariantsIntoSizes(
      [variant("v_zero_d", 0, 9, 18, "5x114.3", 10, 300)],
      28
    )
    expect(sizes).toHaveLength(0)
  })

  it("drops a variant whose width is 0", () => {
    const sizes = groupVariantsIntoSizes(
      [variant("v_zero_w", 20, 0, 18, "5x114.3", 10, 300)],
      28
    )
    expect(sizes).toHaveLength(0)
  })

  it("drops a fully-blank 0×0 row while keeping a real sibling size", () => {
    const sizes = groupVariantsIntoSizes(
      [
        variant("v_real", 20, 9, 18, "5x114.3", 10, 300),
        variant("v_blank", 0, 0, 0, "", 10, 0),
      ],
      28
    )
    expect(sizes).toHaveLength(1)
    expect(sizes[0].diameter).toBe(20)
    expect(sizes[0].width).toBe(9)
  })
})

describe("sizeKey", () => {
  it("encodes Diameter×Width|BoltPattern, not offset", () => {
    expect(sizeKey({ diameter: 20, width: 9, boltPattern: "5x114.3" })).toBe(
      "20x9|5x114.3"
    )
  })
})

describe("findBySizeKey — finish-switch continuity (WB-090 P15)", () => {
  it("finds the equivalent size (same D×W|pattern) in a different finish's list, even though the objects are never the same reference", () => {
    // Two independent groupVariantsIntoSizes calls — mirrors buildFinishOptions
    // building one matrix PER finish — so these SizeOption objects are never
    // object-identical even though they share the same D×W|pattern identity.
    const finishA = groupVariantsIntoSizes(
      [variant("v_a", 20, 9, 18, "5x114.3", 10, 300)],
      28
    )
    const finishB = groupVariantsIntoSizes(
      [variant("v_b", 20, 9, 35, "5x114.3", 5, 320)],
      28
    )
    expect(finishA[0]).not.toBe(finishB[0])
    const matched = findBySizeKey(finishB, finishA[0])
    expect(matched).toBe(finishB[0])
  })

  it("returns undefined when no equivalent size exists under the new finish (falls back to default)", () => {
    const finishA = groupVariantsIntoSizes(
      [variant("v_a", 20, 9, 18, "5x114.3", 10, 300)],
      28
    )
    const finishB = groupVariantsIntoSizes(
      [variant("v_b", 22, 10, 35, "6x139.7", 10, 320)],
      28
    )
    expect(findBySizeKey(finishB, finishA[0])).toBeUndefined()
  })

  it("returns undefined when current is null", () => {
    const finishB = groupVariantsIntoSizes(
      [variant("v_b", 20, 9, 18, "5x114.3", 10, 300)],
      28
    )
    expect(findBySizeKey(finishB, null)).toBeUndefined()
  })
})

describe("groupVariantsIntoSizes — defaultOffsetMm best-availability (WB-090 P1)", () => {
  it("resolves defaultOffsetMm to the in-stock sibling offset when the first-listed offset is OOS", () => {
    // v_a (ET35) is first-seen but OOS; v_b (ET20) is a sibling offset in stock.
    // Regression: the old static `defaultOffsetMm: offsetMm` (first-seen) would
    // pin the default to ET35 here, so the Status stat (size rollup, already
    // "in_stock") and the buy button (OOS ET35 variant) would disagree.
    const sizes = groupVariantsIntoSizes(
      [
        variant("v_a", 20, 9, 35, "5x114.3", 0, 300),
        variant("v_b", 20, 9, 20, "5x114.3", 10, 320),
      ],
      28
    )
    expect(sizes[0].defaultOffsetMm).toBe(20)
    expect(sizes[0].availability).toBe("in_stock")
  })

  it("keeps the first-listed offset as default when it already has the best availability", () => {
    const sizes = groupVariantsIntoSizes(
      [
        variant("v_a", 20, 9, 35, "5x114.3", 10, 300),
        variant("v_b", 20, 9, 20, "5x114.3", 0, 320),
      ],
      28
    )
    expect(sizes[0].defaultOffsetMm).toBe(35)
  })

  it("a single-offset size defaults to its only offset", () => {
    const sizes = groupVariantsIntoSizes(
      [variant("v_only", 20, 9, 12, "5x114.3", 0, 300)],
      28
    )
    expect(sizes[0].defaultOffsetMm).toBe(12)
  })
})

describe("formatOffset — sign-aware ET display (WB-090 P7)", () => {
  it("prepends + for zero and positive values", () => {
    expect(formatOffset(35)).toBe("+35")
    expect(formatOffset(0)).toBe("+0")
  })

  it("does not double the sign for a negative value (regression: '+-12mm')", () => {
    expect(formatOffset(-12)).toBe("-12")
  })
})

describe("gramsToLb", () => {
  it("converts grams to pounds, rounded to 1 decimal", () => {
    expect(gramsToLb(14515)).toBe(32)
  })

  it("returns 0 for 0 grams", () => {
    expect(gramsToLb(0)).toBe(0)
  })
})

describe("groupVariantsIntoSizes — per-variant shipping weight (WB-090 P8/L6)", () => {
  it("threads each variant's own weight (grams→lb) into its SizeOption instead of applying one product-level weight to every size", () => {
    const heavy = { ...variant("v_heavy", 20, 9, 18, "5x114.3", 10, 300), weight: 14515 } // ≈32 lb
    const light = { ...variant("v_light", 22, 10, 20, "5x114.3", 10, 320), weight: 9072 } // ≈20 lb
    const sizes = groupVariantsIntoSizes([heavy, light], 28)
    const s20 = sizes.find((s) => s.diameter === 20)!
    const s22 = sizes.find((s) => s.diameter === 22)!
    expect(s20.weightLb).toBe(32)
    expect(s22.weightLb).toBe(20)
    expect(s20.weightLb).not.toBe(s22.weightLb)
  })

  it("falls back to the product-level weight when a variant carries no weight of its own", () => {
    const noWeight = variant("v_a", 20, 9, 18, "5x114.3", 10, 300) // no `weight` key
    const sizes = groupVariantsIntoSizes([noWeight], 28)
    expect(sizes[0].weightLb).toBe(28)
  })
})

describe("groupVariantsIntoSizes — sku threading (WB-098 Task 3)", () => {
  it("threads each variant's real sku onto its own offset variant", () => {
    const withSku = { ...variant("v_a", 20, 9, 18, "5x114.3", 10, 300), sku: "AF-004-20X9-ET18" }
    const sizes = groupVariantsIntoSizes([withSku], 28)
    expect(sizes[0].offsetVariants?.[0].sku).toBe("AF-004-20X9-ET18")
  })

  it("leaves sku undefined (never a fabricated value) when the variant carries none", () => {
    const noSku = variant("v_a", 20, 9, 18, "5x114.3", 10, 300) // no `sku` key
    const sizes = groupVariantsIntoSizes([noSku], 28)
    expect(sizes[0].offsetVariants?.[0].sku).toBeUndefined()
  })

  it("keeps sibling offsets' skus independent — never collapsed to one value", () => {
    const a = { ...variant("v_a", 20, 9, 18, "5x114.3", 10, 300), sku: "SKU-A" }
    const b = { ...variant("v_b", 20, 9, 35, "5x114.3", 10, 320), sku: "SKU-B" }
    const sizes = groupVariantsIntoSizes([a, b], 28)
    expect(sizes[0].offsetVariants?.map((o) => o.sku)).toEqual(["SKU-A", "SKU-B"])
  })
})
