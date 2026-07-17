import { describe, it, expect } from "vitest"
import { footerBrandLinks } from "./footer-links"
import { buildBrandHandleMap } from "@modules/brands/data/brand-tiles"

describe("footerBrandLinks (WB-085 N1/N8, repointed WB-099 Task 5)", () => {
  const handleMap = buildBrandHandleMap([
    { title: "FUEL", handle: "fuel" },
    { title: "XD", handle: "xd" },
    { title: "KMC", handle: "kmc" },
    { title: "PETROL", handle: "petrol" },
    { title: "MOTO", handle: "moto" },
  ])

  it("returns top-N brands by count, as /brands/<handle> links", () => {
    const links = footerBrandLinks(
      { FUEL: 40, XD: 30, KMC: 10, PETROL: 5 },
      handleMap,
      3
    )
    expect(links.map((l) => l.label)).toEqual(["FUEL", "XD", "KMC"])
    expect(links[0].href).toBe("/brands/fuel")
  })

  it("defaults to top 5 when n is omitted", () => {
    const links = footerBrandLinks(
      {
        FUEL: 40,
        XD: 30,
        KMC: 10,
        PETROL: 5,
        MOTO: 3,
        ANZA: 1,
      },
      handleMap
    )
    expect(links).toHaveLength(5)
    expect(links.map((l) => l.label)).toEqual(["FUEL", "XD", "KMC", "PETROL", "MOTO"])
  })

  it("falls back to /store?brands=<title> when a brand has no matching collection handle", () => {
    const links = footerBrandLinks(
      { "Black Rhino Hard Alloys": 5 },
      buildBrandHandleMap([]),
      1
    )
    expect(links[0].href).toBe("/store?brands=Black%20Rhino%20Hard%20Alloys")
  })

  it("returns an empty array for an empty facet", () => {
    expect(footerBrandLinks({}, handleMap, 5)).toEqual([])
  })
})
