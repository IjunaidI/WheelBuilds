// storefront/src/modules/discovery/data/pcd-inch-label.test.ts
//
// WB-088 D4 — the bolt-pattern facet now filters on the canonical
// `bolt_patterns_canonical` field ("{count}x{pcd_mm}"), so one physical
// pattern no longer splits into several raw-string checkboxes. This pure
// helper renders the canonical value as a dual-unit label (mm + inch) —
// golden-guarded like the other bolt-pattern/finish twins because a wrong
// inch conversion is a fitment error, not cosmetic.
import { describe, it, expect } from "vitest"
import { pcdInchLabel } from "./pcd-inch-label"

describe("pcdInchLabel (WB-088 D4)", () => {
  it("renders dual-unit for standard PCDs", () => {
    expect(pcdInchLabel("5x114.3")).toBe('5×114.3 (5×4.5″)')
    expect(pcdInchLabel("6x139.7")).toBe('6×139.7 (6×5.5″)')
  })

  it("passes a non-canonical value through unchanged", () => {
    expect(pcdInchLabel("BLANK")).toBe("BLANK")
  })
})
