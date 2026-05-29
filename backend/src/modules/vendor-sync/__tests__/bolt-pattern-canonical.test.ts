import { canonicalBoltPatterns } from "../search/bolt-pattern-canonical"

describe("canonicalBoltPatterns", () => {
  it("normalizes a millimetre pattern", () => {
    expect(canonicalBoltPatterns("5X120")).toEqual(["5x120"])
  })

  it("converts an inch pattern to millimetres", () => {
    // 5.0 in × 25.4 = 127.0 mm
    expect(canonicalBoltPatterns("5X5.0")).toEqual(["5x127"])
  })

  it("preserves a one-decimal standard PCD", () => {
    expect(canonicalBoltPatterns("5X114.3")).toEqual(["5x114.3"])
  })

  it("snaps a near-standard value to the standard PCD", () => {
    // 4.49 in × 25.4 = 114.046 mm → rounds to 114.0 → snaps to 114.3 (within 1.0 mm)
    expect(canonicalBoltPatterns("5X4.49")).toEqual(["5x114.3"])
  })

  it("splits a dual-drilled pattern, sharing the lug count", () => {
    // 6 lug, 135 mm and 5.5 in (139.7 mm)
    expect(canonicalBoltPatterns("6X135/5.5")).toEqual(["6x135", "6x139.7"])
  })

  it("passes through a value with no standard PCD within 1.0 mm", () => {
    // 155 mm: nearest standards (150, 160) are 5 mm away → no snap, returns rounded.
    expect(canonicalBoltPatterns("6X155")).toEqual(["6x155"])
  })

  it("returns an empty array for unparseable input", () => {
    expect(canonicalBoltPatterns("")).toEqual([])
    expect(canonicalBoltPatterns("N/A")).toEqual([])
  })
})
