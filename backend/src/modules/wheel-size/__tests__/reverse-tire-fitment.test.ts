import { buildReverseTireFitment } from "../reverse-tire-fitment"

// raw with both a display identity AND is_stock front tires (what extractOemTireSizes reads).
const rawOf = (
  make: string | null,
  model: string | null,
  trim: string | undefined,
  start: number | null,
  end: number | null,
  tires: string[]
) => ({
  data: [{
    make: make ? { name: make } : undefined,
    model: model ? { name: model } : undefined,
    trim, start_year: start, end_year: end,
    wheels: tires.map((t) => ({ is_stock: true, front: { tire: t }, rear: { tire: t } })),
  }],
})

const ok = (make: string, model: string, trim: string | undefined, start: number, end: number, tires: string[]) =>
  ({ status: "ok", raw: rawOf(make, model, trim, start, end, tires) })

describe("buildReverseTireFitment", () => {
  it("returns deduped, sorted, capped matches on canonical size intersection", () => {
    const rows = [
      ok("Toyota", "Tacoma", undefined, 2016, 2023, ["265/70R16"]),
      ok("Honda", "Accord", "Sport", 2018, 2022, ["235/40R19", "225/50R18"]),
      ok("Honda", "Accord", "Sport", 2018, 2022, ["235/40R19"]), // duplicate identity
    ]
    const out = buildReverseTireFitment(rows, ["235/40R19", "265/70R16"], 24)
    expect(out.map((v) => `${v.make} ${v.model}`)).toEqual(["Honda Accord", "Toyota Tacoma"]) // sorted + deduped
    expect(out[0]).toMatchObject({ year: "2018–2022", trim: "Sport", size: "235/40R19" })
  })
  it("skips non-ok rows and rows with no size intersection", () => {
    const rows = [
      { status: "not_found", raw: rawOf("A", "B", undefined, 2020, 2020, ["235/40R19"]) },
      ok("C", "D", undefined, 2020, 2020, ["205/55R16"]), // no overlap with product
    ]
    expect(buildReverseTireFitment(rows, ["235/40R19"], 24)).toEqual([])
  })
  it("skips identity-less rows", () => {
    const rows = [ok(null, "B", undefined, 2020, 2020, ["235/40R19"])]
    expect(buildReverseTireFitment(rows, ["235/40R19"], 24)).toEqual([])
  })
  it("caps at the limit", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ok(`Make${i}`, "M", undefined, 2020, 2020, ["235/40R19"]))
    expect(buildReverseTireFitment(rows, ["235/40R19"], 3)).toHaveLength(3)
  })
  it("returns empty when the product has no sizes", () => {
    expect(buildReverseTireFitment([ok("A", "B", undefined, 2020, 2020, ["235/40R19"])], [], 24)).toEqual([])
  })
})
