/**
 * Pure JSON-LD builders for the PDP (WB-095 Task 5). Deliberately NOT a
 * `"use server"` module — every export of one of those must be async, and
 * these are synchronous pure functions (a real build break elsewhere in this
 * project when that rule was missed).
 *
 * `ProductLike` is a small structural type (name/brand/thumbnail/description/
 * priceCents/sizeOptions) rather than an import of `ProductDetail` or
 * `TireProductDetail` — both real shapes already satisfy it, so the same
 * builder serves both the wheel and tire PDP templates without a wheel/tire
 * branch in here.
 *
 * Price-unit trap (see root CLAUDE.md "Price-unit convention"): Medusa's
 * catalog + this storefront's own price displays are dollars; the
 * Meilisearch index and `DiscoveryProduct.priceCents` (which `ProductDetail`
 * extends) are INTEGER CENTS. schema.org `offers.price` must be MAJOR UNITS
 * (dollars) — `centsToMajorUnits` does that conversion once, here, so no
 * caller can accidentally advertise a 100x price to Google.
 */

import { rank } from "../../data/group-sizes"

export type JsonLdStockState = "in_stock" | "low_stock" | "out_of_stock"

export type SchemaAvailability =
  | "https://schema.org/InStock"
  | "https://schema.org/OutOfStock"

/** One size/variant's own stock state + its own representative price (cents). */
export type SizeLike = {
  availability: JsonLdStockState
  priceCents: number
}

export type ProductLike = {
  name: string
  brand: string
  /** Vendor CDN thumbnail; null renders no `image`. */
  thumbnail: string | null
  description?: string
  /**
   * INTEGER CENTS — see the price-unit note above. This is the product-level
   * "from" price (`get-product.ts`'s `fromCents`/`mapTireDetail`'s
   * `priceCents` — a plain MIN across every variant, ignoring stock). It's
   * used only as the LAST-RESORT fallback in `productJsonLd`, not the
   * primary price source — see `purchasablePriceCents`.
   */
  priceCents: number
  /** Every size/variant this product currently offers, each carrying its own real stock state + price. */
  sizeOptions: SizeLike[]
}

export type Crumb = {
  name: string
  /** Absolute URL. Omitted on the current page's own crumb (mirrors both PDP breadcrumb components, which render the last segment unlinked). */
  url?: string
}

/** `36999` (cents) -> `"369.99"` (dollars, 2 decimals, string per common schema.org Offer.price practice). */
export function centsToMajorUnits(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * The best (most-purchasable) stock state across a product's sizes/variants
 * — reuses `group-sizes.ts`'s own `in_stock > low_stock > out_of_stock` rank
 * so this never disagrees with what the purchase panel already computes.
 * `null` (not a guessed default) when there's no size data at all.
 */
export function bestAvailability(
  states: JsonLdStockState[]
): JsonLdStockState | null {
  if (states.length === 0) return null
  return states.reduce((best, s) => (rank[s] > rank[best] ? s : best))
}

/**
 * schema.org only gives us InStock/OutOfStock here (no LimitedAvailability
 * requested) — `low_stock` is still purchasable, so it maps to InStock.
 * `null` in, `null` out: an undeterminable state must be omitted, not guessed.
 */
export function toSchemaAvailability(
  state: JsonLdStockState | null
): SchemaAvailability | null {
  if (state === null) return null
  return state === "out_of_stock"
    ? "https://schema.org/OutOfStock"
    : "https://schema.org/InStock"
}

/**
 * The headline price to advertise: the cheapest PURCHASABLE (non-out-of-stock,
 * positive-price) size, so it can never disagree with `bestAvailability`'s
 * InStock claim. A real production case (performance-replicas-101,
 * live-verified WB-095 Task 5): the globally cheapest offset was
 * out_of_stock while pricier siblings were genuinely buyable — a plain
 * "min across every variant" (which is what `ProductDetail.priceCents` /
 * `TireProductDetail.priceCents` already are, for the card-level "from"
 * price elsewhere in the app) would have advertised a dead SKU's price
 * alongside an honest "InStock". Falls back to the cheapest priced size
 * regardless of stock when nothing is purchasable (an all-OOS product still
 * has SOME historical price worth showing), and to `fallback` only when no
 * size carries a usable price at all.
 */
export function purchasablePriceCents(
  sizes: SizeLike[],
  fallback: number
): number {
  const positivePriced = sizes.filter((s) => s.priceCents > 0)
  const purchasable = positivePriced.filter((s) => s.availability !== "out_of_stock")
  const pool = purchasable.length ? purchasable : positivePriced
  return pool.length ? Math.min(...pool.map((s) => s.priceCents)) : fallback
}

/**
 * Adapts a wheel PDP's `SizeOption[]` into the `SizeLike[]` `productJsonLd`
 * needs — flattened to each size's `offsetVariants` (the real leaf SKUs),
 * NOT the `SizeOption`'s own `priceCentsOverride`/`availability` rollups.
 *
 * Why leaf-level: multiple sibling offsets (each a distinct real SKU with
 * its own price + stock) collapse into ONE `SizeOption` whenever they share
 * a Diameter×Width×BoltPattern (`group-sizes.ts`'s `groupVariantsIntoSizes`).
 * That function's `priceCentsOverride` is a stock-BLIND `Math.min` across
 * every sibling offset, while `.availability` IS stock-aware (best-of-rank)
 * — so the rollup's own price can silently be a hidden out-of-stock
 * offset's price with no way to tell from the rollup alone (live-verified,
 * performance-replicas-101: the size-level rollup was `{low_stock,
 * priceCentsOverride: 15100}`, but that $151.00 belonged to the ONE
 * out-of-stock offset among three; the two low_stock offsets were $220/$333).
 * Reading only the rollup would silently re-introduce the exact dead-SKU
 * price bug `purchasablePriceCents` exists to prevent. Tires need no
 * equivalent adapter — `TireSizeOption` already carries a plain,
 * always-present `priceCents` per (un-nested) size.
 */
export function wheelSizesForJsonLd(
  sizeOptions: {
    availability: JsonLdStockState
    priceCentsOverride?: number
    offsetVariants?: { availability: JsonLdStockState; priceCents?: number }[]
  }[],
  productPriceCents: number
): SizeLike[] {
  return sizeOptions.flatMap((size) => {
    const sizeFallback = size.priceCentsOverride ?? productPriceCents
    if (size.offsetVariants && size.offsetVariants.length > 0) {
      return size.offsetVariants.map((o) => ({
        availability: o.availability,
        priceCents: o.priceCents ?? sizeFallback,
      }))
    }
    return [{ availability: size.availability, priceCents: sizeFallback }]
  })
}

/**
 * `Product` JSON-LD for the PDP. `product.name` already begins with the
 * brand (vendor-sync's `buildGroupTitle`/`buildTireGroupTitle`) — `name`
 * here is `product.name` alone; `brand` is the separate field, never
 * concatenated (mirrors the Task 2 title-doubling fix in generateMetadata).
 *
 * `offers` is omitted entirely when no usable price exists — a genuinely
 * price-less product must not advertise a fabricated $0.00 (the same
 * honesty rule `canPurchasePrice`/the purchase panels already apply).
 */
export function productJsonLd(
  product: ProductLike,
  url: string
): Record<string, unknown> {
  const availability = toSchemaAvailability(
    bestAvailability(product.sizeOptions.map((s) => s.availability))
  )
  const priceCents = purchasablePriceCents(product.sizeOptions, product.priceCents)
  const hasPrice = priceCents > 0

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    ...(product.thumbnail ? { image: [product.thumbnail] } : {}),
    ...(product.description ? { description: product.description } : {}),
    url,
    ...(hasPrice
      ? {
          offers: {
            "@type": "Offer",
            url,
            priceCurrency: "USD",
            price: centsToMajorUnits(priceCents),
            ...(availability ? { availability } : {}),
          },
        }
      : {}),
  }
}

/**
 * `BreadcrumbList` JSON-LD. Positions are 1-indexed off whatever order
 * `crumbs` is given in — callers must synthesize the Home crumb themselves
 * (both `components/breadcrumb/index.tsx` and `components/tire/breadcrumb.tsx`
 * start at "Wheels"/"Tires", never Home). A crumb with no `url` (the current
 * page, last in the list) omits `item` rather than emitting a bogus link.
 */
export function breadcrumbJsonLd(crumbs: Crumb[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      ...(c.url ? { item: c.url } : {}),
    })),
  }
}

/**
 * Serializes a JSON-LD payload for `dangerouslySetInnerHTML`. Product
 * names/descriptions are vendor-supplied strings that can contain a literal
 * less-than sign — un-escaped, a closing script-tag substring inside one
 * would end the tag early (XSS). Replacing every less-than sign with its
 * six-character JSON unicode escape is the standard mitigation: HTML's
 * parser no longer sees a tag boundary, but that escape is an ordinary JSON
 * string escape, so `JSON.parse` still recovers the exact original
 * character.
 */
export function toJsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
