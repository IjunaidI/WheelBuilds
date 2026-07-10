// storefront/src/lib/fitment/__tests__/fits-vehicle.test.ts
import { it, expect, describe } from "vitest"
import { fitsVehicle } from "../fits-vehicle"

const product = { boltPatternsCanonical: ["5x114.3"], specs: { centerBoreMm: 70.5 },
  sizeOptions: [{ diameter: 19, width: 8.5, offsetMm: 35 }] }

describe("fitsVehicle", () => {
  it("fits when bolt pattern intersects and wheel bore >= hub bore", () => {
    const v = { canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 64.1,
      diameterWindow: { min: 17, max: 20 }, widthWindow: { min: 7, max: 9 }, offsetWindow: { min: 30, max: 45 } }
    const r = fitsVehicle(product, v)
    expect(r.hardGatesPass).toBe(true); expect(r.fits).toBe(true); expect(r.withinWindow).toBe(true)
  })
  it("does not fit when wheel bore < hub bore", () => {
    const r = fitsVehicle({ ...product, specs: { centerBoreMm: 60 } }, { canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 64.1 })
    expect(r.hardGatesPass).toBe(false); expect(r.fits).toBe(false)
    expect(r.reasons.join(" ")).toMatch(/hub/i)
  })
  it("does not fit when bolt pattern differs", () => {
    const r = fitsVehicle(product, { canonicalBoltPatterns: ["6x139.7"], hubBoreMm: 78 })
    expect(r.hardGatesPass).toBe(false); expect(r.fits).toBe(false)
  })
  it("bolts on but does NOT 'fit' when the offset is outside the vehicle's window", () => {
    // Same bolt pattern + bore clears, but the wheel's ET (35) is below the
    // vehicle's offset window — the random-wheel-reads-as-guaranteed bug.
    // WB-077 F3: hard gates pass + out-of-window is now "check" (aggressive
    // fitment), not a disproven "no-fit" — `fits` stays false either way, so
    // this test's core regression guard is intact; only the tier label and
    // the reason copy (now the aggressive-fitment string) changed.
    const v = { canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 64.1,
      diameterWindow: { min: 17, max: 20 }, widthWindow: { min: 7, max: 9 }, offsetWindow: { min: 42, max: 52 } }
    const r = fitsVehicle(product, v)
    expect(r.hardGatesPass).toBe(true)
    expect(r.withinWindow).toBe(false)
    expect(r.fits).toBe(false)
    expect(r.status).toBe("check")
    expect(r.reasons.join(" ")).toMatch(/aggressive fitment/i)
  })
  it("fits on bolt pattern + bore when the vehicle has no spec windows (size can't be disproved)", () => {
    // No wheel-size ranges on file → we verify what we can (bolt pattern + bore).
    // A null window can't exclude a size, so a bolt-compatible wheel reads as fitting.
    const r = fitsVehicle(product, { canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 64.1 })
    expect(r.hardGatesPass).toBe(true)
    expect(r.withinWindow).toBe(true)
    expect(r.fits).toBe(true)
    expect(r.status).toBe("fits")
  })

  // S1 — per-size conjunction. Regression test for the over-claim bug where
  // each dimension (diameter/width/offset) was checked independently across
  // ALL sizes, so a product with one size satisfying diameter, a DIFFERENT
  // size satisfying width, and a THIRD satisfying offset would read as
  // "fits" even though no single buildable size actually clears the vehicle.
  it("does NOT fit when no single size satisfies diameter+width+offset together (per-size conjunction)", () => {
    const p = {
      boltPatternsCanonical: ["5x114.3"],
      specs: { centerBoreMm: 70.5 },
      sizeOptions: [
        { diameter: 20, width: 9, offsetMm: -12 }, // diameter+width in-window, offset NOT
        { diameter: 22, width: 12, offsetMm: 30 }, // diameter+offset in-window, width NOT
      ],
    }
    const v = {
      canonicalBoltPatterns: ["5x114.3"],
      hubBoreMm: 64.1,
      diameterWindow: { min: 20, max: 22 },
      widthWindow: { min: 8.5, max: 9.5 },
      offsetWindow: { min: 20, max: 40 },
    }
    const r = fitsVehicle(p, v)
    expect(r.hardGatesPass).toBe(true)
    // Old per-dimension-across-all-sizes logic would report `fits: true` here
    // (diameter satisfied by size 1 or 2, width by size 1, offset by size 2).
    // WB-077 F3: hard gates pass + no single in-window size is "check"
    // (aggressive fitment), not "no-fit" — but `fits` must still be false,
    // which is what this test actually guards against (the per-size
    // conjunction regression).
    expect(r.status).toBe("check")
    expect(r.fits).toBe(false)
  })

  // S5 — unknown state. A vehicle with no bolt-pattern data on file is an
  // UNKNOWN fitment, not a disproven "bolt pattern does not match" mismatch.
  it("returns 'unknown' (not a mismatch) when the vehicle has no bolt-pattern data", () => {
    const r = fitsVehicle(product, { canonicalBoltPatterns: [] })
    expect(r.status).toBe("unknown")
    expect(r.fits).toBe(false)
    expect(r.reasons.join(" ")).not.toMatch(/bolt pattern/i)
    expect(r.reasons.join(" ")).toMatch(/don't have fitment data/i)
  })

  it("returns 'unknown' when canonicalBoltPatterns is entirely absent", () => {
    const r = fitsVehicle(product, { hubBoreMm: 64.1 })
    expect(r.status).toBe("unknown")
    expect(r.fits).toBe(false)
  })

  // F3 — aggressive fitment. Hard gates (bolt + bore) pass but no single size
  // is fully in-window: this is no longer a disproven "no-fit", it's a
  // "check" (verify clearance before ordering).
  it("F3: hard gates pass but out-of-window → check (not no-fit)", () => {
    const v = fitsVehicle(
      { boltPatternsCanonical: ["6x139.7"], specs: { centerBoreMm: 78.1 },
        sizeOptions: [{ diameter: 20, width: 10, offsetMm: -19 }] },
      { canonicalBoltPatterns: ["6x139.7"], hubBoreMm: 78.1,
        diameterWindow: { min: 17, max: 20 }, widthWindow: { min: 8, max: 9 }, offsetWindow: { min: 0, max: 31 } })
    expect(v.status).toBe("check")
    expect(v.hardGatesPass).toBe(true)
    expect(v.withinWindow).toBe(false)
  })

  // F5 — symmetric with S5: a PRODUCT with no parseable bolt pattern is an
  // UNKNOWN fitment, not a disproven mismatch.
  it("F5: empty product bolt patterns → unknown (not a false mismatch)", () => {
    const v = fitsVehicle(
      { boltPatternsCanonical: [], specs: {}, sizeOptions: [{ diameter: 20, width: 9, offsetMm: 18 }] },
      { canonicalBoltPatterns: ["6x139.7"], hubBoreMm: null, diameterWindow: null, widthWindow: null, offsetWindow: null })
    expect(v.status).toBe("unknown")
    expect(v.reasons).not.toContain("Bolt pattern does not match your vehicle.")
  })

  it("in-window control still reads fits", () => {
    const v = fitsVehicle(
      { boltPatternsCanonical: ["6x139.7"], specs: { centerBoreMm: 78.1 },
        sizeOptions: [{ diameter: 18, width: 9, offsetMm: 18 }] },
      { canonicalBoltPatterns: ["6x139.7"], hubBoreMm: 78.1,
        diameterWindow: { min: 17, max: 20 }, widthWindow: { min: 8, max: 9 }, offsetWindow: { min: 0, max: 31 } })
    expect(v.status).toBe("fits")
  })
})
