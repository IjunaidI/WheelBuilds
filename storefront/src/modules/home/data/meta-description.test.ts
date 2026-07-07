import { describe, it, expect } from "vitest"
import { homeMetaDescription } from "./meta-description"

describe("homeMetaDescription", () => {
  it("includes the brand count when truthy", () => {
    const desc = homeMetaDescription(12)
    expect(desc).toContain("Authorized dealer for 12 premium aftermarket wheel brands.")
    expect(desc).toContain("Tell us what you drive")
  })

  it("omits the numeral when brandCount is 0", () => {
    const desc = homeMetaDescription(0)
    expect(desc).not.toContain("for 0")
    expect(desc).toContain("Authorized dealer for premium aftermarket wheel brands.")
    expect(desc).toContain("Tell us what you drive")
  })

  it("omits the numeral when brandCount is undefined", () => {
    const desc = homeMetaDescription()
    expect(desc).not.toContain("for undefined")
    expect(desc).toContain("Authorized dealer for premium aftermarket wheel brands.")
    expect(desc).toContain("Tell us what you drive")
  })

  it("produces the full sentence ending correctly", () => {
    const descWithCount = homeMetaDescription(5)
    expect(descWithCount.endsWith("wheels confirmed to fit.")).toBe(true)
    const descWithoutCount = homeMetaDescription()
    expect(descWithoutCount.endsWith("wheels confirmed to fit.")).toBe(true)
  })
})
