import { computeTireGroupKey } from "../adapters/wheelpros-tires/group-key"

describe("computeTireGroupKey", () => {
  it("groups by brand + model when confident", () => {
    expect(
      computeTireGroupKey({ brand: "Falken", model: "WDPEAK AT4W", confident: true, partNumber: "F28840215" })
    ).toBe("Falken|WDPEAK AT4W")
  })

  it("falls back to per-SKU when not confident", () => {
    expect(
      computeTireGroupKey({ brand: "Falken", model: null, confident: false, partNumber: "F28840215" })
    ).toBe("sku:F28840215")
  })

  it("trims surrounding whitespace on brand and model", () => {
    expect(
      computeTireGroupKey({ brand: " Falken ", model: " FK453 ", confident: true, partNumber: "F1" })
    ).toBe("Falken|FK453")
  })
})
