import { extractVehicleIdentity, matchedPattern, buildReverseFitment } from "../reverse-fitment"

// `trim` accepts either a single value (builds a single-entry `data`, as
// before — narrowed to one trim) or an array of per-entry trims (builds one
// `data` entry per array element, all sharing make/model/years) so callers
// can construct multi-trim "union" rows (WB-077) to exercise WB-104 T1's
// trim-honesty rule in `extractVehicleIdentity`.
const rawOf = (
  make: string | null,
  model: string | null,
  trim: string | undefined | (string | undefined)[],
  start: number | null,
  end: number | null
) => {
  const trims = Array.isArray(trim) ? trim : [trim]
  return {
    data: trims.map((t) => ({
      make: make ? { name: make } : undefined,
      model: model ? { name: model } : undefined,
      trim: t, start_year: start, end_year: end,
    })),
  }
}

describe("extractVehicleIdentity", () => {
  it("reads make/model/trim and a year range", () => {
    expect(extractVehicleIdentity(rawOf("Mitsubishi", "Outlander", "3.0i", 2014, 2020))).toEqual({
      make: "Mitsubishi", model: "Outlander", trim: "3.0i", yearLabel: "2014–2020", trimNarrowed: true,
    })
  })
  it("collapses an equal start/end year to a single year", () => {
    expect(extractVehicleIdentity(rawOf("Honda", "Accord", undefined, 2021, 2021))?.yearLabel).toBe("2021")
  })
  it("yields an empty year label when years are absent", () => {
    expect(extractVehicleIdentity(rawOf("Ford", "F-150", undefined, null, null))?.yearLabel).toBe("")
  })
  it("returns null when make or model is missing, or raw is empty", () => {
    expect(extractVehicleIdentity(rawOf(null, "X", undefined, 2020, 2020))).toBeNull()
    expect(extractVehicleIdentity(null)).toBeNull()
  })

  // WB-104 T1: WB-077 unioned every matched trim's fitment into one cached
  // row's `raw.data`. `extractVehicleIdentity` must not attribute that union
  // to whichever trim happens to sit at `raw.data[0]`.
  describe("trim honesty (WB-104 T1)", () => {
    it("claims no trim when raw.data has more than one DISTINCT trim (a union row)", () => {
      expect(extractVehicleIdentity(rawOf("Mitsubishi", "Outlander", ["3.0i", "3.0i SE"], 2014, 2020))).toEqual({
        make: "Mitsubishi", model: "Outlander", trim: undefined, yearLabel: "2014–2020", trimNarrowed: false,
      })
    })
    it("keeps the trim for a single-entry row and marks it trimNarrowed", () => {
      expect(extractVehicleIdentity(rawOf("Honda", "Accord", "Sport", 2018, 2022))).toEqual({
        make: "Honda", model: "Accord", trim: "Sport", yearLabel: "2018–2022", trimNarrowed: true,
      })
    })
    it("keeps the trim for a multi-entry row when every entry shares one trim, but is NOT trimNarrowed", () => {
      expect(extractVehicleIdentity(rawOf("Honda", "Accord", ["Sport", "Sport"], 2018, 2022))).toEqual({
        make: "Honda", model: "Accord", trim: "Sport", yearLabel: "2018–2022", trimNarrowed: false,
      })
    })
    it("claims no trim for a MIXED known/unknown-trim union row (one entry named, one missing)", () => {
      // Entry A has trim "Sport", entry B has no trim at all — a naive
      // .filter(Boolean)-then-dedupe would collapse this to size-1 {"Sport"}
      // and wrongly claim trim: "Sport". The honest rule treats the missing
      // trim as its own distinct value, so this must claim NO trim.
      expect(extractVehicleIdentity(rawOf("Honda", "Accord", ["Sport", undefined], 2018, 2022))).toEqual({
        make: "Honda", model: "Accord", trim: undefined, yearLabel: "2018–2022", trimNarrowed: false,
      })
    })
  })
})

describe("matchedPattern", () => {
  const row = { canonical_bolt_patterns: ["5x114.3"], hub_bore_mm_x100: 6710 }
  it("returns the intersecting pattern when bolt + bore both pass", () => {
    expect(matchedPattern(row, ["5x120", "5x114.3"], 70)).toBe("5x114.3")
  })
  it("returns null when no bolt pattern intersects", () => {
    expect(matchedPattern(row, ["5x120"], 70)).toBeNull()
  })
  it("returns null when the wheel bore is smaller than the hub", () => {
    expect(matchedPattern(row, ["5x114.3"], 60)).toBeNull()
  })
  it("passes the bore gate when either value is unknown", () => {
    expect(matchedPattern({ canonical_bolt_patterns: ["5x114.3"], hub_bore_mm_x100: null }, ["5x114.3"], 60)).toBe("5x114.3")
    expect(matchedPattern(row, ["5x114.3"], null)).toBe("5x114.3")
  })
})

// WB-091 P5: `wheelBoreMm` can be a SET of the product's per-size bores — a
// multi-bore wheel should match if ANY bore clears the hub, instead of being
// gated by whichever single bore (e.g. an arbitrary variants[0] pick) the
// caller happened to supply.
describe("matchedPattern with a bore SET", () => {
  const row = { canonical_bolt_patterns: ["5x114.3"], hub_bore_mm_x100: 6710 } // hub 67.1

  it("matches when at least one bore in the set clears the hub, even if others don't", () => {
    expect(matchedPattern(row, ["5x114.3"], [60, 70])).toBe("5x114.3") // 60 fails, 70 clears
  })
  it("returns null when EVERY bore in the set fails to clear the hub", () => {
    expect(matchedPattern(row, ["5x114.3"], [50, 60])).toBeNull()
  })
  it("treats an empty bore set as unknown data — passes the gate", () => {
    expect(matchedPattern(row, ["5x114.3"], [])).toBe("5x114.3")
  })
  it("a null entry within the set is an unknown bore for that size — clears on its own", () => {
    expect(matchedPattern(row, ["5x114.3"], [null, 50])).toBe("5x114.3") // null always clears
  })
})

describe("buildReverseFitment", () => {
  const ok = (make: string, model: string, trim: string | undefined | (string | undefined)[], start: number, end: number, pats: string[], hub: number | null) =>
    ({ status: "ok", canonical_bolt_patterns: pats, hub_bore_mm_x100: hub == null ? null : Math.round(hub * 100), raw: rawOf(make, model, trim, start, end) })

  it("returns deduped, sorted, capped matches", () => {
    const rows = [
      ok("Toyota", "Tacoma", undefined, 2016, 2023, ["6x139.7"], 67),
      ok("Honda", "Accord", "Sport", 2018, 2022, ["5x114.3"], 64.1),
      ok("Honda", "Accord", "Sport", 2018, 2022, ["5x114.3"], 64.1), // duplicate
    ]
    const out = buildReverseFitment(rows, ["5x114.3", "6x139.7"], 70, 24)
    expect(out.map((v) => `${v.make} ${v.model}`)).toEqual(["Honda Accord", "Toyota Tacoma"]) // sorted, deduped
    expect(out[0]).toMatchObject({ year: "2018–2022", trim: "Sport", boltPattern: "5x114.3" })
  })
  it("skips non-ok rows and bore failures", () => {
    const rows = [
      { status: "not_found", canonical_bolt_patterns: ["5x114.3"], hub_bore_mm_x100: 6400, raw: rawOf("A", "B", undefined, 2020, 2020) },
      ok("C", "D", undefined, 2020, 2020, ["5x114.3"], 80), // hub 80 > wheel bore 70 → bore fail
    ]
    expect(buildReverseFitment(rows, ["5x114.3"], 70, 24)).toEqual([])
  })
  it("caps at the limit", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ok(`Make${i}`, "M", undefined, 2020, 2020, ["5x114.3"], 60))
    expect(buildReverseFitment(rows, ["5x114.3"], 70, 3)).toHaveLength(3)
  })
  it("returns empty when the product has no patterns", () => {
    expect(buildReverseFitment([ok("A", "B", undefined, 2020, 2020, ["5x114.3"], 60)], [], 70, 24)).toEqual([])
  })

  // WB-104 T1: a union row (WB-077 multi-trim cache entry) must not surface
  // an arbitrary trim in the confirmed-models list.
  it("emits no trim (and trimNarrowed: false) for a union row with >1 distinct trims", () => {
    const rows = [ok("Honda", "Accord", ["Sport", "Sport SE"], 2018, 2022, ["5x114.3"], 64.1)]
    const out = buildReverseFitment(rows, ["5x114.3"], 70, 24)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ make: "Honda", model: "Accord", trim: undefined, trimNarrowed: false })
  })
})

describe("buildReverseFitment size-window gate (WB-072 S2)", () => {
  const okWithWindows = (
    make: string,
    model: string,
    pats: string[],
    hub: number | null,
    diameter_window: { min: number; max: number } | null,
    width_window: { min: number; max: number } | null,
    offset_window: { min: number; max: number } | null
  ) => ({
    status: "ok",
    canonical_bolt_patterns: pats,
    hub_bore_mm_x100: hub == null ? null : Math.round(hub * 100),
    diameter_window,
    width_window,
    offset_window,
    raw: rawOf(make, model, undefined, 2020, 2020),
  })

  const accordWindows = okWithWindows(
    "Honda", "Accord", ["5x114.3"], 64.1,
    { min: 17, max: 18 }, { min: 7, max: 8 }, { min: 35, max: 45 }
  )

  it("EXCLUDES a bolt+bore match whose spec windows exclude the product's only size (S2)", () => {
    // 20x9 ET25 is outside all three of the vehicle's windows.
    const sizes = [{ diameter: 20, width: 9, offset: 25 }]
    expect(buildReverseFitment([accordWindows], ["5x114.3"], 70, 24, sizes)).toEqual([])
  })

  it("INCLUDES when at least one product size falls within all three windows", () => {
    const sizes = [
      { diameter: 20, width: 9, offset: 25 }, // out of window
      { diameter: 17, width: 7.5, offset: 40 }, // in window
    ]
    expect(buildReverseFitment([accordWindows], ["5x114.3"], 70, 24, sizes)).toHaveLength(1)
  })

  it("BACKWARD-COMPAT: no sizes passed keeps the old bolt+bore-only behavior", () => {
    expect(buildReverseFitment([accordWindows], ["5x114.3"], 70, 24)).toHaveLength(1)
    expect(buildReverseFitment([accordWindows], ["5x114.3"], 70, 24, [])).toHaveLength(1)
  })

  it("a null window on the vehicle can't be checked, so it passes", () => {
    const noWindows = okWithWindows("Toyota", "Tacoma", ["6x139.7"], 67, null, null, null)
    const sizes = [{ diameter: 999, width: 999, offset: 999 }]
    expect(buildReverseFitment([noWindows], ["6x139.7"], 70, 24, sizes)).toHaveLength(1)
  })
})
