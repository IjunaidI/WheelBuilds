import { describe, it, expect } from "vitest"
import { footerBrandLinks } from "./footer-links"

describe("footerBrandLinks (WB-085 N1/N8)", () => {
  it("returns top-N brands by count, as /store?brands= links, no fixtures", () => {
    const links = footerBrandLinks({ FUEL: 40, XD: 30, KMC: 10, PETROL: 5 }, 3)
    expect(links.map((l) => l.label)).toEqual(["FUEL", "XD", "KMC"])
    expect(links[0].href).toBe("/store?brands=FUEL")
  })

  it("defaults to top 5 when n is omitted", () => {
    const links = footerBrandLinks({
      FUEL: 40,
      XD: 30,
      KMC: 10,
      PETROL: 5,
      MOTO: 3,
      ANZA: 1,
    })
    expect(links).toHaveLength(5)
    expect(links.map((l) => l.label)).toEqual(["FUEL", "XD", "KMC", "PETROL", "MOTO"])
  })

  it("URL-encodes brand labels with special characters", () => {
    const links = footerBrandLinks({ "Black Rhino Hard Alloys": 5 }, 1)
    expect(links[0].href).toBe("/store?brands=Black%20Rhino%20Hard%20Alloys")
  })

  it("returns an empty array for an empty facet", () => {
    expect(footerBrandLinks({}, 5)).toEqual([])
  })
})
