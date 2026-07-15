import { describe, it, expect } from "vitest"
import {
  productJsonLd,
  breadcrumbJsonLd,
  bestAvailability,
  toSchemaAvailability,
  purchasablePriceCents,
  wheelSizesForJsonLd,
  toJsonLdScript,
  centsToMajorUnits,
  type ProductLike,
} from "./json-ld"

const baseProduct: ProductLike = {
  name: "004 Death Metal",
  brand: "American Force",
  thumbnail: "https://cdn.example.com/wheel.jpg",
  description: "Forged monoblock wheel.",
  priceCents: 36999,
  sizeOptions: [
    { availability: "in_stock", priceCents: 36999 },
    { availability: "out_of_stock", priceCents: 29999 },
  ],
}

const url = "https://example.com/us/products/004-death-metal"

describe("centsToMajorUnits", () => {
  it("converts integer cents to a 2-decimal major-unit string (the dollars-in-Medusa / cents-in-the-index split)", () => {
    expect(centsToMajorUnits(36999)).toBe("369.99")
    expect(centsToMajorUnits(100)).toBe("1.00")
    expect(centsToMajorUnits(5)).toBe("0.05")
  })
})

describe("bestAvailability", () => {
  it("ranks in_stock > low_stock > out_of_stock, mirroring group-sizes.ts's rank", () => {
    expect(bestAvailability(["out_of_stock", "in_stock"])).toBe("in_stock")
    expect(bestAvailability(["out_of_stock", "low_stock"])).toBe("low_stock")
    expect(bestAvailability(["out_of_stock", "out_of_stock"])).toBe("out_of_stock")
  })

  it("returns null (not a guess) for an empty list", () => {
    expect(bestAvailability([])).toBeNull()
  })
})

describe("toSchemaAvailability", () => {
  it("maps in_stock and low_stock to schema.org InStock (both are purchasable)", () => {
    expect(toSchemaAvailability("in_stock")).toBe("https://schema.org/InStock")
    expect(toSchemaAvailability("low_stock")).toBe("https://schema.org/InStock")
  })
  it("maps out_of_stock to schema.org OutOfStock", () => {
    expect(toSchemaAvailability("out_of_stock")).toBe("https://schema.org/OutOfStock")
  })
  it("passes null through rather than guessing", () => {
    expect(toSchemaAvailability(null)).toBeNull()
  })
})

describe("purchasablePriceCents", () => {
  // Real production case (performance-replicas-101, live-verified): the
  // globally cheapest offset ($151.00) is out_of_stock; $220.00 and $333.00
  // are the genuinely purchasable (low_stock) offsets. A plain "min across
  // everything" would advertise $151.00 as InStock, pairing a live-purchase
  // claim with a dead SKU's price.
  const mixedStock = [
    { availability: "low_stock" as const, priceCents: 33300 },
    { availability: "low_stock" as const, priceCents: 22000 },
    { availability: "out_of_stock" as const, priceCents: 15100 },
  ]

  it("picks the cheapest PURCHASABLE (non-out-of-stock) price, ignoring a cheaper dead SKU", () => {
    expect(purchasablePriceCents(mixedStock, 0)).toBe(22000)
  })

  it("falls back to the cheapest priced size when nothing is in stock", () => {
    const allOos = [
      { availability: "out_of_stock" as const, priceCents: 36900 },
      { availability: "out_of_stock" as const, priceCents: 22000 },
    ]
    expect(purchasablePriceCents(allOos, 0)).toBe(22000)
  })

  it("ignores non-positive prices when picking the purchasable minimum", () => {
    const zeroPriced = [
      { availability: "in_stock" as const, priceCents: 0 },
      { availability: "in_stock" as const, priceCents: 15000 },
    ]
    expect(purchasablePriceCents(zeroPriced, 0)).toBe(15000)
  })

  it("falls back to the given fallback when no size carries a usable price", () => {
    expect(purchasablePriceCents([], 36999)).toBe(36999)
    expect(purchasablePriceCents([{ availability: "in_stock", priceCents: 0 }], 36999)).toBe(36999)
  })
})

describe("wheelSizesForJsonLd", () => {
  // The real production shape (performance-replicas-101, live-verified):
  // multiple sibling offsets — each its own real SKU with its own price +
  // stock — collapse into ONE SizeOption (same Diameter×Width×BoltPattern).
  // `SizeOption.priceCentsOverride`/`.availability` are already rollups (a
  // stock-blind MIN price, and a best-of-stock rank) computed by
  // `group-sizes.ts`'s `groupVariantsIntoSizes` — reading only those two
  // rollup fields would re-introduce the exact dead-SKU-price bug
  // `purchasablePriceCents` exists to prevent, because the rollup min price
  // can itself already be a hidden out-of-stock offset's price with no way
  // to tell. So this flattens to the OFFSET level (the real leaf SKUs) —
  // `purchasablePriceCents` then sees each offset's true own price + stock.
  it("flattens each size's offsetVariants into per-offset entries (the real leaf SKUs)", () => {
    const out = wheelSizesForJsonLd(
      [
        {
          availability: "low_stock",
          priceCentsOverride: 15100,
          offsetVariants: [
            { availability: "low_stock", priceCents: 33300 },
            { availability: "low_stock", priceCents: 22000 },
            { availability: "out_of_stock", priceCents: 15100 },
          ],
        },
      ],
      36999
    )
    expect(out).toEqual([
      { availability: "low_stock", priceCents: 33300 },
      { availability: "low_stock", priceCents: 22000 },
      { availability: "out_of_stock", priceCents: 15100 },
    ])
  })

  it("an offset with no own price falls back to its size's priceCentsOverride, then the product's priceCents", () => {
    const out = wheelSizesForJsonLd(
      [
        {
          availability: "in_stock",
          priceCentsOverride: 22000,
          offsetVariants: [{ availability: "in_stock" }],
        },
      ],
      36999
    )
    expect(out).toEqual([{ availability: "in_stock", priceCents: 22000 }])
  })

  it("falls back to a single size-level entry when a size carries no offsetVariants at all", () => {
    const out = wheelSizesForJsonLd(
      [{ availability: "in_stock", priceCentsOverride: 22000 }],
      36999
    )
    expect(out).toEqual([{ availability: "in_stock", priceCents: 22000 }])
  })

  it("size-level fallback uses the product's own priceCents when the size has no override either", () => {
    const out = wheelSizesForJsonLd([{ availability: "in_stock" }], 36999)
    expect(out).toEqual([{ availability: "in_stock", priceCents: 36999 }])
  })
})

describe("productJsonLd", () => {
  it("emits @type Product with name alone (never brand-concatenated) + brand + image", () => {
    const ld = productJsonLd(baseProduct, url) as any
    expect(ld["@type"]).toBe("Product")
    expect(ld.name).toBe("004 Death Metal")
    expect(ld.brand).toEqual({ "@type": "Brand", name: "American Force" })
    expect(ld.image).toEqual(["https://cdn.example.com/wheel.jpg"])
    expect(ld.url).toBe(url)
  })

  it("carries offers.priceCurrency USD and price in MAJOR UNITS (priceCents / 100) — not raw cents", () => {
    const ld = productJsonLd(baseProduct, url) as any
    expect(ld.offers.priceCurrency).toBe("USD")
    expect(ld.offers.price).toBe("369.99")
  })

  it("maps availability from the real best-of-siblings stock state (one in-stock size beats an out-of-stock sibling)", () => {
    const ld = productJsonLd(baseProduct, url) as any
    expect(ld.offers.availability).toBe("https://schema.org/InStock")
  })

  it("never pairs a dead (out-of-stock) SKU's price with an InStock claim — picks the cheapest PURCHASABLE size instead", () => {
    const mixed: ProductLike = {
      ...baseProduct,
      // Overall/"from" priceCents (what get-product.ts computes) happens to
      // be the out-of-stock $151.00 offset — the real live bug this test
      // pins (performance-replicas-101).
      priceCents: 15100,
      sizeOptions: [
        { availability: "low_stock", priceCents: 33300 },
        { availability: "low_stock", priceCents: 22000 },
        { availability: "out_of_stock", priceCents: 15100 },
      ],
    }
    const ld = productJsonLd(mixed, url) as any
    expect(ld.offers.price).toBe("220.00")
    expect(ld.offers.availability).toBe("https://schema.org/InStock")
  })

  it("maps an all-out-of-stock product to OutOfStock — never hardcoded InStock", () => {
    const oos: ProductLike = {
      ...baseProduct,
      sizeOptions: [{ availability: "out_of_stock", priceCents: 36999 }],
    }
    const ld = productJsonLd(oos, url) as any
    expect(ld.offers.availability).toBe("https://schema.org/OutOfStock")
  })

  it("omits availability rather than guessing when no size/stock data exists", () => {
    const noSizes: ProductLike = { ...baseProduct, sizeOptions: [] }
    const ld = productJsonLd(noSizes, url) as any
    expect(ld.offers.availability).toBeUndefined()
  })

  it("omits the offers block entirely for a genuinely price-less product instead of a fabricated $0.00", () => {
    const noPrice: ProductLike = {
      ...baseProduct,
      priceCents: 0,
      sizeOptions: [{ availability: "out_of_stock", priceCents: 0 }],
    }
    const ld = productJsonLd(noPrice, url) as any
    expect(ld.offers).toBeUndefined()
  })

  it("omits image when the product has none", () => {
    const noImage: ProductLike = { ...baseProduct, thumbnail: null }
    const ld = productJsonLd(noImage, url) as any
    expect(ld.image).toBeUndefined()
  })
})

describe("breadcrumbJsonLd", () => {
  it("positions start at 1 with a synthesized Home crumb (neither PDP breadcrumb component has one)", () => {
    const ld = breadcrumbJsonLd([
      { name: "Home", url: "https://example.com/us" },
      { name: "Wheels", url: "https://example.com/us/store" },
      { name: "American Force", url: "https://example.com/us/store?brands=American%20Force" },
      { name: "004 Death Metal" },
    ]) as any
    expect(ld["@type"]).toBe("BreadcrumbList")
    expect(ld.itemListElement).toHaveLength(4)
    expect(ld.itemListElement[0]).toEqual({
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://example.com/us",
    })
    expect(ld.itemListElement[3]).toEqual({
      "@type": "ListItem",
      position: 4,
      name: "004 Death Metal",
    })
  })
})

describe("toJsonLdScript", () => {
  it("escapes < to \\u003c so a vendor-supplied string can't break out of </script>", () => {
    const evil = { description: "</script><script>alert(1)</script>" }
    const html = toJsonLdScript(evil)
    expect(html).not.toContain("<")
    expect(html).toContain("\\u003c")
  })

  it("round-trips through JSON.parse back to the original (unescaped) string", () => {
    const evil = { description: "</script><script>alert(1)</script>" }
    const html = toJsonLdScript(evil)
    expect(JSON.parse(html).description).toBe(evil.description)
  })
})
