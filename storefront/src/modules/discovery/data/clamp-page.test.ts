// storefront/src/modules/discovery/data/clamp-page.test.ts
//
// WB-088 D11 — an out-of-range `?page` must clamp to the last valid page
// instead of rendering the 0-match empty state for a filter combination that
// actually has real matches. Shared by both the wheel (/store) and tire
// (/tires) route pages.
import { describe, it, expect } from "vitest"
import { clampPage, totalPagesFor, withClampedPage } from "./clamp-page"

describe("totalPagesFor (WB-088 D11)", () => {
  it("computes ceil(total / pageSize)", () => {
    expect(totalPagesFor(25, 12)).toBe(3)
    expect(totalPagesFor(24, 12)).toBe(2)
    expect(totalPagesFor(1, 12)).toBe(1)
  })

  it("floors at 1 page even for a genuine 0-match result", () => {
    expect(totalPagesFor(0, 12)).toBe(1)
  })

  it("floors at 1 page when pageSize is 0 or negative (defensive)", () => {
    expect(totalPagesFor(100, 0)).toBe(1)
    expect(totalPagesFor(100, -1)).toBe(1)
  })
})

describe("clampPage (WB-088 D11)", () => {
  it("passes a page already within range through unchanged", () => {
    expect(clampPage(2, 25, 12)).toBe(2)
  })

  it("clamps an out-of-range page down to the last valid page", () => {
    // 25 results at 12/page => 3 pages. Page 999 (e.g. a stale bookmark)
    // must clamp to 3, not render empty.
    expect(clampPage(999, 25, 12)).toBe(3)
  })

  it("clamps to page 1 for a genuine 0-match result regardless of requested page", () => {
    expect(clampPage(5, 0, 12)).toBe(1)
  })

  it("clamps page 0 or negative up to page 1 (defensive floor)", () => {
    expect(clampPage(0, 25, 12)).toBe(1)
    expect(clampPage(-3, 25, 12)).toBe(1)
  })

  it("is a no-op at the exact last-page boundary", () => {
    expect(clampPage(3, 25, 12)).toBe(3)
  })
})

describe("withClampedPage (WB-088 D11)", () => {
  it("drops the page param entirely when clamped to page 1", () => {
    expect(withClampedPage({ page: "999", brands: "Petrol" }, 1)).toBe(
      "brands=Petrol"
    )
  })

  it("sets page when clamped to a page > 1", () => {
    expect(withClampedPage({ page: "999", brands: "Petrol" }, 3)).toBe(
      "brands=Petrol&page=3"
    )
  })

  it("preserves multi-value (array) params untouched", () => {
    const qs = withClampedPage({ page: "50", brands: ["Petrol", "Alloy"] }, 2)
    expect(qs).toBe("brands=Petrol&brands=Alloy&page=2")
  })

  it("preserves params with no page param present, still appending the clamp", () => {
    expect(withClampedPage({ q: "nomad" }, 2)).toBe("q=nomad&page=2")
  })

  it("skips undefined values", () => {
    expect(withClampedPage({ page: "5", brands: undefined }, 1)).toBe("")
  })
})
