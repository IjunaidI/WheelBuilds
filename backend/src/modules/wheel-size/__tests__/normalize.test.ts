// backend/src/modules/wheel-size/__tests__/normalize.test.ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { normalizeByModel } from "../normalize"

const fx = (tag: string) =>
  JSON.parse(readFileSync(join(__dirname, "__fixtures__", `by-model-${tag}.json`), "utf8")).body

describe("normalizeByModel", () => {
  it("derives canonical bolt patterns via canonicalBoltPatterns (5x114.3 sedan)", () => {
    const f = normalizeByModel(fx("sedan-5x114_3"), { modificationSlug: "accord-2021", region: "usdm" })
    expect(f.status).toBe("ok")
    expect(f.canonicalBoltPatterns).toEqual(["5x114.3"])
    expect(f.hubBoreMm).toBe(67.1) // technical.centre_bore arrives as the STRING "67.1"
    expect(f.source.region).toBe("usdm")
  })

  it("reads a string centre_bore on a truck (8x180, 124.1)", () => {
    const f = normalizeByModel(fx("truck-8x180"), { modificationSlug: "silverado-2500-hd", region: "usdm" })
    expect(f.status).toBe("ok")
    expect(f.canonicalBoltPatterns).toEqual(["8x180"])
    expect(f.hubBoreMm).toBe(124.1)
  })

  it("returns not_found for a real empty-data recording", () => {
    const f = normalizeByModel(fx("nodata"), { modificationSlug: "x", region: "usdm" })
    expect(f.status).toBe("not_found")
    expect(f.canonicalBoltPatterns).toEqual([])
  })

  it("skips null rear rim values when building windows", () => {
    const raw = { data: [{ technical: { stud_holes: 5, pcd: 114.3, centre_bore: 64.1 },
      wheels: [{ is_stock: true, front: { rim_diameter: 17, rim_width: 7, rim_offset: 45 }, rear: { rim_diameter: null, rim_width: null, rim_offset: null } },
               { is_stock: false, front: { rim_diameter: 19, rim_width: 8.5, rim_offset: 35 }, rear: null }] }] }
    const f = normalizeByModel(raw as any, { modificationSlug: "x", region: "usdm" })
    expect(f.diameterWindow).toEqual({ min: 19, max: 19 }) // only is_stock:false entries form the aftermarket window
    expect(f.widthWindow).toEqual({ min: 8.5, max: 8.5 })
    expect(f.offsetWindow).toEqual({ min: 35, max: 35 })
  })

  it("returns null windows when only OEM rows exist", () => {
    const raw = { data: [{ technical: { stud_holes: 5, pcd: 120, centre_bore: 72.6 },
      wheels: [{ is_stock: true, front: { rim_diameter: 18, rim_width: 8, rim_offset: 30 }, rear: null }] }] }
    const f = normalizeByModel(raw as any, { modificationSlug: "x", region: "usdm" })
    expect(f.diameterWindow).toBeNull()
  })
})
