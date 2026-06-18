import { extractVehicleIdentity, matchedPattern, buildReverseFitment } from "../reverse-fitment"

const rawOf = (
  make: string | null,
  model: string | null,
  trim: string | undefined,
  start: number | null,
  end: number | null
) => ({
  data: [{
    make: make ? { name: make } : undefined,
    model: model ? { name: model } : undefined,
    trim, start_year: start, end_year: end,
  }],
})

describe("extractVehicleIdentity", () => {
  it("reads make/model/trim and a year range", () => {
    expect(extractVehicleIdentity(rawOf("Mitsubishi", "Outlander", "3.0i", 2014, 2020))).toEqual({
      make: "Mitsubishi", model: "Outlander", trim: "3.0i", yearLabel: "2014–2020",
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
})

describe("matchedPattern", () => {
  const row = { canonical_bolt_patterns: ["5x114.3"], hub_bore_mm: 67.1 }
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
    expect(matchedPattern({ canonical_bolt_patterns: ["5x114.3"], hub_bore_mm: null }, ["5x114.3"], 60)).toBe("5x114.3")
    expect(matchedPattern(row, ["5x114.3"], null)).toBe("5x114.3")
  })
})

describe("buildReverseFitment", () => {
  const ok = (make: string, model: string, trim: string | undefined, start: number, end: number, pats: string[], hub: number | null) =>
    ({ status: "ok", canonical_bolt_patterns: pats, hub_bore_mm: hub, raw: rawOf(make, model, trim, start, end) })

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
      { status: "not_found", canonical_bolt_patterns: ["5x114.3"], hub_bore_mm: 64, raw: rawOf("A", "B", undefined, 2020, 2020) },
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
})
