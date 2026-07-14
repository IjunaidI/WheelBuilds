// storefront/src/modules/tire-discovery/components/filter-rail/mobile-trigger-copy.test.ts
//
// WB-088 Task 4 (D7) — parity port of the wheel
// discovery/components/filter-rail/mobile-trigger-copy.test.ts.
// TireMobileFilterTrigger renders on the same screen as TireHeader on
// viewports under `small`. Before this fix it always showed the raw
// `totalCount` ("200 results") even when fit mode's candidate cap made that
// count untrustworthy — directly contradicting the header's honest "TOP 200
// CANDIDATES — REFINE TO NARROW" label shown at the same time. These pure
// label builders are what the component renders, extracted so the
// honest-label branch is unit-testable without a React render harness (no
// RTL/jsdom component-test infra in this repo — mirrors the
// get-tire-products.cap.test.ts pure-function pattern).
import { describe, it, expect } from "vitest"
import { mobileTriggerLabel, mobileDrawerCta } from "./mobile-trigger-copy"
import { FIT_CANDIDATE_CAP } from "../../data/types"

describe("mobileTriggerLabel (WB-088 D7)", () => {
  it("shows the precise count when not capped (singular)", () => {
    expect(mobileTriggerLabel(1, false)).toBe("1 result")
  })

  it("shows the precise count when not capped (plural)", () => {
    expect(mobileTriggerLabel(42, false)).toBe("42 results")
  })

  it("does NOT show the raw totalCount when capped, even if totalCount looks precise", () => {
    const label = mobileTriggerLabel(200, true)
    expect(label).not.toBe("200 results")
    expect(label).not.toMatch(/\bresults\b/)
  })

  it("shows the honest cap label built from FIT_CANDIDATE_CAP when capped", () => {
    expect(mobileTriggerLabel(200, true)).toBe(
      `Top ${FIT_CANDIDATE_CAP.toLocaleString()} candidates`
    )
  })

  it("is consistent with the header's cap vocabulary (candidates, not matches/results)", () => {
    expect(mobileTriggerLabel(200, true)).toContain("candidates")
    expect(mobileTriggerLabel(200, true)).not.toMatch(/matches/i)
  })
})

describe("mobileDrawerCta (WB-088 D7)", () => {
  it("shows the precise count when not capped (singular)", () => {
    expect(mobileDrawerCta(1, false)).toBe("View 1 result")
  })

  it("shows the precise count when not capped (plural)", () => {
    expect(mobileDrawerCta(42, false)).toBe("View 42 results")
  })

  it("does NOT show the raw totalCount when capped, even if totalCount looks precise", () => {
    const cta = mobileDrawerCta(200, true)
    expect(cta).not.toBe("View 200 results")
    expect(cta).not.toMatch(/\bresults\b/)
  })

  it("shows the honest cap CTA built from FIT_CANDIDATE_CAP when capped", () => {
    expect(mobileDrawerCta(200, true)).toBe(
      `View top ${FIT_CANDIDATE_CAP.toLocaleString()} candidates`
    )
  })
})
