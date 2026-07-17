import { describe, it, expect } from "vitest"
import { canSubmitYmm } from "../can-submit"

// WB-113: the sub-model select is now MANDATORY — Make/Model/Year alone no
// longer unlock "Find My Fit". This repo's vitest config has no jsdom/RTL
// (environment: "node" — see vitest.config.ts), so the mandatory-gate rule
// is pinned here as a pure fn rather than by mounting the component.
const base = {
  year: "2019",
  make: "toyota",
  model: "corolla",
  subModel: "LE",
  submitting: false,
}

describe("canSubmitYmm", () => {
  it("true when year/make/model/subModel are all set and not submitting", () => {
    expect(canSubmitYmm(base)).toBe(true)
  })

  it("true when subModel is the Base fallback (still a real, non-empty pick)", () => {
    expect(canSubmitYmm({ ...base, subModel: "Base" })).toBe(true)
  })

  it("false when subModel is unset — the WB-113 mandatory gate", () => {
    expect(canSubmitYmm({ ...base, subModel: "" })).toBe(false)
  })

  it("false when year, make, or model is unset", () => {
    expect(canSubmitYmm({ ...base, year: "" })).toBe(false)
    expect(canSubmitYmm({ ...base, make: "" })).toBe(false)
    expect(canSubmitYmm({ ...base, model: "" })).toBe(false)
  })

  it("false while submitting even with every field set", () => {
    expect(canSubmitYmm({ ...base, submitting: true })).toBe(false)
  })
})
