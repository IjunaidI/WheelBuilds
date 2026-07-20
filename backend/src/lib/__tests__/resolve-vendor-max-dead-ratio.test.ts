import { resolveVendorMaxDeadRatio } from "../resolve-vendor-max-dead-ratio"

describe("resolveVendorMaxDeadRatio (WB-115 premerge review round 2 — Important 1)", () => {
  it("per-vendor env wins over both the global env and the hardcoded default", () => {
    expect(resolveVendorMaxDeadRatio("0.55", "0.40", 0.4)).toBe(0.55)
  })

  it("falls back to the global env when the per-vendor env is unset", () => {
    expect(resolveVendorMaxDeadRatio(undefined, "0.45", 0.4)).toBe(0.45)
  })

  it("falls back to the hardcoded default when neither env is set", () => {
    expect(resolveVendorMaxDeadRatio(undefined, undefined, 0.4)).toBe(0.4)
  })

  it("wheels default matches the documented 0.40", () => {
    expect(resolveVendorMaxDeadRatio(undefined, undefined, 0.4)).toBe(0.4)
  })

  it("tires default matches the documented 0.70", () => {
    expect(resolveVendorMaxDeadRatio(undefined, undefined, 0.7)).toBe(0.7)
  })

  it("per-vendor env is independent per call -- wheels and tires can be set differently in the same process", () => {
    expect(resolveVendorMaxDeadRatio("0.5", undefined, 0.4)).toBe(0.5)
    expect(resolveVendorMaxDeadRatio("0.8", undefined, 0.7)).toBe(0.8)
  })

  it("a malformed per-vendor value parses to NaN rather than being caught here -- the caller's downstream Number.isFinite guard (pipeline/stage.ts) is responsible for that", () => {
    expect(Number.isNaN(resolveVendorMaxDeadRatio("not-a-number", undefined, 0.4))).toBe(true)
  })

  it("an empty-string per-vendor env is treated as SET (not unset) and parses to NaN, deferring to the downstream guard rather than silently falling through to the global/default", () => {
    // Mirrors how every other numeric env var in this codebase is parsed
    // (parseInt/parseFloat directly on the raw string) -- an explicitly-set
    // but empty value is the operator's problem to fix, not something this
    // resolver should paper over by falling through to a lower-priority
    // source.
    expect(Number.isNaN(resolveVendorMaxDeadRatio("", "0.45", 0.4))).toBe(true)
  })
})
