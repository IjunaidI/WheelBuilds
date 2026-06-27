import { buildSearchDocument } from "../search/build-search-document"

const product = {
  id: "prod_1",
  handle: "teraflex-nomad-matte-black",
  title: "Teraflex Nomad Matte Black",
  thumbnail: "https://cdn.example.com/x.jpg",
  created_at: "2026-05-01T00:00:00.000Z",
  metadata: { product_type: "wheel", brand: "Teraflex" },
  variants: [
    {
      sku: "W-1",
      // Vendor-sync stores MSRP in MAJOR units (dollars) — what Medusa v2 +
      // cart/checkout expect. The index carries CENTS (×100) for the
      // storefront's `priceCents` contract.
      prices: [{ amount: 369.99, currency_code: "usd" }],
      metadata: {
        finish: "Matte Black",
        wheel_diameter_in: 17,
        wheel_width_in: 8.5,
        bolt_pattern_raw: "5X5.0",
        offset_mm: -12,
        center_bore_mm: 71.5,
      },
    },
    {
      sku: "W-2",
      prices: [{ amount: 419.99, currency_code: "usd" }],
      metadata: {
        finish: "Matte Black",
        wheel_diameter_in: 18,
        wheel_width_in: 9,
        bolt_pattern_raw: "5X5.0",
        offset_mm: 0,
        center_bore_mm: 71.5,
      },
    },
  ],
}

describe("buildSearchDocument", () => {
  it("flattens variants into facet + fitment arrays", () => {
    const doc = buildSearchDocument(product as any)
    expect(doc).toMatchObject({
      id: "prod_1",
      handle: "teraflex-nomad-matte-black",
      brand: "Teraflex",
      finishes: ["black"],
      product_type: "wheel",
      diameters: [17, 18],
      widths: [8.5, 9],
      bolt_patterns: ["5X5.0"],
      bolt_patterns_canonical: ["5x127"],
      offsets: [-12, 0],
      center_bores: [71.5],
      price_min: 36999,
      price_max: 41999,
    })
    expect((doc as any).finish).toBeUndefined()
  })

  it("converts major-unit USD prices to integer cents", () => {
    const doc = buildSearchDocument({
      ...product,
      variants: [
        { sku: "a", prices: [{ amount: 12.5, currency_code: "usd" }], metadata: {} },
      ],
    } as any)
    expect(doc).toMatchObject({ price_min: 1250, price_max: 1250 })
  })

  it("returns null for non-wheel products (excluded from this index cut)", () => {
    const tire = { ...product, metadata: { product_type: "tire", brand: "X" } }
    expect(buildSearchDocument(tire as any)).toBeNull()
  })

  it("survives missing variant metadata with safe defaults", () => {
    const sparse = {
      id: "p2",
      handle: "h2",
      title: "t2",
      metadata: { product_type: "wheel", brand: "B" },
      variants: [{ sku: "s", prices: [], metadata: {} }],
    }
    const doc = buildSearchDocument(sparse as any)
    expect(doc).toMatchObject({
      id: "p2",
      brand: "B",
      finishes: [],
      diameters: [],
      bolt_patterns_canonical: [],
      price_min: 0,
      price_max: 0,
    })
    expect((doc as any).finish).toBeUndefined()
  })

  it("emits the normalized union of variant finishes", () => {
    const doc = buildSearchDocument({
      id: "p", handle: "h", title: "t", metadata: { product_type: "wheel", brand: "Petrol" },
      variants: [
        { metadata: { finish: "Matte Black", bolt_pattern_raw: "5x114.3", wheel_diameter_in: 20, wheel_width_in: 9, offset_mm: 35 } },
        { metadata: { finish: "Gloss Silver", bolt_pattern_raw: "5x114.3", wheel_diameter_in: 20, wheel_width_in: 9, offset_mm: 35 } },
      ],
    } as any)
    expect(doc).not.toBeNull()
    expect([...(doc!.finishes as string[])].sort()).toEqual(["black", "silver"])
    expect((doc as any).finish).toBeUndefined()
  })
})
