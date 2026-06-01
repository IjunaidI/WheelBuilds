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
})
