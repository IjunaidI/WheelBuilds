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
  it("passes when the row has no trim (WB-104 T1 union row)", () => {
    expect(trimMatches({ trim: undefined }, { trim: "EX" })).toBe(true)
    expect(trimMatches({ trim: undefined }, { trim: undefined })).toBe(true)
  })

  it("passes when there is no active vehicle to compare against", () => {
    expect(trimMatches({ trim: "Sport" }, null)).toBe(true)
    expect(trimMatches({ trim: "Sport" }, undefined)).toBe(true)
  })

  it("a non-narrowed row with a shared trim label falls back to a plain label compare", () => {
    expect(trimMatches({ trim: "Sport", trimNarrowed: false }, { trim: "sport" })).toBe(true)
    expect(trimMatches({ trim: "Sport", trimNarrowed: false }, { trim: "EX" })).toBe(false)
    // Active has no trim on file at all — nothing to disprove the match with.
    expect(trimMatches({ trim: "Sport", trimNarrowed: false }, { trim: undefined })).toBe(true)
  })

  it("a trim-narrowed row matches the active vehicle's trim LABEL, slug-normalized", () => {
    expect(
      trimMatches({ trim: "SE Plus", trimNarrowed: true }, { trim: "se-plus" })
    ).toBe(true)
    expect(
      trimMatches({ trim: "Sport", trimNarrowed: true }, { trim: "EX" })
    ).toBe(false)
  })

  it("a trim-narrowed row ALSO matches the active vehicle's modificationSlug, slug-normalized", () => {
    // The active vehicle's human trim label doesn't agree, but the raw
    // modification slug chosen in the YMM dropdown does.
    expect(
      trimMatches(
        { trim: "3.0i", trimNarrowed: true },
        { trim: "Base", modificationSlug: "3-0i" }
      )
    ).toBe(true)
  })

  it("a trim-narrowed row fails when neither the active trim nor modificationSlug agree", () => {
    expect(
      trimMatches(
        { trim: "Sport", trimNarrowed: true },
        { trim: "EX", modificationSlug: "touring" }
      )
    ).toBe(false)
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

  it("does not match when trims are both present (non-narrowed) and differ", () => {
    const entry = { year: "2021", make: "Honda", model: "Civic", trim: "Sport" }
    const active = { year: 2021, make: "Honda", model: "Civic", trim: "EX" }
    expect(entryMatchesVehicle(entry, active)).toBe(false)
  })

  it("matches on trim when both present and equal (slug-normalized)", () => {
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

  // --- WB-104 T2 regressions ---

  it("matches a slug make/model (drawer option value) against a display-name reverse-fitment identity", () => {
    const entry = { year: "2021", make: "Land Rover", model: "Range Rover Sport" }
    const active = { year: 2021, make: "land-rover", model: "range-rover-sport" }
    expect(entryMatchesVehicle(entry, active)).toBe(true)
  })

  it("also matches the reverse direction (entry is a slug, active is a display name)", () => {
    const entry = { year: "2021", make: "land-rover", model: "range-rover-sport" }
    const active = { year: 2021, make: "Land Rover", model: "Range Rover Sport" }
    expect(entryMatchesVehicle(entry, active)).toBe(true)
  })

  it("a union row (no trim) anchors on year/make/model alone, ignoring the active vehicle's trim", () => {
    const entry = { year: "2018–2022", make: "Honda", model: "Accord", trim: undefined }
    const active = { year: 2019, make: "Honda", model: "Accord", trim: "Sport" }
    expect(entryMatchesVehicle(entry, active)).toBe(true)
  })

  it("a trim-narrowed row matches the active vehicle's modificationSlug even when the trim label differs", () => {
    const entry = {
      year: "2014–2020",
      make: "Mitsubishi",
      model: "Outlander",
      trim: "3.0i",
      trimNarrowed: true,
    }
    const active = {
      year: 2016,
      make: "Mitsubishi",
      model: "Outlander",
      trim: "Base",
      modificationSlug: "3-0i",
    }
    expect(entryMatchesVehicle(entry, active)).toBe(true)
  })

  it("a trim-narrowed row does not match when neither trim label nor modificationSlug agree", () => {
    const entry = {
      year: "2018–2022",
      make: "Honda",
      model: "Accord",
      trim: "Sport",
      trimNarrowed: true,
    }
    const active = {
      year: 2019,
      make: "Honda",
      model: "Accord",
      trim: "EX",
      modificationSlug: "touring",
    }
    expect(entryMatchesVehicle(entry, active)).toBe(false)
  })
})
