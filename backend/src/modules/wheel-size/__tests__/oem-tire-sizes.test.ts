import { extractOemTireSizes } from "../oem-tire-sizes"

const raw = {
  data: [
    {
      wheels: [
        { is_stock: true,  front: { tire: "225/55R18" }, rear: { tire: "225/55R18" } },
        { is_stock: true,  front: { tire: "255/35ZR19" }, rear: { tire: "" } },
        { is_stock: false, front: { tire: "245/50R18" }, rear: { tire: "245/50R18" } }, // aftermarket → excluded
      ],
    },
  ],
}

describe("extractOemTireSizes", () => {
  it("returns canonical OEM front+rear sizes, deduped; excludes aftermarket", () => {
    expect(extractOemTireSizes(raw).sort()).toEqual(["225/55R18", "255/35R19"])
  })
  it("returns [] for missing/empty data", () => {
    expect(extractOemTireSizes(null)).toEqual([])
    expect(extractOemTireSizes({ data: [] })).toEqual([])
    expect(extractOemTireSizes({ data: [{ wheels: [] }] })).toEqual([])
  })
})
