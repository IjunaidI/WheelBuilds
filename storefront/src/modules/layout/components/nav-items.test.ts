import { describe, it, expect } from "vitest"
import { NAV_ITEMS } from "./nav-items"
describe("NAV_ITEMS (WB-085)", () => {
  it("has no dead links (# or legacy /collections|/categories)", () => {
    for (const it of NAV_ITEMS) {
      expect(it.href).not.toBe("#")
      expect(it.href).not.toMatch(/^\/(collections|categories)\b/)
    }
  })
  it("drops Build Gallery + Deals; Support → /contact", () => {
    const labels = NAV_ITEMS.map((i) => i.label)
    expect(labels).not.toContain("Build Gallery")
    expect(labels).not.toContain("Deals")
    expect(NAV_ITEMS.find((i) => i.label === "Support")?.href).toBe("/contact")
  })
})
