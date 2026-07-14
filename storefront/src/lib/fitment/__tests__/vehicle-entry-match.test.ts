// storefront/src/lib/fitment/__tests__/vehicle-entry-match.test.ts
import { describe, it, expect } from "vitest"
import { yearMatches, trimMatches, entryMatchesVehicle } from "../vehicle-entry-match"

describe("yearMatches", () => {
  it("matches an exact single year", () => {
    expect(yearMatches("2021", 2021)).toBe(true)
    expect(yearMatches("2021", 2020)).toBe(false)
  })

  it("matches a year range with an en dash", () => {
    expect(yearMatches("2013–2017", 2013)).toBe(true)
    expect(yearMatches("2013–2017", 2015)).toBe(true)
    expect(yearMatches("2013–2017", 2017)).toBe(true)
    expect(yearMatches("2013–2017", 2012)).toBe(false)
    expect(yearMatches("2013–2017", 2018)).toBe(false)
  })

  it("matches a year range with a hyphen", () => {
    expect(yearMatches("2013-2017", 2016)).toBe(true)
    expect(yearMatches("2013-2017", 2019)).toBe(false)
  })
})

describe("trimMatches", () => {
  it("matches case-insensitively when both sides have a trim", () => {
    expect(trimMatches("Sport", "sport")).toBe(true)
    expect(trimMatches("Sport", "EX")).toBe(false)
  })

  it("passes when either side lacks a trim", () => {
    expect(trimMatches(undefined, "EX")).toBe(true)
    expect(trimMatches("Sport", undefined)).toBe(true)
    expect(trimMatches(undefined, undefined)).toBe(true)
  })
})

describe("entryMatchesVehicle", () => {
  it("regression (P13): a 1998 Civic does not match a 2021 Civic row", () => {
    const entry = { year: "2021", make: "Honda", model: "Civic" }
    const active = { year: 1998, make: "Honda", model: "Civic" }
    expect(entryMatchesVehicle(entry, active)).toBe(false)
  })

  it("matches when the active year falls inside the entry's year range", () => {
    const entry = { year: "2013–2017", make: "Honda", model: "Civic" }
    const active = { year: 2015, make: "Honda", model: "Civic" }
    expect(entryMatchesVehicle(entry, active)).toBe(true)
  })

  it("does not match when trims are both present and differ", () => {
    const entry = { year: "2021", make: "Honda", model: "Civic", trim: "Sport" }
    const active = { year: 2021, make: "Honda", model: "Civic", trim: "EX" }
    expect(entryMatchesVehicle(entry, active)).toBe(false)
  })

  it("matches on trim when both present and equal (case-insensitive)", () => {
    const entry = { year: "2021", make: "Honda", model: "Civic", trim: "Sport" }
    const active = { year: 2021, make: "Honda", model: "Civic", trim: "sport" }
    expect(entryMatchesVehicle(entry, active)).toBe(true)
  })

  it("is case-insensitive on make and model", () => {
    const entry = { year: "2021", make: "HONDA", model: "civic" }
    const active = { year: 2021, make: "honda", model: "CIVIC" }
    expect(entryMatchesVehicle(entry, active)).toBe(true)
  })

  it("returns false when there is no active vehicle", () => {
    const entry = { year: "2021", make: "Honda", model: "Civic" }
    expect(entryMatchesVehicle(entry, null)).toBe(false)
    expect(entryMatchesVehicle(entry, undefined)).toBe(false)
  })
})
