import { describe, it, expect } from "vitest"
import { contrastRatio, relativeLuminance } from "./contrast-ratio"

// Pins the WB-096 X6 token values against .frame's page background so a
// future edit to wheel-builds.css can't silently regress AA contrast. Keep
// these hex literals in sync BY HAND with storefront/src/styles/wheel-builds.css
// (--orange-deep, --ink-soft) and DESIGN.md §2's token table if either value
// changes.
const FRAME_BG = "#FAFAF8" // .frame page background (wheel-builds.css)
const ORANGE_DEEP = "#C64400" // --orange-deep — sub-18px accent text only
const INK_SOFT = "#6E6E73" // --ink-soft — tertiary text / mono labels / disabled

describe("contrastRatio", () => {
  it("returns 21:1 for black on white (the WCAG maximum)", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1)
  })

  it("returns 1:1 for identical colors", () => {
    expect(contrastRatio("#FF6A00", "#FF6A00")).toBeCloseTo(1, 5)
  })

  it("is symmetric in its two arguments", () => {
    expect(contrastRatio("#333333", "#EEEEEE")).toBeCloseTo(
      contrastRatio("#EEEEEE", "#333333"),
      10
    )
  })

  it("accepts 3-digit hex shorthand", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 1)
  })

  it("computes a known reference value (WebAIM: #FF6A00 on white)", () => {
    // Sanity-checks the formula independent of the WB tokens above — the
    // un-darkened --orange (#FF6A00) is ~2.9:1 on white, well under AA, which
    // is exactly the bug this task fixes for small text.
    expect(contrastRatio("#FF6A00", "#FFFFFF")).toBeCloseTo(2.87, 1)
  })
})

describe("WB-096 X6 — token contrast floor (AA, 4.5:1, normal text)", () => {
  it("--orange-deep meets AA on the .frame background", () => {
    expect(contrastRatio(ORANGE_DEEP, FRAME_BG)).toBeGreaterThanOrEqual(4.5)
  })

  it("the new --ink-soft meets AA on the .frame background", () => {
    expect(contrastRatio(INK_SOFT, FRAME_BG)).toBeGreaterThanOrEqual(4.5)
  })

  it("--orange-deep also meets AA on plain white (card surfaces)", () => {
    expect(contrastRatio(ORANGE_DEEP, "#FFFFFF")).toBeGreaterThanOrEqual(4.5)
  })

  it("the old --ink-soft value (#8A8A8E) was below AA — regression guard", () => {
    // Documents why this task exists: the pre-WB-096 value failed AA on the
    // .frame background (~3.3:1). If this ever starts passing, the two
    // constants above have probably been edited back toward it.
    expect(contrastRatio("#8A8A8E", FRAME_BG)).toBeLessThan(4.5)
  })

  it("relativeLuminance of white is 1 and of black is 0", () => {
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5)
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5)
  })
})
