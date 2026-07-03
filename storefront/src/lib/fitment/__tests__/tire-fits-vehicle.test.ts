import { describe, it, expect } from "vitest"
import { tireFitsVehicle } from "../tire-fits-vehicle"

describe("tireFitsVehicle", () => {
  it("fits when a product size matches a vehicle OEM size (canonical)", () => {
    expect(tireFitsVehicle(["305/45R22", "255/35ZR19"], ["255/35R19"])).toBe(true)
  })
  it("does not fit when no size intersects", () => {
    expect(tireFitsVehicle(["305/45R22"], ["225/55R18"])).toBe(false)
  })
  it("false for empty product or empty vehicle sizes", () => {
    expect(tireFitsVehicle([], ["225/55R18"])).toBe(false)
    expect(tireFitsVehicle(["225/55R18"], [])).toBe(false)
  })
  it("canonicalizes both sides before matching", () => {
    expect(tireFitsVehicle(["255/35zr19"], ["255/35R19 96Y"])).toBe(true)
  })
})
