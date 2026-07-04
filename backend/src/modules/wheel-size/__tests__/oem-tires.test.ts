import { extractOemTires } from "../oem-tires"

const raw = (rims: any[]) => ({ data: [{ wheels: rims }] })

describe("extractOemTires", () => {
  it("reads size+load+speed from is_stock front/rear, canonical size, deduped", () => {
    const out = extractOemTires(raw([
      { is_stock: true, front: { tire: "235/35ZR19", load_index: 91, speed_index: "Y" }, rear: { tire: "235/35ZR19", load_index: 91, speed_index: "Y" } },
      { is_stock: true, front: { tire: "225/55R18", load_index: 97, speed_index: "H" } },
      { is_stock: false, front: { tire: "255/40R20", load_index: 101, speed_index: "W" } }, // aftermarket → excluded
    ]))
    expect(out).toEqual([
      { size: "235/35R19", loadIndex: 91, speedRating: "Y" },
      { size: "225/55R18", loadIndex: 97, speedRating: "H" },
    ])
  })
  it("missing load/speed → null (never dropped)", () => {
    expect(extractOemTires(raw([{ is_stock: true, front: { tire: "205/55R16" } }])))
      .toEqual([{ size: "205/55R16", loadIndex: null, speedRating: null }])
  })
  it("no data → []", () => {
    expect(extractOemTires(undefined)).toEqual([])
    expect(extractOemTires({ data: [] })).toEqual([])
  })
})
