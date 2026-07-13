import { expandTireModelName } from "../adapters/wheelpros-tires/model-alias"

describe("expandTireModelName (WB-089 L8 alias, display-only)", () => {
  it("expands a known abbreviation", () => {
    expect(expandTireModelName("WDPEAK AT4W")).toBe("Wildpeak A/T4W")
  })
  it("is case-insensitive on the key", () => {
    expect(expandTireModelName("wdpeak at4w")).toBe("Wildpeak A/T4W")
  })
  it("passes an unknown model through unchanged", () => {
    expect(expandTireModelName("FK453")).toBe("FK453")
  })
  it("passes null/empty through", () => {
    expect(expandTireModelName(null)).toBeNull()
  })
})
