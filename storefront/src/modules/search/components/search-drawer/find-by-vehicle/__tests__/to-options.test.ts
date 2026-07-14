import { describe, it, expect } from "vitest"
import { toOptions } from "../to-options"

// Captured shape of a wheel-size `/modifications/` response (Task-1 findings,
// docs/done/specs/2026-05-30-wheel-size-task1-findings.md §5): `{ data: [{ slug,
// name, ... }] }`, where `slug` is the hash `by_model`'s `modification` param
// narrows on (e.g. "32b586f1cd") and `name` is the human trim label (e.g.
// "3.5 EX AWD"). If the drawer ever fell back to `name` as the option VALUE,
// trim narrowing would silently break — `resolveFitmentForVehicle` sends the
// option value straight through as `modificationSlug`, and a display name is
// not a valid wheel-size slug.
const modificationsFixture = {
  data: [
    { slug: "32b586f1cd", name: "3.5 EX AWD", trim: "EX AWD" },
    { slug: "7a1c9e0f42", name: "3.5 SE FWD", trim: "SE FWD" },
  ],
}

describe("toOptions", () => {
  it("prefers slug as the option value when the item has one (modifications payload)", () => {
    const opts = toOptions(modificationsFixture)
    expect(opts).toEqual([
      { value: "32b586f1cd", label: "3.5 EX AWD" },
      { value: "7a1c9e0f42", label: "3.5 SE FWD" },
    ])
    // The value is the slug, NOT the display name — this is the exact
    // regression this test guards against.
    expect(opts[0].value).not.toBe(modificationsFixture.data[0].name)
  })

  it("falls back to value, then id, then name, in that order, when slug is absent", () => {
    expect(toOptions({ data: [{ value: "v1", id: "id1", name: "N1" }] })).toEqual([
      { value: "v1", label: "N1" },
    ])
    expect(toOptions({ data: [{ id: "id1", name: "N1" }] })).toEqual([
      { value: "id1", label: "N1" },
    ])
    expect(toOptions({ data: [{ name: "N1" }] })).toEqual([{ value: "N1", label: "N1" }])
  })

  it("drops items with no usable value and tolerates a bare array or bare scalars", () => {
    expect(toOptions({ data: [{ label: "no value here" }, null] })).toEqual([])
    expect(toOptions([{ slug: "s1", name: "N1" }])).toEqual([{ value: "s1", label: "N1" }])
    expect(toOptions({ data: ["2021", 2022] })).toEqual([
      { value: "2021", label: "2021" },
      { value: "2022", label: "2022" },
    ])
  })

  it("returns an empty array for a missing or malformed payload", () => {
    expect(toOptions(undefined)).toEqual([])
    expect(toOptions(null)).toEqual([])
    expect(toOptions({})).toEqual([])
  })
})
