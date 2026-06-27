import { describe, it, expect } from "vitest"
import { buildFinishOptions } from "./finish-options"

const variant = (finish: string, image: string | null, d: number) =>
  ({ id: `v-${finish}-${d}`, metadata: { finish, image_url: image, wheel_diameter_in: d, wheel_width_in: 9, offset_mm: 35, bolt_pattern_raw: "5x114.3" }, calculated_price: { calculated_amount: 100 }, inventory_quantity: 5 } as any)

describe("buildFinishOptions", () => {
  it("partitions variants by raw finish, each with its own sizeOptions + image", () => {
    const out = buildFinishOptions(
      [variant("Matte Black", "b.jpg", 20), variant("Gloss Silver", "s.jpg", 22)], 30
    )
    expect(out.map((f) => f.raw).sort()).toEqual(["Gloss Silver", "Matte Black"])
    const black = out.find((f) => f.raw === "Matte Black")!
    expect(black.imageUrl).toBe("b.jpg")
    expect(black.normalized).toBe("black")
    expect(black.sizeOptions.length).toBe(1)
    expect(black.sizeOptions[0].diameter).toBe(20)
  })
  it("collapses multiple variants of one finish into that finish's size matrix", () => {
    const out = buildFinishOptions(
      [variant("Matte Black", "b.jpg", 20), variant("Matte Black", "b.jpg", 22)], 30
    )
    expect(out.length).toBe(1)
    expect(out[0].sizeOptions.length).toBe(2)
  })
  it("blank finish → a single '—' finish option", () => {
    const out = buildFinishOptions([variant("", null, 20)], 30)
    expect(out.length).toBe(1)
    expect(out[0].raw).toBe("—")
  })
})
