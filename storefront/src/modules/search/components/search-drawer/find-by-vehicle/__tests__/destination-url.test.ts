import { describe, it, expect } from "vitest"
import { fitmentDestinationUrl } from "../destination-url"

describe("fitmentDestinationUrl", () => {
  it("routes wheels to /store with the bolt-pattern fit param", () => {
    expect(
      fitmentDestinationUrl({ countryCode: "us", target: "wheels", boltPatterns: ["5x114.3"], oemTireSizes: ["225/55R18"] })
    ).toBe("/us/store?fit=5x114.3")
  })
  it("routes tires to /tires with the OEM-size fit param (CSV, order preserved)", () => {
    expect(
      fitmentDestinationUrl({ countryCode: "us", target: "tires", boltPatterns: ["5x114.3"], oemTireSizes: ["225/55R18", "255/50R18"] })
    ).toBe("/us/tires?fit=225/55R18,255/50R18")
  })
  it("falls back to the bare path when the chosen target's fit array is empty", () => {
    expect(
      fitmentDestinationUrl({ countryCode: "ca", target: "tires", boltPatterns: ["5x114.3"], oemTireSizes: [] })
    ).toBe("/ca/tires")
    expect(
      fitmentDestinationUrl({ countryCode: "ca", target: "wheels", boltPatterns: [], oemTireSizes: ["225/55R18"] })
    ).toBe("/ca/store")
  })
})
