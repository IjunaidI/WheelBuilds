// storefront/src/modules/discovery/components/fitment-sync/__tests__/strip-fit.test.ts
import { describe, it, expect } from "vitest"
import { shouldStripFit, FIT_PARAM_KEYS } from "../strip-fit"

describe("FIT_PARAM_KEYS", () => {
  it("is the full set FitmentSync's sync-down path writes", () => {
    expect(FIT_PARAM_KEYS).toEqual(["fit", "fitb", "fitd", "fitw", "fito"])
  })
})

describe("shouldStripFit", () => {
  it("strips once genuinely loaded, no active vehicle, and a fit param present", () => {
    expect(
      shouldStripFit({ isLoaded: true, hasActive: false, hasFitParam: true, isExplicitOptOut: false })
    ).toBe(true)
  })

  it("never strips while the garage is still loading — no boot flicker", () => {
    expect(
      shouldStripFit({ isLoaded: false, hasActive: false, hasFitParam: true, isExplicitOptOut: false })
    ).toBe(false)
  })

  it("never strips the explicit fit=0 opt-out, even when loaded and empty", () => {
    expect(
      shouldStripFit({ isLoaded: true, hasActive: false, hasFitParam: true, isExplicitOptOut: true })
    ).toBe(false)
  })

  it("does not strip while there's an active vehicle with usable fitment data", () => {
    expect(
      shouldStripFit({ isLoaded: true, hasActive: true, hasFitParam: true, isExplicitOptOut: false })
    ).toBe(false)
  })

  it("no-ops when there's nothing to strip (no fit param in the URL)", () => {
    expect(
      shouldStripFit({ isLoaded: true, hasActive: false, hasFitParam: false, isExplicitOptOut: false })
    ).toBe(false)
  })

  it("opt-out wins even mid-load (loading + opt-out + fit param)", () => {
    expect(
      shouldStripFit({ isLoaded: false, hasActive: false, hasFitParam: true, isExplicitOptOut: true })
    ).toBe(false)
  })

  it("an active vehicle wins over a stale fit param even mid-load", () => {
    expect(
      shouldStripFit({ isLoaded: false, hasActive: true, hasFitParam: true, isExplicitOptOut: false })
    ).toBe(false)
  })

  it("still loading + no active + no fit param stays false (nothing to do either way)", () => {
    expect(
      shouldStripFit({ isLoaded: false, hasActive: false, hasFitParam: false, isExplicitOptOut: false })
    ).toBe(false)
  })
})

describe("shouldStripFit — fitmentPending (the 'Find My Fit does nothing' guard)", () => {
  it("does NOT strip while an active vehicle's fitment lookup is still in flight", () => {
    // The YMM submit window: add() -> setActive() -> await lookup -> update().
    // Stripping here fires a router.replace that the post-update replace
    // immediately contradicts; the pair can strand the navigation entirely.
    expect(
      shouldStripFit({
        isLoaded: true,
        hasActive: false,
        hasFitParam: true,
        isExplicitOptOut: false,
        fitmentPending: true,
      })
    ).toBe(false)
  })

  it("DOES strip once the lookup has landed and genuinely found nothing", () => {
    expect(
      shouldStripFit({
        isLoaded: true,
        hasActive: false,
        hasFitParam: true,
        isExplicitOptOut: false,
        fitmentPending: false,
      })
    ).toBe(true)
  })

  it("omitting fitmentPending preserves the pre-existing behavior exactly", () => {
    expect(
      shouldStripFit({
        isLoaded: true,
        hasActive: false,
        hasFitParam: true,
        isExplicitOptOut: false,
      })
    ).toBe(true)
  })

  it("a pending lookup still never overrides an explicit opt-out", () => {
    expect(
      shouldStripFit({
        isLoaded: true,
        hasActive: false,
        hasFitParam: true,
        isExplicitOptOut: true,
        fitmentPending: true,
      })
    ).toBe(false)
  })
})
