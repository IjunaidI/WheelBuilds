import { describe, it, expect } from "vitest"
import { buildFitView } from "../fit-view"
import type { FinishOption, ProductDetail, SizeOption } from "../types"

// Minimal SizeOption factory — only the fields buildFitView reads.
const size = (
  diameter: number, width: number, boltPattern: string, offsetMm: number,
  bore: number | null = 64.1, avail: SizeOption["availability"] = "in_stock"
): SizeOption => ({
  diameter, width, offsetMm, oemOffsetMm: offsetMm, boltPattern, weightLb: 25, availability: avail,
  offsetVariants: [{ value: offsetMm, backspaceIn: "", variantId: `v-${diameter}x${width}-${offsetMm}`,
    availability: avail, centerBoreMm: bore, loadRatingLb: null }],
})

const finish = (raw: string, sizes: SizeOption[]): FinishOption =>
  ({ raw, normalized: "black", imageUrl: null, sizeOptions: sizes })

// A product offered in Matte Black (18x8 fits, 22x10 does not) and Chrome (only 22x10, does not fit).
const product = {
  boltPatternOptions: ["5x114.3"],
  finishOptions: [
    finish("Matte Black", [size(18, 8, "5x114.3", 40), size(22, 10, "5x114.3", 15)]),
    finish("Chrome", [size(22, 10, "5x114.3", 15)]),
  ],
} as unknown as ProductDetail

// Corolla-ish window: 17–19 in, 6.5–8.5 in, ET 35–50.
const vehicle = { canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 60.1,
  diameterWindow: { min: 17, max: 19 }, widthWindow: { min: 6.5, max: 8.5 }, offsetWindow: { min: 35, max: 50 } }

describe("buildFitView", () => {
  it("keeps only fitting sizes and drops finishes with no fitting size", () => {
    const fv = buildFitView(product, vehicle)
    expect(fv.hasFit).toBe(true)
    // Chrome (only 22x10, out of window) is dropped; Matte Black keeps only 18x8.
    expect(fv.finishOptions.map((f) => f.raw)).toEqual(["Matte Black"])
    expect(fv.finishOptions[0].sizeOptions.map((s) => `${s.diameter}x${s.width}`)).toEqual(["18x8"])
    expect(fv.boltPatterns).toEqual(["5x114.3"])
  })
  it("the effective default (first finish's default size) is a genuine fit", () => {
    const fv = buildFitView(product, vehicle)
    const s = fv.finishOptions[0].sizeOptions[0]
    expect(s.diameter).toBe(18)
    expect(s.width).toBe(8)
  })
  it("hasFit is false when no variant fits (bolt matches but size is out of window)", () => {
    const outOfWindow = { ...vehicle, diameterWindow: { min: 20, max: 24 } }
    const fv = buildFitView(product, outOfWindow)
    expect(fv.hasFit).toBe(false)
    expect(fv.finishOptions).toBe(product.finishOptions) // falls back to the full set
  })
  it("hasFit is false when the vehicle has no spec windows", () => {
    const fv = buildFitView(product, { canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 60.1 })
    expect(fv.hasFit).toBe(false)
  })
  it("excludes a size whose bore is smaller than the hub", () => {
    const tightHub = { ...vehicle, hubBoreMm: 70 } // 18x8 bore 64.1 < 70 → excluded
    const fv = buildFitView(product, tightHub)
    expect(fv.hasFit).toBe(false)
  })
})
