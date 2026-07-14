// storefront/src/lib/fitment/__tests__/slugify.test.ts
import { describe, it, expect } from "vitest"
import { slugify } from "../slugify"

describe("slugify", () => {
  it("lowercases", () => {
    expect(slugify("Land Rover")).toBe("land-rover")
  })

  it("collapses runs of non-alphanumeric characters to a single dash", () => {
    expect(slugify("Mercedes-Benz")).toBe("mercedes-benz")
    expect(slugify("Alfa   Romeo")).toBe("alfa-romeo")
    expect(slugify("Ram 1500 (Classic)")).toBe("ram-1500-classic")
  })

  it("trims leading and trailing dashes", () => {
    expect(slugify("  Land Rover  ")).toBe("land-rover")
    expect(slugify("-Toyota-")).toBe("toyota")
  })

  it("is idempotent on an already-slugified value", () => {
    expect(slugify("land-rover")).toBe("land-rover")
  })

  it("makes a slug and a display name compare equal", () => {
    expect(slugify("land-rover")).toBe(slugify("Land Rover"))
  })
})
