// storefront/src/modules/discovery/data/vehicle-constraint.test.ts
import { it, expect, describe } from "vitest"
import { vehicleToConstraints } from "./vehicle-constraint"

describe("vehicleToConstraints", () => {
  it("builds a single parenthesized-OR clause over bolt_patterns_canonical", () => {
    expect(vehicleToConstraints({ canonicalBoltPatterns: ["5x114.3", "5x120"] }))
      .toEqual(['(bolt_patterns_canonical = "5x114.3" OR bolt_patterns_canonical = "5x120")'])
  })
  it("returns [] (fail-open) when there are no patterns", () => {
    expect(vehicleToConstraints({ canonicalBoltPatterns: [] })).toEqual([])
    expect(vehicleToConstraints({})).toEqual([])
  })
})
