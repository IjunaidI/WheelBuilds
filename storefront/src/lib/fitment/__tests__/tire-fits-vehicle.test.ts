import { describe, it, expect } from "vitest"
import { tireFitsVehicle, tireFitVerdict } from "../tire-fits-vehicle"
import type { OemTire } from "@lib/garage/types"

describe("tireFitsVehicle", () => {
  it("fits when size matches and load/speed meet-or-exceed the OEM spec", () => {
    const spec: OemTire = { size: "255/35R19", loadIndex: 96, speedRating: "V" }
    const oem: OemTire = { size: "255/35R19", loadIndex: 96, speedRating: "V" }
    expect(tireFitsVehicle([spec], [oem])).toBe(true)
  })

  it("does not fit when size matches but load index is below the OEM spec", () => {
    const spec: OemTire = { size: "255/35R19", loadIndex: 91, speedRating: "V" }
    const oem: OemTire = { size: "255/35R19", loadIndex: 96, speedRating: "V" }
    expect(tireFitsVehicle([spec], [oem])).toBe(false)
  })

  it("does not fit when size matches but speed rating rank is below the OEM spec", () => {
    const spec: OemTire = { size: "255/35R19", loadIndex: 96, speedRating: "S" }
    const oem: OemTire = { size: "255/35R19", loadIndex: 96, speedRating: "V" }
    expect(tireFitsVehicle([spec], [oem])).toBe(false)
  })

  it("passes the load dimension when either side is missing load data", () => {
    const specMissing: OemTire = { size: "255/35R19", loadIndex: null, speedRating: "V" }
    const oemMissing: OemTire = { size: "255/35R19", loadIndex: null, speedRating: "V" }
    const oemHasLoad: OemTire = { size: "255/35R19", loadIndex: 99, speedRating: "V" }
    const specHasLoad: OemTire = { size: "255/35R19", loadIndex: 80, speedRating: "V" }
    expect(tireFitsVehicle([specMissing], [oemHasLoad])).toBe(true)
    expect(tireFitsVehicle([specHasLoad], [oemMissing])).toBe(true)
  })

  it("passes the speed dimension when either side is missing speed-rating data", () => {
    const specMissing: OemTire = { size: "255/35R19", loadIndex: 96, speedRating: null }
    const oemMissing: OemTire = { size: "255/35R19", loadIndex: 96, speedRating: null }
    const oemHasSpeed: OemTire = { size: "255/35R19", loadIndex: 96, speedRating: "V" }
    const specHasSpeed: OemTire = { size: "255/35R19", loadIndex: 96, speedRating: "S" }
    expect(tireFitsVehicle([specMissing], [oemHasSpeed])).toBe(true)
    expect(tireFitsVehicle([specHasSpeed], [oemMissing])).toBe(true)
  })

  it("does not fit when size does not match, regardless of load/speed", () => {
    const spec: OemTire = { size: "305/45R22", loadIndex: 118, speedRating: "V" }
    const oem: OemTire = { size: "225/55R18", loadIndex: 96, speedRating: "V" }
    expect(tireFitsVehicle([spec], [oem])).toBe(false)
  })

  it("returns true when some product spec fits some vehicle OEM tire", () => {
    const specs: OemTire[] = [
      { size: "305/45R22", loadIndex: 118, speedRating: "V" },
      { size: "255/35R19", loadIndex: 96, speedRating: "V" },
    ]
    const oems: OemTire[] = [{ size: "255/35R19", loadIndex: 96, speedRating: "V" }]
    expect(tireFitsVehicle(specs, oems)).toBe(true)
  })

  it("false for empty product specs or empty vehicle OEM tires", () => {
    const spec: OemTire = { size: "225/55R18", loadIndex: 96, speedRating: "V" }
    expect(tireFitsVehicle([], [spec])).toBe(false)
    expect(tireFitsVehicle([spec], [])).toBe(false)
  })
})

describe("tireFitVerdict", () => {
  it("is 'unknown' when the vehicle has no OEM tire data on file, even with product specs present", () => {
    const spec: OemTire = { size: "255/35R19", loadIndex: 96, speedRating: "V" }
    expect(tireFitVerdict([spec], [])).toBe("unknown")
  })

  it("is 'fits' when a product spec matches some OEM tire", () => {
    const spec: OemTire = { size: "255/35R19", loadIndex: 96, speedRating: "V" }
    const oem: OemTire = { size: "255/35R19", loadIndex: 96, speedRating: "V" }
    expect(tireFitVerdict([spec], [oem])).toBe("fits")
  })

  it("is 'no' when the vehicle has OEM tire data but no product spec matches (a real mismatch)", () => {
    const spec: OemTire = { size: "305/45R22", loadIndex: 118, speedRating: "V" }
    const oem: OemTire = { size: "225/55R18", loadIndex: 96, speedRating: "V" }
    expect(tireFitVerdict([spec], [oem])).toBe("no")
  })

  it("is 'no', not 'unknown', when the vehicle has OEM data but the product has no specs at all", () => {
    const oem: OemTire = { size: "225/55R18", loadIndex: 96, speedRating: "V" }
    expect(tireFitVerdict([], [oem])).toBe("no")
  })
})
