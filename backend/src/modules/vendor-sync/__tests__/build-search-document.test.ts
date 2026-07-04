import { buildSearchDocument } from "../search/build-search-document"

const product = {
  id: "prod_1",
  handle: "petrol-nomad-matte-black",
  title: "Petrol Nomad Matte Black",
  thumbnail: "https://cdn.example.com/x.jpg",
  created_at: "2026-05-01T00:00:00.000Z",
  metadata: { product_type: "wheel", brand: "Petrol" },
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
      handle: "petrol-nomad-matte-black",
      brand: "Petrol",
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

  it("builds a tire document with facet arrays", () => {
    const tire = {
      id: "prod_t1",
      handle: "falken-wildpeak-at4w",
      title: "Falken WDPEAK AT4W",
      thumbnail: "https://cdn.example.com/t.jpg",
      created_at: "2026-05-17T00:00:00.000Z",
      metadata: { product_type: "tire", brand: "Falken", tire_prefix: null },
      variants: [
        {
          sku: "F28840215",
          prices: [{ amount: 462, currency_code: "usd" }],
          metadata: {
            size_label: "305/45R22 118S", canonical_size: "305/45R22",
            rim_diameter_in: 22, tire_width_mm: 305, aspect_ratio: 45,
            load_index: 118, speed_rating: "S", construction_type: "R",
          },
        },
        {
          sku: "F28844030",
          prices: [{ amount: 405, currency_code: "usd" }],
          metadata: {
            size_label: "305/50R20 120T", canonical_size: "305/50R20",
            rim_diameter_in: 20, tire_width_mm: 305, aspect_ratio: 50,
            load_index: 120, speed_rating: "T", construction_type: "R",
          },
        },
      ],
    }
    const doc = buildSearchDocument(tire as any)
    expect(doc).toMatchObject({
      id: "prod_t1",
      product_type: "tire",
      brand: "Falken",
      skus: ["F28840215", "F28844030"],
      tire_sizes: ["305/45R22", "305/50R20"],
      rim_diameters: [20, 22],
      section_widths: [305],
      aspect_ratios: [45, 50],
      load_indexes: [118, 120],
      speed_ratings: ["S", "T"],
      tire_type: "passenger",
      price_min: 40500,
      price_max: 46200,
    })
  })

  it("emits per-variant fit_specs for multi-axis fitment, dropping absent load/speed", () => {
    const tire = {
      id: "prod_t2",
      handle: "generic-tire",
      title: "Generic Tire",
      metadata: { product_type: "tire", brand: "Generic" },
      variants: [
        {
          sku: "S-1",
          prices: [{ amount: 200, currency_code: "usd" }],
          metadata: { canonical_size: "305/45R22", load_index: 118, speed_rating: "S" },
        },
        {
          sku: "S-2",
          prices: [{ amount: 210, currency_code: "usd" }],
          metadata: { canonical_size: "305/50R20" },
        },
      ],
    }
    const doc = buildSearchDocument(tire as any)
    expect(doc).toMatchObject({
      fit_specs: ["305/45R22|118|S", "305/50R20||"],
    })
  })

  it("returns the minimal stub for products that are neither wheel nor tire", () => {
    const other = { ...product, metadata: { product_type: "accessory", brand: "X" } }
    expect(buildSearchDocument(other as any)).toBeNull()
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
