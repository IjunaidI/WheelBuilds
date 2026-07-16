import { describe, it, expect } from "vitest"
import { buildBrandTiles } from "./brand-tiles"

describe("buildBrandTiles", () => {
  it("joins the count map with matching collection handles", () => {
    const tiles = buildBrandTiles(
      { FUEL: 42, ROTIFORM: 10 },
      [
        { title: "FUEL", handle: "fuel" },
        { title: "ROTIFORM", handle: "rotiform" },
      ]
    )
    expect(tiles).toEqual([
      { name: "FUEL", count: 42, href: "/brands/fuel" },
      { name: "ROTIFORM", count: 10, href: "/brands/rotiform" },
    ])
  })

  it("drops a brand with a count but no matching collection handle", () => {
    const tiles = buildBrandTiles(
      { FUEL: 42, "NO-COLLECTION-BRAND": 5 },
      [{ title: "FUEL", handle: "fuel" }]
    )
    expect(tiles).toEqual([{ name: "FUEL", count: 42, href: "/brands/fuel" }])
  })

  it("drops a collection that has no facet count at all (absent from the map)", () => {
    const tiles = buildBrandTiles(
      { FUEL: 42 },
      [
        { title: "FUEL", handle: "fuel" },
        { title: "NO-COUNT-BRAND", handle: "no-count-brand" },
      ]
    )
    expect(tiles).toEqual([{ name: "FUEL", count: 42, href: "/brands/fuel" }])
  })

  it("drops a collection whose facet count is exactly zero", () => {
    const tiles = buildBrandTiles(
      { FUEL: 42, ZERO: 0 },
      [
        { title: "FUEL", handle: "fuel" },
        { title: "ZERO", handle: "zero" },
      ]
    )
    expect(tiles).toEqual([{ name: "FUEL", count: 42, href: "/brands/fuel" }])
  })

  it("sorts by count descending, ties broken alphabetically by name", () => {
    const tiles = buildBrandTiles(
      { ZETA: 10, ALPHA: 10, BETA: 20 },
      [
        { title: "ZETA", handle: "zeta" },
        { title: "ALPHA", handle: "alpha" },
        { title: "BETA", handle: "beta" },
      ]
    )
    expect(tiles.map((t) => t.name)).toEqual(["BETA", "ALPHA", "ZETA"])
  })

  it("joins exactly on title (byte-identical) and uses the handle verbatim in href, even for a brand name containing a space", () => {
    const tiles = buildBrandTiles(
      { "BLACKLINE FORGED": 7 },
      [{ title: "BLACKLINE FORGED", handle: "blackline-forged" }]
    )
    expect(tiles).toEqual([
      { name: "BLACKLINE FORGED", count: 7, href: "/brands/blackline-forged" },
    ])
  })

  it("does not join case-insensitively or via trimming — a near-miss title does not match and both sides are dropped", () => {
    const tiles = buildBrandTiles(
      { "Blackline Forged": 7 },
      [{ title: "BLACKLINE FORGED", handle: "blackline-forged" }]
    )
    expect(tiles).toEqual([])
  })

  it("returns an empty array for empty inputs", () => {
    expect(buildBrandTiles({}, [])).toEqual([])
  })
})
