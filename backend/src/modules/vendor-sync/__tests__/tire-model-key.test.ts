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
