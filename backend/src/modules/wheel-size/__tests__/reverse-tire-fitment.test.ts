import { buildReverseTireFitment } from "../reverse-tire-fitment"

// raw with both a display identity AND is_stock front tires (what extractOemTires reads).
// `tires` entries carry size + optional load index + speed rating so fixtures can
// exercise the multi-axis gate (meet-or-exceed on load + speed rank).
const rawOf = (
  make: string | null,
  model: string | null,
  trim: string | undefined,
  start: number | null,
  end: number | null,
  tires: { size: string; loadIndex?: number | null; speedRating?: string | null }[]
) => ({
  data: [{
    make: make ? { name: make } : undefined,
    model: model ? { name: model } : undefined,
    trim, start_year: start, end_year: end,
    wheels: tires.map((t) => ({
      is_stock: true,
      front: { tire: t.size, load_index: t.loadIndex ?? null, speed_index: t.speedRating ?? null },
      rear: { tire: t.size, load_index: t.loadIndex ?? null, speed_index: t.speedRating ?? null },
    })),
  }],
})

const ok = (
  make: string,
  model: string,
  trim: string | undefined,
  start: number,
  end: number,
  tires: { size: string; loadIndex?: number | null; speedRating?: string | null }[]
) => ({ status: "ok", raw: rawOf(make, model, trim, start, end, tires) })

// Convenience for building a productSpecs entry (the shape buildReverseTireFitment now takes).
const spec = (size: string, loadIndex: number | null = null, speedRating: string | null = null) => ({
  size,
  loadIndex,
  speedRating,
})

describe("buildReverseTireFitment", () => {
  it("returns deduped, sorted, capped matches on canonical size intersection", () => {
    const rows = [
      ok("Toyota", "Tacoma", undefined, 2016, 2023, [{ size: "265/70R16" }]),
      ok("Honda", "Accord", "Sport", 2018, 2022, [{ size: "235/40R19" }, { size: "225/50R18" }]),
      ok("Honda", "Accord", "Sport", 2018, 2022, [{ size: "235/40R19" }]), // duplicate identity
    ]
    const out = buildReverseTireFitment(rows, [spec("235/40R19"), spec("265/70R16")], 24)
    expect(out.map((v) => `${v.make} ${v.model}`)).toEqual(["Honda Accord", "Toyota Tacoma"]) // sorted + deduped
    expect(out[0]).toMatchObject({ year: "2018–2022", trim: "Sport", size: "235/40R19" })
  })

  it("skips non-ok rows and rows with no size intersection", () => {
    const rows = [
      { status: "not_found", raw: rawOf("A", "B", undefined, 2020, 2020, [{ size: "235/40R19" }]) },
      ok("C", "D", undefined, 2020, 2020, [{ size: "205/55R16" }]), // no overlap with product
    ]
    expect(buildReverseTireFitment(rows, [spec("235/40R19")], 24)).toEqual([])
  })

  it("skips identity-less rows", () => {
    const rows = [ok(null, "B", undefined, 2020, 2020, [{ size: "235/40R19" }])]
    expect(buildReverseTireFitment(rows, [spec("235/40R19")], 24)).toEqual([])
  })

  it("caps at the limit", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ok(`Make${i}`, "M", undefined, 2020, 2020, [{ size: "235/40R19" }]))
    expect(buildReverseTireFitment(rows, [spec("235/40R19")], 3)).toHaveLength(3)
  })

  it("returns empty when the product has no specs", () => {
    expect(buildReverseTireFitment([ok("A", "B", undefined, 2020, 2020, [{ size: "235/40R19" }])], [], 24)).toEqual([])
  })

  it("excludes a size match whose load index is below the OEM tire's", () => {
    const rows = [ok("Honda", "Accord", undefined, 2020, 2020, [{ size: "235/40R19", loadIndex: 96, speedRating: "V" }])]
    // spec load index 90 < oem 96 -> excluded even though size matches
    expect(buildReverseTireFitment(rows, [spec("235/40R19", 90, "V")], 24)).toEqual([])
  })

  it("excludes a size match whose speed rating rank is below the OEM tire's", () => {
    const rows = [ok("Honda", "Accord", undefined, 2020, 2020, [{ size: "235/40R19", loadIndex: 96, speedRating: "V" }])]
    // spec speed "S" ranks below oem "V" -> excluded even though size + load match
    expect(buildReverseTireFitment(rows, [spec("235/40R19", 96, "S")], 24)).toEqual([])
  })

  it("includes a spec that meets or exceeds the OEM load index and speed rating", () => {
    const rows = [ok("Honda", "Accord", undefined, 2020, 2020, [{ size: "235/40R19", loadIndex: 96, speedRating: "V" }])]
    const out = buildReverseTireFitment(rows, [spec("235/40R19", 98, "W")], 24)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ make: "Honda", model: "Accord", size: "235/40R19" })
  })

  it("passes the load/speed gate when either side is missing that data", () => {
    const rows = [
      // OEM tire has no load/speed data at all.
      ok("Honda", "Accord", undefined, 2020, 2020, [{ size: "235/40R19" }]),
    ]
    // A spec with load/speed still matches because the OEM side is null (missing passes).
    expect(buildReverseTireFitment(rows, [spec("235/40R19", 90, "S")], 24)).toHaveLength(1)

    const rowsWithOemData = [
      ok("Toyota", "Tacoma", undefined, 2020, 2020, [{ size: "265/70R16", loadIndex: 112, speedRating: "T" }]),
    ]
    // A spec missing load/speed still matches because missing spec data passes too.
    expect(buildReverseTireFitment(rowsWithOemData, [spec("265/70R16")], 24)).toHaveLength(1)
  })
})
