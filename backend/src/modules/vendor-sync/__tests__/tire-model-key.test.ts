import { readFileSync } from "node:fs"
import { join } from "node:path"
import { extractTireModel } from "../adapters/wheelpros-tires/model-key"

const golden = JSON.parse(
  readFileSync(join(__dirname, "../../../../../fixtures/tire-model-golden.json"), "utf8")
) as { brand: string; description: string; sizeToken: string | null; model: string | null; confident: boolean }[]

describe("extractTireModel matches the golden vectors", () => {
  for (const v of golden) {
    it(`${JSON.stringify(v.description)} -> ${JSON.stringify(v.model)}`, () => {
      const result = extractTireModel(v.brand, v.description, v.sizeToken)
      expect(result.model).toEqual(v.model)
      expect(result.confident).toEqual(v.confident)
    })
  }
})

describe("extractTireModel edge behaviour", () => {
  it("is not confident when only the size + service remain", () => {
    expect(extractTireModel("Falken", "305/45R22 118S", "305/45R22")).toEqual({
      model: null,
      confident: false,
    })
  })

  it("strips the brand when it appears inside the description", () => {
    expect(extractTireModel("BKT", "12.4-24 8PR BKT TR171 TT 451224", "12.4-24").model).toBe("TR171")
  })
})

describe("extractTireModel — canonicalized sizes must never leak into the model", () => {
  // Regression: parseTireSize canonicalizes inch tokens (dash -> R, dropped
  // LT/P/ST, lowercase x -> X), so step 1's literal split(sizeToken) stops
  // matching the description. The raw size then survived into the model and
  // CHANGED THE GROUP KEY, which made apply try to create a product whose
  // variant SKUs already existed ("BKT|AT 33X8-18 AT171", 2026-07-27 apply).
  const cases: Array<[string, string, string, string]> = [
    ["BKT", "AT 33X8-18 AT171", "33X8R18", "AT AT171"],
    ["BKT", "AT 31X9-16 AT171", "31X9R16", "AT AT171"],
    ["Mickey Thompson Tire", "BAJ BOSS MT LT35X12.50-20 125Q 34.7", "35X12.50R20", "BAJ BOSS MT"],
    ["Nitto", "TRAILTEK RT 33x12.50R20LT 119Q F 32.8", "33X12.50R20", "TRAILTEK RT"],
    ["Nitto", "TRAIL GRAP 37×12.50R18LT 128Q E 36.7", "37X12.50R18", "TRAIL GRAP"],
    ["Mickey Thompson Tire", "BAJA BELTED II 18.5/39R17LT 125/P C 38.7", "18.5/39R17", "BAJA BELTED II"],
    ["Mickey Thompson Tire", "BAJA PRO XS 17/49-20LT 47.5", "17/49R20", "BAJA PRO XS"],
    ["Toyo", "OPAT2 LT325/60T18 124/121S E10 33.3", "LT325/60T18", "OPAT2 E10"],
  ]

  it.each(cases)(
    "%s / %s -> no digits-with-x or digits-with-slash survive",
    (brand, description, sizeToken, expected) => {
      const { model } = extractTireModel(brand, description, sizeToken)
      expect(model).toBe(expected)
      // The real invariant: whatever the model is, it must not still contain a
      // size-shaped token, because that is what forks the group key.
      expect(model ?? "").not.toMatch(/\d+(?:\.\d+)?[xX×]\d/)
      expect(model ?? "").not.toMatch(/\d+(?:\.\d+)?\/\d+(?:\.\d+)?[RBD-]\d/)
    }
  )

  it("still groups two sizes of the same model onto ONE key", () => {
    const a = extractTireModel("BKT", "AT 33X8-18 AT171", "33X8R18").model
    const b = extractTireModel("BKT", "AT 31X9-16 AT171", "31X9R16").model
    expect(a).toBe(b)
  })
})
