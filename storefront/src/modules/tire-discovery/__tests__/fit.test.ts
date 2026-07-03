import { describe, it, expect } from "vitest"
import { parseTireQueryFromSearchParams, tireSizesToFitParam, fitParamToTireSizes, EMPTY_TIRE_FILTERS } from "../data/types"
import { buildTireFilters, hitToTireProduct } from "../data/get-tire-products"

describe("tire fit param", () => {
  it("round-trips sizes through the fit param", () => {
    expect(fitParamToTireSizes(tireSizesToFitParam(["225/55R18", "255/35R19"]))).toEqual(["225/55R18", "255/35R19"])
  })
  it("parses ?fit into vehicleTireSizes; fit=0 → none", () => {
    expect(parseTireQueryFromSearchParams({ fit: "225/55R18,255/35R19" }).vehicleTireSizes).toEqual(["225/55R18", "255/35R19"])
    expect(parseTireQueryFromSearchParams({ fit: "0" }).vehicleTireSizes).toBeUndefined()
    expect(parseTireQueryFromSearchParams({}).vehicleTireSizes).toBeUndefined()
  })
})

describe("buildTireFilters fit clause", () => {
  it("adds a tire_sizes IN clause for the vehicle sizes", () => {
    const c = buildTireFilters(EMPTY_TIRE_FILTERS, undefined, ["225/55R18", "255/35R19"])
    expect(c.some((x) => x.startsWith("tire_sizes IN"))).toBe(true)
  })
  it("no fit clause when no vehicle sizes", () => {
    const c = buildTireFilters(EMPTY_TIRE_FILTERS)
    // Deviation from brief (see task-4-report.md): brief asserted `.toBe(true)` here, but with
    // EMPTY_TIRE_FILTERS + no vehicleTireSizes, clauses is just ['product_type = "tire"'] — no
    // "tire_sizes IN" clause exists at all, so `.some(...)` is false. Fixed to match the stated
    // intent ("no fit clause") and the "// product_type only" comment.
    expect(c.some((x) => x.startsWith("tire_sizes IN") && !x.includes("skip"))).toBe(false) // product_type only
  })
})

describe("hitToTireProduct sizes", () => {
  it("carries the canonical tire_sizes onto the product", () => {
    const p = hitToTireProduct({ id: "t", handle: "h", title: "t", brand: "B", price_min: 0, tire_sizes: ["305/45R22", "305/50R20"] } as any)
    expect(p.sizes).toEqual(["305/45R22", "305/50R20"])
  })
})
