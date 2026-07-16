import { describe, it, expect } from "vitest"
import { STYLE_DEFS } from "./style-map"
import { styleSlug, styleFromSlug } from "./style-slug"

describe("styleSlug", () => {
  it("lowercases a plain single-word label", () => {
    expect(styleSlug("STREET")).toBe("street")
    expect(styleSlug("LUXURY")).toBe("luxury")
    expect(styleSlug("UTV")).toBe("utv")
    expect(styleSlug("DRAG")).toBe("drag")
  })

  it("collapses ' & ' into a single hyphen", () => {
    expect(styleSlug("TRUCK & DUALLY")).toBe("truck-dually")
  })

  it("leaves an existing single hyphen as-is", () => {
    expect(styleSlug("OFF-ROAD")).toBe("off-road")
  })
})

describe("styleFromSlug", () => {
  it("resolves every real STYLE_DEFS label through its own slug (round trip)", () => {
    for (const def of STYLE_DEFS) {
      const slug = styleSlug(def.label)
      const resolved = styleFromSlug(slug)
      expect(resolved).not.toBeNull()
      expect(resolved).toBe(def)
      // Round trip: slugging the resolved label reproduces the same slug.
      expect(styleSlug(resolved!.label)).toBe(slug)
    }
  })

  it("pins the two labels with special characters to their exact slugs", () => {
    expect(styleFromSlug("truck-dually")?.label).toBe("TRUCK & DUALLY")
    expect(styleFromSlug("off-road")?.label).toBe("OFF-ROAD")
  })

  it("returns null for an unknown slug", () => {
    expect(styleFromSlug("bogus-style")).toBeNull()
    expect(styleFromSlug("")).toBeNull()
  })

  it("never produces a slug collision across STYLE_DEFS", () => {
    const slugs = STYLE_DEFS.map((d) => styleSlug(d.label))
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
