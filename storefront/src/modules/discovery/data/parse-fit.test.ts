// storefront/src/modules/discovery/data/parse-fit.test.ts
import { it, expect, describe } from "vitest"
import { parseQueryFromSearchParams } from "./types"

describe("parseQueryFromSearchParams — fit param", () => {
  it("builds vehicleConstraint from fit=<patterns>", () => {
    const q = parseQueryFromSearchParams({ fit: "5x114.3,5x120" })
    expect(q.vehicleConstraint).toEqual(['(bolt_patterns_canonical = "5x114.3" OR bolt_patterns_canonical = "5x120")'])
  })
  it("omits vehicleConstraint for fit=0 (explicit off)", () => {
    expect(parseQueryFromSearchParams({ fit: "0" }).vehicleConstraint).toBeUndefined()
  })
  it("omits vehicleConstraint when fit is absent", () => {
    expect(parseQueryFromSearchParams({}).vehicleConstraint).toBeUndefined()
  })
})
