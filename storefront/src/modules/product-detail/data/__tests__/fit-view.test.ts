import { describe, it, expect } from "vitest"
import { buildFitView } from "../fit-view"
import type { FinishOption, ProductDetail, SizeOption } from "../types"

// Minimal SizeOption factory — only the fields buildFitView reads.
const size = (
  diameter: number, width: number, boltPattern: string, offsetMm: number,
  bore: number | null = 64.1, avail: SizeOption["availability"] = "in_stock"
): SizeOption => ({
  diameter, width, offsetMm, oemOffsetMm: offsetMm, boltPattern, weightLb: 25, availability: avail,
  offsetVariants: [{ value: offsetMm, backspaceIn: "", variantId: `v-${diameter}x${width}-${boltPattern}-${offsetMm}`,
    availability: avail, centerBoreMm: bore, loadRatingLb: null }],
})

const finish = (raw: string, sizes: SizeOption[]): FinishOption =>
  ({ raw, normalized: "black", imageUrl: null, sizeOptions: sizes })

const productOf = (boltPatternOptions: string[], finishOptions: FinishOption[]) =>
  ({ boltPatternOptions, finishOptions } as unknown as ProductDetail)

describe("buildFitView", () => {
  it("with spec windows: trims to in-window sizes and drops a finish with only out-of-window sizes", () => {
    // Matte Black offers a fitting 18x8 + an out-of-window 22x10; Chrome only 22x10.
    const product = productOf(["5x114.3"], [
      finish("Matte Black", [size(18, 8, "5x114.3", 40), size(22, 10, "5x114.3", 15)]),
      finish("Chrome", [size(22, 10, "5x114.3", 15)]),
    ])
    const vehicle = { canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 60.1,
      diameterWindow: { min: 17, max: 19 }, widthWindow: { min: 6.5, max: 8.5 }, offsetWindow: { min: 35, max: 50 } }
    const fv = buildFitView(product, vehicle)
    expect(fv.hasFit).toBe(true)
    expect(fv.finishOptions.map((f) => f.raw)).toEqual(["Matte Black"]) // Chrome (all out-of-window) dropped
    expect(fv.finishOptions[0].sizeOptions.map((s) => `${s.diameter}x${s.width}`)).toEqual(["18x8"])
    expect(fv.boltPatterns).toEqual(["5x114.3"])
  })

  it("no spec windows: filters to the vehicle's bolt pattern only, keeping all its sizes (the reported-bug case)", () => {
    // petrol-p5a-style multi-pattern wheel; vehicle is 5x100 with NO wheel-size windows.
    const product = productOf(["5x100", "5x114.3"], [
      finish("Gloss Black", [
        size(17, 7.5, "5x100", 35), size(19, 8, "5x100", 40), size(20, 9, "5x114.3", 20),
      ]),
    ])
    const vehicle = { canonicalBoltPatterns: ["5x100"], hubBoreMm: 57.1 } // no windows
    const fv = buildFitView(product, vehicle)
    expect(fv.hasFit).toBe(true)
    expect(fv.boltPatterns).toEqual(["5x100"]) // the 5x114.3 pattern is hidden
    expect(fv.finishOptions[0].sizeOptions.map((s) => `${s.diameter}x${s.width}`)).toEqual(["17x7.5", "19x8"])
  })

  it("spec windows present but NO size fits: hasFit false so the hero shows a doesn't-fit state", () => {
    // Vehicle's diameter window (24-26) excludes EVERY size the wheel offers.
    const product = productOf(["5x114.3"], [
      finish("Black", [size(18, 8, "5x114.3", 40), size(22, 10, "5x114.3", 15)]),
    ])
    const vehicle = { canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 60.1, diameterWindow: { min: 24, max: 26 } }
    const fv = buildFitView(product, vehicle)
    expect(fv.hasFit).toBe(false)
    expect(fv.finishOptions).toBe(product.finishOptions) // identity → hero shows all + a "doesn't fit" banner
  })

  it("falls back to the full set only when the vehicle has NO bolt-pattern data", () => {
    const product = productOf(["5x114.3"], [finish("Black", [size(18, 8, "5x114.3", 40)])])
    const fv = buildFitView(product, { hubBoreMm: 64.1 } as any) // no canonicalBoltPatterns
    expect(fv.hasFit).toBe(false)
    expect(fv.finishOptions).toBe(product.finishOptions) // identity → caller shows everything
  })

  it("excludes a size whose bore is smaller than the hub (no matching-pattern variant left → falls back)", () => {
    const product = productOf(["5x114.3"], [finish("Black", [size(18, 8, "5x114.3", 40, 60)])]) // bore 60
    const vehicle = { canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 70 } // hub 70 > bore 60
    const fv = buildFitView(product, vehicle)
    expect(fv.hasFit).toBe(false) // the only size doesn't clear the hub → nothing bolt-compatible
  })
})
