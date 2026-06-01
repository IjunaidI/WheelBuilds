import { it, expect, describe } from "vitest"
import { vehiclesToMerge } from "./merge"
const v = (year: number, make: string, model: string, trim?: string) =>
  ({ id: `${make}-${model}`, year, make, model, trim, savedAt: "t" }) as any
describe("vehiclesToMerge", () => {
  it("skips local vehicles already present in the account (year+make+model+trim, case-insensitive)", () => {
    const local = [v(2021, "Ford", "F-150", "XLT"), v(2018, "Jeep", "Wrangler")]
    const remote = [v(2021, "ford", "f-150", "xlt")]
    const out = vehiclesToMerge(local, remote)
    expect(out.map((x) => x.model)).toEqual(["Wrangler"]) // only the non-duplicate
    expect((out[0] as any).id).toBeUndefined()            // returns NewVehicle (no id/savedAt)
  })
  it("returns [] when local is empty", () => { expect(vehiclesToMerge([], [v(2020,"a","b")])).toEqual([]) })
})

import { planMerge } from "./merge"

describe("planMerge", () => {
  it("returns [] when the remote load did not succeed (never merge into an unknown account)", () => {
    const local = [v(2021, "Ford", "F-150", "XLT")]
    expect(planMerge(local, [], false)).toEqual([])
  })
  it("dedupes against the loaded remote when load succeeded", () => {
    const local = [v(2021, "Ford", "F-150", "XLT"), v(2018, "Jeep", "Wrangler")]
    const remote = [v(2021, "ford", "f-150", "xlt")]
    expect(planMerge(local, remote, true).map((x) => x.model)).toEqual(["Wrangler"])
  })
})
