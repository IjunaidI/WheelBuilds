import { describe, it, expect } from "vitest"
import type { OemTire } from "@lib/garage/types"
import {
  parseTireQueryFromSearchParams,
  oemTiresToFitParams,
  fitParamsToOemTires,
  EMPTY_TIRE_FILTERS,
} from "../data/types"
import { buildTireFilters, hitToTireProduct, passesFitFilter } from "../data/get-tire-products"

describe("oemTiresToFitParams / fitParamsToOemTires", () => {
  it("round-trips aligned size + load + speed", () => {
    const oemTires: OemTire[] = [
      { size: "225/55R18", loadIndex: 98, speedRating: "V" },
      { size: "255/35R19", loadIndex: null, speedRating: null },
    ]
    const params = oemTiresToFitParams(oemTires)
    expect(params).toEqual({ fit: "225/55R18,255/35R19", fitl: "98,", fits: "V," })
    expect(fitParamsToOemTires(params.fit, params.fitl, params.fits)).toEqual(oemTires)
  })

  it("filters out blank-size entries BEFORE building all three CSVs (stays aligned)", () => {
    const oemTires: OemTire[] = [
      { size: "", loadIndex: 98, speedRating: "V" },
      { size: "255/35R19", loadIndex: 100, speedRating: "H" },
    ]
    const params = oemTiresToFitParams(oemTires)
    expect(params).toEqual({ fit: "255/35R19", fitl: "100", fits: "H" })
  })

  it("decodes a size-only fit param (fitl/fits absent) with null load/speed", () => {
    expect(fitParamsToOemTires("225/55R18,255/35R19")).toEqual([
      { size: "225/55R18", loadIndex: null, speedRating: null },
      { size: "255/35R19", loadIndex: null, speedRating: null },
    ])
  })
})

describe("parseTireQueryFromSearchParams multi-axis fit", () => {
  it("reads fit+fitl+fits aligned by index into vehicleOemTires", () => {
    const q = parseTireQueryFromSearchParams({
      fit: "225/55R18,255/35R19",
      fitl: "98,",
      fits: "V,",
    })
    expect(q.vehicleOemTires).toEqual([
      { size: "225/55R18", loadIndex: 98, speedRating: "V" },
      { size: "255/35R19", loadIndex: null, speedRating: null },
    ])
  })

  it("fit=0 → vehicleOemTires undefined (explicit opt-out), even with fitl/fits present", () => {
    expect(
      parseTireQueryFromSearchParams({ fit: "0", fitl: "98", fits: "V" }).vehicleOemTires
    ).toBeUndefined()
  })

  it("no fit param → vehicleOemTires undefined", () => {
    expect(parseTireQueryFromSearchParams({}).vehicleOemTires).toBeUndefined()
  })

  it("fit with no fitl/fits still parses (backward compat with size-only links)", () => {
    const q = parseTireQueryFromSearchParams({ fit: "225/55R18" })
    expect(q.vehicleOemTires).toEqual([{ size: "225/55R18", loadIndex: null, speedRating: null }])
  })
})

describe("buildTireFilters fit clause", () => {
  it("adds a tire_sizes IN clause for the vehicle sizes", () => {
    const c = buildTireFilters(EMPTY_TIRE_FILTERS, undefined, ["225/55R18", "255/35R19"])
    expect(c.some((x) => x.startsWith("tire_sizes IN"))).toBe(true)
  })
  it("no fit clause when no vehicle sizes", () => {
    const c = buildTireFilters(EMPTY_TIRE_FILTERS)
    expect(c.some((x) => x.startsWith("tire_sizes IN"))).toBe(false) // product_type only
  })
})

describe("hitToTireProduct fit_specs parse", () => {
  it("parses size|load|speed into fitSpecs, dropping empty-size entries", () => {
    const p = hitToTireProduct({
      id: "t", handle: "h", title: "t", brand: "B", price_min: 0,
      fit_specs: ["305/45R22|118|S", "305/50R20||", "|99|T"],
    } as any)
    expect(p.fitSpecs).toEqual([
      { size: "305/45R22", loadIndex: 118, speedRating: "S" },
      { size: "305/50R20", loadIndex: null, speedRating: null },
    ])
  })

  it("defaults to an empty array when fit_specs is absent (pre-re-sync doc)", () => {
    const p = hitToTireProduct({ id: "t", handle: "h", title: "t", brand: "B", price_min: 0 } as any)
    expect(p.fitSpecs).toEqual([])
  })

  it("still carries the canonical tire_sizes onto the product", () => {
    const p = hitToTireProduct({
      id: "t", handle: "h", title: "t", brand: "B", price_min: 0,
      tire_sizes: ["305/45R22", "305/50R20"],
    } as any)
    expect(p.sizes).toEqual(["305/45R22", "305/50R20"])
  })
})

describe("passesFitFilter (multi-axis post-filter gate)", () => {
  const vehicleOemTires: OemTire[] = [{ size: "305/45R22", loadIndex: 118, speedRating: "S" }]

  it("keeps a product whose spec meets-or-exceeds the OEM tire", () => {
    const fitting = [{ size: "305/45R22", loadIndex: 120, speedRating: "S" }]
    expect(passesFitFilter(fitting, vehicleOemTires)).toBe(true)
  })

  it("drops a size-matched product whose speed rating falls short (Q < S)", () => {
    const shortSpeed = [{ size: "305/45R22", loadIndex: 118, speedRating: "Q" }]
    expect(passesFitFilter(shortSpeed, vehicleOemTires)).toBe(false)
  })

  it("drops a size-matched product whose load index falls short", () => {
    const shortLoad = [{ size: "305/45R22", loadIndex: 110, speedRating: "S" }]
    expect(passesFitFilter(shortLoad, vehicleOemTires)).toBe(false)
  })

  it("drops a product with no matching size at all", () => {
    const otherSize = [{ size: "225/55R18", loadIndex: 200, speedRating: "Y" }]
    expect(passesFitFilter(otherSize, vehicleOemTires)).toBe(false)
  })

  it("keeps a product with no fit_specs yet (pre-re-sync degrade — never vanish before re-sync)", () => {
    expect(passesFitFilter([], vehicleOemTires)).toBe(true)
  })
})
