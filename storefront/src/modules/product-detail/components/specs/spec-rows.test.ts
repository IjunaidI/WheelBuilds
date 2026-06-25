import { describe, it, expect } from "vitest"
import { buildSpecRows } from "./spec-rows"

// A spec object where every numeric is 0/placeholder and every string is null.
const base = {
  construction: null,
  weightLb: 0,
  loadRatingLb: 0,
  centerBoreMm: 0,
  countryOfOrigin: null,
  warranty: null,
  finishOptions: 1,
} as any

const labels = (specs: any) => buildSpecRows(specs).map((r) => r.label)

describe("buildSpecRows", () => {
  it("omits every zero/missing field — no fake placeholders", () => {
    expect(buildSpecRows(base)).toEqual([])
  })
  it("shows real weight in lb when > 0", () => {
    expect(buildSpecRows({ ...base, weightLb: 32 })).toEqual([
      { label: "Per-wheel weight", value: "32 lb" },
    ])
  })
  it("shows load rating in lb when > 0", () => {
    expect(buildSpecRows({ ...base, loadRatingLb: 800 })).toEqual([
      { label: "Load rating", value: "800 lb" },
    ])
  })
  it("shows center bore + hub bore when present", () => {
    expect(labels({ ...base, centerBoreMm: 73, hubBoreMm: 64.1 })).toEqual([
      "Center bore",
      "Hub bore",
    ])
  })
  it("hides finishOptions when 1, shows when > 1", () => {
    expect(labels(base)).not.toContain("Finish options")
    expect(labels({ ...base, finishOptions: 3 })).toContain("Finish options")
  })
  it("shows admin string fields only when set", () => {
    expect(labels({ ...base, construction: "Forged", warranty: "Limited lifetime" })).toEqual([
      "Construction",
      "Warranty",
    ])
  })
})
