import { describe, it, expect } from "vitest"
import { buildFitView } from "../fit-view"
import type { FinishOption, ProductDetail, SizeOption } from "../types"

// Minimal SizeOption factory — only the fields buildFitView reads.
const size = (
  diameter: number, width: number, boltPattern: string, offsetMm: number,
  bore: number | null = 64.1, avail: SizeOption["availability"] = "in_stock"
): SizeOption => ({
  diameter, width, offsetMm, defaultOffsetMm: offsetMm, boltPattern, weightLb: 25, availability: avail,
  offsetVariants: [{ value: offsetMm, backspaceIn: "", variantId: `v-${diameter}x${width}-${boltPattern}-${offsetMm}`,
    availability: avail, centerBoreMm: bore, loadRatingLb: null, quantity: 10 }],
})

// Multi-offset-variant size factory — for S3/S4 tests that need distinct
// bore/offset combos per variant (the plain `size()` factory only makes one).
const multiVariantSize = (
  diameter: number, width: number, boltPattern: string,
  variants: { value: number; bore: number | null }[]
): SizeOption => ({
  diameter, width, offsetMm: variants[0].value, defaultOffsetMm: variants[0].value,
  boltPattern, weightLb: 25, availability: "in_stock",
  offsetVariants: variants.map((v) => ({
    value: v.value, backspaceIn: "", variantId: `v-${diameter}x${width}-${boltPattern}-${v.value}`,
    availability: "in_stock", centerBoreMm: v.bore, loadRatingLb: null, quantity: 10,
  })),
})

const finish = (raw: string, sizes: SizeOption[]): FinishOption =>
  ({ raw, normalized: "black", imageUrl: null, sizeOptions: sizes })

const productOf = (boltPatternOptions: string[], finishOptions: FinishOption[]) =>
  ({ boltPatternOptions, finishOptions } as unknown as ProductDetail)

describe("buildFitView", () => {
  // WB-077: out-of-window-but-bolt+bore-passing sizes now survive as
  // tier: "check" instead of being dropped outright.
  const product = { boltPatternOptions: ["6x139.7"], finishOptions: [{ raw: "black", sizeOptions: [
    { boltPattern: "6x139.7", diameter: 20, width: 10, offsetMm: -19, offsetVariants: [{ value: -19, centerBoreMm: 78.1 }] },
  ] }] } as any

  it("keeps out-of-window sizes as check-tier and sets bestTier", () => {
    const vehicle = { canonicalBoltPatterns: ["6x139.7"], hubBoreMm: 78.1, diameterWindow: { min: 17, max: 20 }, widthWindow: { min: 8, max: 9 }, offsetWindow: { min: 0, max: 31 } } as any
    const view = buildFitView(product, vehicle)
    expect(view.bestTier).toBe("check")
    expect(view.hasFit).toBe(true)
    expect(view.finishOptions[0].sizeOptions[0].tier).toBe("check")
  })

  it("with spec windows: keeps in-window sizes as fits-tier and out-of-window sizes as check-tier (WB-077 — previously dropped entirely)", () => {
    // Matte Black offers a fitting 18x8 + an out-of-window 22x10; Chrome only 22x10.
    // Both wheels are bolt-compatible and their bore clears the hub, so under
    // WB-077 the 22x10 size (and the Chrome finish that only has it) now
    // SURVIVE as tier "check" instead of being trimmed away — the overall
    // bestTier is still "fits" because Matte Black's 18x8 is a full match.
    const product = productOf(["5x114.3"], [
      finish("Matte Black", [size(18, 8, "5x114.3", 40), size(22, 10, "5x114.3", 15)]),
      finish("Chrome", [size(22, 10, "5x114.3", 15)]),
    ])
    const vehicle = { canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 60.1,
      diameterWindow: { min: 17, max: 19 }, widthWindow: { min: 6.5, max: 8.5 }, offsetWindow: { min: 35, max: 50 } }
    const fv = buildFitView(product, vehicle)
    expect(fv.hasFit).toBe(true)
    expect(fv.bestTier).toBe("fits")
    expect(fv.finishOptions.map((f) => f.raw)).toEqual(["Matte Black", "Chrome"]) // Chrome now survives as check-tier
    expect(fv.finishOptions[0].sizeOptions.map((s) => `${s.diameter}x${s.width}`)).toEqual(["18x8", "22x10"])
    expect(fv.finishOptions[0].sizeOptions.map((s) => s.tier)).toEqual(["fits", "check"])
    expect(fv.finishOptions[1].sizeOptions[0].tier).toBe("check")
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
    expect(fv.bestTier).toBe("fits")
    expect(fv.boltPatterns).toEqual(["5x100"]) // the 5x114.3 pattern is hidden
    expect(fv.finishOptions[0].sizeOptions.map((s) => `${s.diameter}x${s.width}`)).toEqual(["17x7.5", "19x8"])
  })

  it("spec windows present, no size in-window, but bolt+bore pass: bestTier check, sizes survive as check-tier (WB-077 — was hasFit:false)", () => {
    // Vehicle's diameter window (24-26) excludes EVERY size the wheel offers,
    // but bolt pattern matches and bore clears (default bore 64.1 in the
    // `size()` factory) — so under WB-077 these are no longer dropped, they
    // surface as tier "check" (aggressive badge) instead of vanishing.
    const product = productOf(["5x114.3"], [
      finish("Black", [size(18, 8, "5x114.3", 40), size(22, 10, "5x114.3", 15)]),
    ])
    const vehicle = { canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 60.1, diameterWindow: { min: 24, max: 26 } }
    const fv = buildFitView(product, vehicle)
    expect(fv.hasFit).toBe(true)
    expect(fv.bestTier).toBe("check")
    expect(fv.finishOptions[0].sizeOptions.every((s) => s.tier === "check")).toBe(true)
  })

  it("falls back to the full set only when the vehicle has NO bolt-pattern data", () => {
    const product = productOf(["5x114.3"], [finish("Black", [size(18, 8, "5x114.3", 40)])])
    const fv = buildFitView(product, { hubBoreMm: 64.1 } as any) // no canonicalBoltPatterns
    expect(fv.hasFit).toBe(false)
    expect(fv.bestTier).toBe("no")
    expect(fv.finishOptions).toBe(product.finishOptions) // identity → caller shows everything
  })

  it("excludes a size whose bore is smaller than the hub (no matching-pattern variant left → falls back)", () => {
    const product = productOf(["5x114.3"], [finish("Black", [size(18, 8, "5x114.3", 40, 60)])]) // bore 60
    const vehicle = { canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 70 } // hub 70 > bore 60, outside the 0.2mm tolerance
    const fv = buildFitView(product, vehicle)
    expect(fv.hasFit).toBe(false) // the only size's bore never clears the hub, even at check-tier → nothing bolt-compatible
    expect(fv.bestTier).toBe("no")
  })

  it("pairs bore+offset per variant: a size only reaches fits-tier if ONE variant both clears the hub AND is in-window; otherwise check-tier, never mixed across variants (S4)", () => {
    // Variant A (ET40) is in-window but its bore (66) doesn't clear hub 73.
    // Variant B (ET-10) clears the hub (bore 106) but its offset is out of window.
    // No SINGLE variant satisfies both, so the size must NOT reach "fits" — the
    // old two-independent-.some() bug would have wrongly done so (A satisfies
    // the offset check, B satisfies the bore check, neither together). Under
    // WB-077, since variant B's bore does clear, the size survives at
    // tier "check" instead of being dropped entirely — but it must never be
    // "fits", which is the pairing invariant this test guards.
    const product = productOf(["5x114.3"], [
      finish("Black", [
        multiVariantSize(18, 8, "5x114.3", [
          { value: 40, bore: 66 },
          { value: -10, bore: 106 },
        ]),
      ]),
    ])
    const vehicle = {
      canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 73,
      offsetWindow: { min: 35, max: 50 },
    }
    const fv = buildFitView(product, vehicle)
    expect(fv.hasFit).toBe(true)
    expect(fv.bestTier).toBe("check")
    expect(fv.finishOptions[0].sizeOptions[0].tier).toBe("check") // NOT "fits" — no single variant satisfied both bore-clear AND in-window offset
    // Only the bore-failing variant (A, bore 66) is dropped; the bore-clearing
    // but offset-out-of-window variant (B) survives visibly as check-tier.
    expect(fv.finishOptions[0].sizeOptions[0].offsetVariants?.map((o) => o.value)).toEqual([-10])
  })

  it("orders a size's surviving offsetVariants fits-first so offsetVariants[0] is a fitting ET when one exists (WB-077 I1)", () => {
    // The product lists the CHECK offset (ET15, out of the 35-50 window) BEFORE
    // the FITS offset (ET40, in-window); both clear hub 73. After trim, the
    // genuinely-fitting ET must be reordered to the front so the hero's default
    // offset pick (offsetVariants[0]) lands on a fit, not the aggressive ET.
    const product = productOf(["5x114.3"], [
      finish("Black", [
        multiVariantSize(18, 8, "5x114.3", [
          { value: 15, bore: 80 }, // check: clears hub 73 but offset out of window
          { value: 40, bore: 80 }, // fits: in-window (35-50) AND clears hub
        ]),
      ]),
    ])
    const vehicle = {
      canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 73,
      offsetWindow: { min: 35, max: 50 },
    }
    const fv = buildFitView(product, vehicle)
    const offsets = fv.finishOptions[0].sizeOptions[0].offsetVariants
    expect(offsets?.map((o) => o.value)).toEqual([40, 15]) // FITS (40) first, CHECK (15) after
    expect(offsets?.[0].value).toBe(40)
  })

  it("trims a surviving size's offsetVariants to drop only the non-clearing (no-tier) ones — check-tier offsets stay visible (S3, updated for WB-077)", () => {
    const product = productOf(["5x114.3"], [
      finish("Black", [
        multiVariantSize(18, 8, "5x114.3", [
          { value: 40, bore: 80 }, // fits: in-window (35-50) AND clears hub 73
          { value: 20, bore: 80 }, // check: clears hub but offset out of window
          { value: 45, bore: 60 }, // no: in window but doesn't clear hub 73 → dropped
        ]),
      ]),
    ])
    const vehicle = {
      canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 73,
      offsetWindow: { min: 35, max: 50 },
    }
    const fv = buildFitView(product, vehicle)
    expect(fv.hasFit).toBe(true)
    expect(fv.bestTier).toBe("fits")
    const offsetVariants = fv.finishOptions[0].sizeOptions[0].offsetVariants
    expect(offsetVariants?.map((o) => o.value)).toEqual([40, 20]) // 45 (no-tier) dropped; 20 (check-tier) now stays
  })
})
