// WB-119 Q-20 — the fitment-check CTA must reach a form that knows which
// vehicle and product the shopper was looking at.
import { describe, expect, it } from "vitest"

import { fitmentCheckHref, vehicleLabel } from "./fitment-check-link"

const corolla = {
  year: 2019,
  make: "Toyota",
  model: "Corolla",
  modificationSlug: "LE",
}

describe("vehicleLabel", () => {
  it("joins year, make, model and sub-model", () => {
    expect(vehicleLabel(corolla)).toBe("2019 Toyota Corolla LE")
  })

  it("omits an absent sub-model rather than padding the string", () => {
    expect(vehicleLabel({ year: 2019, make: "Toyota", model: "Corolla" })).toBe(
      "2019 Toyota Corolla"
    )
  })

  it("ignores a blank sub-model", () => {
    expect(vehicleLabel({ ...corolla, modificationSlug: "   " })).toBe(
      "2019 Toyota Corolla"
    )
  })

  it("returns null with no vehicle", () => {
    expect(vehicleLabel(null)).toBeNull()
    expect(vehicleLabel(undefined)).toBeNull()
  })
})

describe("fitmentCheckHref", () => {
  it("always carries the subject and source", () => {
    const href = fitmentCheckHref()
    expect(href).toContain("subject=Fitment+check")
    expect(href).toContain("source=fitment-check")
  })

  it("includes the vehicle and product when known", () => {
    const href = fitmentCheckHref({ vehicle: corolla, productHandle: "nitto-nt421q" })
    expect(href).toContain("vehicle=2019+Toyota+Corolla+LE")
    expect(href).toContain("product=nitto-nt421q")
  })

  it("omits vehicle and product when unknown, without empty params", () => {
    const href = fitmentCheckHref({ vehicle: null, productHandle: null })
    expect(href).not.toContain("vehicle=")
    expect(href).not.toContain("product=")
  })

  it("encodes values that would otherwise break the query string", () => {
    const href = fitmentCheckHref({
      vehicle: { year: 2020, make: "Mercedes-Benz", model: "C 300 4MATIC" },
      productHandle: "a&b=c",
    })
    // Decoding must round-trip to the original values.
    const params = new URLSearchParams(href.split("?")[1])
    expect(params.get("vehicle")).toBe("2020 Mercedes-Benz C 300 4MATIC")
    expect(params.get("product")).toBe("a&b=c")
  })

  it("points at /contact", () => {
    expect(fitmentCheckHref().startsWith("/contact?")).toBe(true)
  })
})
