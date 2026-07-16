import { describe, it, expect } from "vitest"
import { pickDefaultSelection, pickDefaultLeaf, pickDefaultTireLeaf } from "./pick-default-leaf"
import type { FinishOption, OffsetVariant, ProductDetail, SizeOption, TireProductDetail } from "./types"
import type { TireSizeOption } from "./tire/tire-size-options"

// Minimal factories — only the fields pick-default-leaf.ts's chain reads
// (mirrors the convention in data/__tests__/fit-view.test.ts).
const offset = (value: number, overrides: Partial<OffsetVariant> = {}): OffsetVariant => ({
  value,
  backspaceIn: "",
  variantId: `v-${value}-${overrides.centerBoreMm ?? "x"}`,
  availability: "in_stock",
  centerBoreMm: null,
  loadRatingLb: null,
  quantity: 10,
  ...overrides,
})

const size = (
  diameter: number,
  width: number,
  boltPattern: string,
  offsetVariants: OffsetVariant[],
  overrides: Partial<SizeOption> = {}
): SizeOption => ({
  diameter,
  width,
  offsetMm: offsetVariants[0].value,
  defaultOffsetMm: offsetVariants[0].value,
  boltPattern,
  weightLb: 25,
  availability: "in_stock",
  offsetVariants,
  ...overrides,
})

const finish = (raw: string, sizeOptions: SizeOption[]): FinishOption => ({
  raw,
  normalized: "black",
  imageUrl: null,
  sizeOptions,
})

const productOf = (overrides: Partial<ProductDetail>): ProductDetail =>
  ({
    boltPattern: "",
    sizeOptions: [],
    finishOptions: [],
    ...overrides,
  } as unknown as ProductDetail)

describe("pickDefaultSelection", () => {
  it("resolves first finish -> first bolt pattern -> first in-stock size -> its default offset's leaf", () => {
    const product = productOf({
      boltPattern: "5x114.3",
      finishOptions: [
        finish("Matte Black", [size(18, 8, "5x114.3", [offset(40, { priceCents: 22000 })])]),
      ],
    })
    const sel = pickDefaultSelection(product)
    expect(sel.finishRaw).toBe("Matte Black")
    expect(sel.boltPattern).toBe("5x114.3")
    expect(sel.size?.diameter).toBe(18)
    expect(sel.offsetMm).toBe(40)
    expect(sel.leaf?.priceCents).toBe(22000)
  })

  it("picks the FIRST finish in finishOptions array order", () => {
    const product = productOf({
      finishOptions: [
        finish("Chrome", [size(20, 9, "6x139.7", [offset(0)])]),
        finish("Black", [size(18, 8, "6x139.7", [offset(0)])]),
      ],
    })
    expect(pickDefaultSelection(product).finishRaw).toBe("Chrome")
  })

  it("picks the first-seen real bolt pattern within the active finish's own sizes", () => {
    const product = productOf({
      boltPattern: "6x139.7",
      finishOptions: [
        finish("Black", [
          size(20, 9, "6x139.7", [offset(0)]),
          size(18, 8, "5x114.3", [offset(0)]),
        ]),
      ],
    })
    expect(pickDefaultSelection(product).boltPattern).toBe("6x139.7")
  })

  it("defaults to the first IN-STOCK size for the selected bolt pattern, skipping an out-of-stock leading size", () => {
    const product = productOf({
      finishOptions: [
        finish("Black", [
          size(18, 8, "5x114.3", [offset(40, { availability: "out_of_stock", priceCents: 15000 })], {
            availability: "out_of_stock",
          }),
          size(20, 9, "5x114.3", [offset(20, { priceCents: 30000 })]),
        ]),
      ],
    })
    const sel = pickDefaultSelection(product)
    expect(sel.size?.diameter).toBe(20)
    expect(sel.leaf?.priceCents).toBe(30000)
  })

  it("resolves to the best-availability sibling offset-variant sharing the default offset value (the bore/load snap converges back to the same leaf, never a worse one)", () => {
    const product = productOf({
      finishOptions: [
        finish("Black", [
          size(18, 8, "5x114.3", [
            offset(40, { availability: "out_of_stock", centerBoreMm: 70, priceCents: 15000 }),
            offset(40, { availability: "in_stock", centerBoreMm: 60, loadRatingLb: 2200, priceCents: 22000 }),
          ]),
        ]),
      ],
    })
    const sel = pickDefaultSelection(product)
    expect(sel.leaf?.availability).toBe("in_stock")
    expect(sel.leaf?.priceCents).toBe(22000)
  })

  it("keeps finishRaw/boltPattern independent of size resolution — a finish with NO sizes at all still reports its own raw label", () => {
    const product = productOf({
      boltPattern: "5x114.3",
      finishOptions: [finish("Matte Black", [])],
    })
    const sel = pickDefaultSelection(product)
    expect(sel.finishRaw).toBe("Matte Black")
    expect(sel.boltPattern).toBe("5x114.3") // falls back — no real bolt patterns under this (empty) finish
    expect(sel.size).toBeNull()
    expect(sel.offsetMm).toBeNull()
    expect(sel.leaf).toBeNull()
  })

  it("falls back to product.sizeOptions and the '—' sentinel finish when the product has no finishOptions at all", () => {
    const product = productOf({
      boltPattern: "5x114.3",
      sizeOptions: [size(18, 8, "5x114.3", [offset(40, { priceCents: 25000 })])],
      finishOptions: [],
    })
    const sel = pickDefaultSelection(product)
    expect(sel.finishRaw).toBe("—")
    expect(sel.size?.diameter).toBe(18)
    expect(sel.leaf?.priceCents).toBe(25000)
  })

  it("returns a fully null selection for a variant-less product (no finishes, no sizes at all)", () => {
    const product = productOf({})
    const sel = pickDefaultSelection(product)
    expect(sel.size).toBeNull()
    expect(sel.offsetMm).toBeNull()
    expect(sel.leaf).toBeNull()
  })
})

describe("pickDefaultLeaf", () => {
  it("returns exactly pickDefaultSelection(product).leaf", () => {
    const product = productOf({
      finishOptions: [
        finish("Black", [size(18, 8, "5x114.3", [offset(40, { priceCents: 19999 })])]),
      ],
    })
    expect(pickDefaultLeaf(product)).toEqual(pickDefaultSelection(product).leaf)
    expect(pickDefaultLeaf(product)?.priceCents).toBe(19999)
  })

  it("returns null for a variant-less product", () => {
    expect(pickDefaultLeaf(productOf({}))).toBeNull()
  })
})

describe("pickDefaultTireLeaf", () => {
  const tireSize = (overrides: Partial<TireSizeOption>): TireSizeOption => ({
    sizeLabel: "35x12.50R20",
    canonicalSize: "35X1250R20",
    rimDiameterIn: 20,
    sectionWidthMm: null,
    aspectRatio: null,
    loadIndex: null,
    speedRating: null,
    plyRating: null,
    constructionType: null,
    variantId: "t-default",
    priceCents: 30000,
    availability: "in_stock",
    quantity: 8,
    ...overrides,
  })

  it("delegates to pickDefaultTireSize(product.sizeOptions) — first in-stock size, skipping a leading out-of-stock one", () => {
    const oos = tireSize({ variantId: "t-oos", availability: "out_of_stock", quantity: 0 })
    const inStock = tireSize({ variantId: "t-ok", rimDiameterIn: 22, availability: "in_stock" })
    const product = { sizeOptions: [oos, inStock] } as unknown as TireProductDetail
    expect(pickDefaultTireLeaf(product)).toBe(inStock)
  })

  it("falls back to the first size when nothing is in stock", () => {
    const a = tireSize({ variantId: "t-a", availability: "out_of_stock", quantity: 0 })
    const b = tireSize({ variantId: "t-b", availability: "out_of_stock", quantity: 0 })
    const product = { sizeOptions: [a, b] } as unknown as TireProductDetail
    expect(pickDefaultTireLeaf(product)).toBe(a)
  })
})
