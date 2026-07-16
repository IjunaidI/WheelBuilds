import { describe, it, expect } from "vitest"
import {
  productJsonLd,
  breadcrumbJsonLd,
  toSchemaAvailability,
  toJsonLdScript,
  centsToMajorUnits,
  type ProductLike,
} from "./json-ld"

const baseProduct: ProductLike = {
  name: "004 Death Metal",
  brand: "American Force",
  thumbnail: "https://cdn.example.com/wheel.jpg",
  description: "Forged monoblock wheel.",
  leaf: { availability: "in_stock", priceCents: 36999, variantId: "variant_01" },
}

const url = "https://example.com/us/products/004-death-metal"

describe("centsToMajorUnits", () => {
  it("converts integer cents to a 2-decimal major-unit string (the dollars-in-Medusa / cents-in-the-index split)", () => {
    expect(centsToMajorUnits(36999)).toBe("369.99")
    expect(centsToMajorUnits(100)).toBe("1.00")
    expect(centsToMajorUnits(5)).toBe("0.05")
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

  it("prices and stocks the offer from the SAME leaf — never a sibling's price or a global cheapest-across-the-product heuristic", () => {
    // The rendered leaf is in_stock at $220.00 — a cheaper sibling elsewhere
    // on the product (e.g. a different finish/bolt-pattern's $151.00
    // out-of-stock offset) must have NO influence here at all; there's no
    // sibling data even passed in, by construction.
    const rendered: ProductLike = {
      ...baseProduct,
      leaf: { availability: "low_stock", priceCents: 22000 },
    }
    const ld = productJsonLd(rendered, url) as any
    expect(ld.offers.price).toBe("220.00")
    expect(ld.offers.availability).toBe("https://schema.org/InStock")
  })

  it("maps availability from the rendered leaf's own stock state", () => {
    const ld = productJsonLd(baseProduct, url) as any
    expect(ld.offers.availability).toBe("https://schema.org/InStock")
  })

  it("maps an out-of-stock leaf to OutOfStock — never hardcoded InStock", () => {
    const oos: ProductLike = {
      ...baseProduct,
      leaf: { availability: "out_of_stock", priceCents: 36999 },
    }
    const ld = productJsonLd(oos, url) as any
    expect(ld.offers.availability).toBe("https://schema.org/OutOfStock")
  })

  it("omits offers entirely (price AND availability) when the rendered leaf is unresolved (null) — mirrors the Hero's own 'no purchasable options' state", () => {
    const noLeaf: ProductLike = { ...baseProduct, leaf: null }
    const ld = productJsonLd(noLeaf, url) as any
    expect(ld.offers).toBeUndefined()
  })

  it("omits offers entirely for a genuinely price-less leaf instead of a fabricated $0.00 or a sibling's price — the honest 'Price unavailable' case the page itself renders", () => {
    const priceless: ProductLike = {
      ...baseProduct,
      leaf: { availability: "in_stock", priceCents: null },
    }
    const ld = productJsonLd(priceless, url) as any
    expect(ld.offers).toBeUndefined()
  })

  it("includes sku from the rendered leaf's variantId when present", () => {
    const ld = productJsonLd(baseProduct, url) as any
    expect(ld.sku).toBe("variant_01")
  })

  it("omits sku when the rendered leaf carries no variantId", () => {
    const noVariantId: ProductLike = {
      ...baseProduct,
      leaf: { availability: "in_stock", priceCents: 36999 },
    }
    const ld = productJsonLd(noVariantId, url) as any
    expect(ld.sku).toBeUndefined()
  })

  it("prefers the caller-supplied images (e.g. per-finish gallery images) over the bare thumbnail", () => {
    const withImages: ProductLike = {
      ...baseProduct,
      images: ["https://cdn.example.com/black.jpg", "https://cdn.example.com/bronze.jpg"],
    }
    const ld = productJsonLd(withImages, url) as any
    expect(ld.image).toEqual([
      "https://cdn.example.com/black.jpg",
      "https://cdn.example.com/bronze.jpg",
    ])
  })

  it("falls back to [thumbnail] when images is omitted or empty", () => {
    const ld = productJsonLd({ ...baseProduct, images: [] }, url) as any
    expect(ld.image).toEqual(["https://cdn.example.com/wheel.jpg"])
  })

  it("omits image when the product has neither images nor a thumbnail", () => {
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
