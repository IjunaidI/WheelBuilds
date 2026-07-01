import { describe, it, expect } from "vitest"
import { resolveSelectedVariant } from "./resolve-variant"
import { SizeOption } from "./types"

const size: SizeOption = {
  diameter: 20,
  width: 9,
  offsetMm: 18,
  defaultOffsetMm: 18,
  weightLb: 28,
  availability: "in_stock",
  offsetVariants: [
    { value: 18, backspaceIn: "", variantId: "var_oem", availability: "in_stock" },
    { value: 35, backspaceIn: "", variantId: "var_plus", availability: "low_stock" },
  ],
}

describe("resolveSelectedVariant", () => {
  it("returns the offset variant matching the selected ET", () => {
    expect(resolveSelectedVariant(size, 18)?.variantId).toBe("var_oem")
  })
  it("picks the correct sibling among multiple offsets", () => {
    expect(resolveSelectedVariant(size, 35)?.variantId).toBe("var_plus")
  })
  it("returns null when no offset matches", () => {
    expect(resolveSelectedVariant(size, 99)).toBeNull()
  })
  it("returns null when the size has no offsetVariants", () => {
    expect(resolveSelectedVariant({ ...size, offsetVariants: undefined }, 18)).toBeNull()
  })
})
