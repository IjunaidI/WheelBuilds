import { describe, it, expect } from "vitest"
import { catalogWallTiles } from "./tiles"

describe("catalogWallTiles (WB-085 N6)", () => {
  it("excludes the first newDropsCount products (no repeat with New Arrivals)", () => {
    const newest = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}` }) as any)
    const tiles = catalogWallTiles(newest, 6, 8)
    expect(tiles[0].id).toBe("p6")
    expect(tiles).toHaveLength(8)
  })

  it("degrades gracefully when catalog is short", () => {
    expect(
      catalogWallTiles(Array.from({ length: 9 }, (_, i) => ({ id: `p${i}` }) as any), 6, 8)
    ).toHaveLength(3)
  })
})
