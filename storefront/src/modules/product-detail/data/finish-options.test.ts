import { describe, it, expect } from "vitest"
import { buildFinishOptions, finishesUnion } from "./finish-options"

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

// WB-115 final review Finding 2 — a variant flagged metadata.discontinued
// (e.g. a dead vendor image dropped its feed row but the group survived)
// must never appear as a selectable finish/size, even though the variant
// record itself is still on the product.
describe("buildFinishOptions — discontinued exclusion (WB-115 final review Finding 2)", () => {
  it("drops a finish entirely when its only variant is discontinued, keeping a surviving finish selectable", () => {
    const dead = variant("Matte Black", "b.jpg", 20)
    ;(dead.metadata as any).discontinued = true
    const alive = variant("Gloss Silver", "s.jpg", 22)

    const out = buildFinishOptions([dead, alive], 30)

    expect(out.map((f) => f.raw)).toEqual(["Gloss Silver"])
  })

  it("keeps a finish selectable but drops only its discontinued variant from the size matrix", () => {
    const dead = variant("Matte Black", "b.jpg", 20)
    ;(dead.metadata as any).discontinued = true
    const alive = variant("Matte Black", "b.jpg", 22)

    const out = buildFinishOptions([dead, alive], 30)

    expect(out).toHaveLength(1)
    expect(out[0].sizeOptions).toHaveLength(1)
    expect(out[0].sizeOptions[0].diameter).toBe(22)
  })

  it("returns [] (not a crash) when every variant on the product is discontinued", () => {
    const dead = variant("Matte Black", "b.jpg", 20)
    ;(dead.metadata as any).discontinued = true

    expect(buildFinishOptions([dead], 30)).toEqual([])
  })
})

// WB-074 D6 — card mappers (related products, home Featured) need the
// normalized finish UNION without the full per-finish size-matrix cost of
// buildFinishOptions, and must OMIT (not default to "black") when no variant
// carries real finish data.
describe("finishesUnion", () => {
  it("unions normalized finishes across variants, deduped", () => {
    const out = finishesUnion([
      variant("Matte Black", "b.jpg", 20),
      variant("Gloss Silver", "s.jpg", 22),
      variant("Chrome", "c.jpg", 20), // also normalizes to silver — dedupe check
    ])
    expect(out.sort()).toEqual(["black", "silver"])
  })

  it("returns [] (not ['black']) when every variant has a blank finish", () => {
    const out = finishesUnion([variant("", null, 20), variant("  ", null, 22)])
    expect(out).toEqual([])
  })
})
