import { it, expect, describe } from "vitest"
import { productFitsVehicle } from "../product-fits"

describe("productFitsVehicle", () => {
  it("is true when any canonical pattern intersects", () => {
    expect(productFitsVehicle(["5x114.3", "5x120"], ["5x114.3"])).toBe(true)
  })
  it("is false when there is no intersection", () => {
    expect(productFitsVehicle(["6x139.7"], ["5x114.3"])).toBe(false)
  })
  it("is false when either side is empty/undefined", () => {
    expect(productFitsVehicle([], ["5x114.3"])).toBe(false)
    expect(productFitsVehicle(["5x114.3"], [])).toBe(false)
    expect(productFitsVehicle(undefined, undefined)).toBe(false)
  })
})
