/**
 * Pure JSON-LD builders for the PDP (WB-095 Task 5). Deliberately NOT a
 * `"use server"` module — every export of one of those must be async, and
 * these are synchronous pure functions (a real build break elsewhere in this
 * project when that rule was missed).
 *
 * `ProductLike` is a small structural type (name/brand/thumbnail/description/
 * leaf) rather than an import of `ProductDetail` or `TireProductDetail` —
 * both real shapes already satisfy it once mapped through
 * `pickDefaultLeaf`/`pickDefaultTireLeaf` (`data/pick-default-leaf.ts`), so
 * the same builder serves both the wheel and tire PDP templates without a
 * wheel/tire branch in here.
 *
 * Fix wave (Important 1/2): `offers.price` and `offers.availability` both
 * come from `product.leaf` — the SAME single variant/size the PDP hero
 * renders by default (see `pickDefaultLeaf`'s doc for why that's
 * deterministic server-side). Price and availability sourced from the same
 * leaf can never disagree, which dissolves the reason the old
 * `purchasablePriceCents` + `wheelSizesForJsonLd` (a "global cheapest
 * purchasable offset across every finish/bolt-pattern" heuristic) existed —
 * that heuristic coincided with the page's actual rendered price/stock only
 * by luck (live-verified: 60% mismatch across 60 wheel products).
 *
 * Price-unit trap (see root CLAUDE.md "Price-unit convention"): Medusa's
 * catalog + this storefront's own price displays are dollars; the
 * Meilisearch index and `DiscoveryProduct.priceCents` are INTEGER CENTS.
 * schema.org `offers.price` must be MAJOR UNITS (dollars) —
 * `centsToMajorUnits` does that conversion once, here, so no caller can
 * accidentally advertise a 100x price to Google.
 */

export type JsonLdStockState = "in_stock" | "low_stock" | "out_of_stock"

export type SchemaAvailability =
  | "https://schema.org/InStock"
  | "https://schema.org/OutOfStock"

/**
 * The single leaf variant/size the PDP renders by default — see
 * `data/pick-default-leaf.ts`. `null` when the product has no purchasable
 * leaf at all (the Hero's own "no purchasable options" state).
 */
export type RenderedLeaf = {
  availability: JsonLdStockState
  /**
   * Cents, or `null` when this exact leaf has no live price right now —
   * mirrors `price-truth.ts`'s `headlinePriceCents` contract (never a
   * sibling/product-level price substituted in its place).
   */
  priceCents: number | null
  /** Medusa variant id for this exact leaf — feeds `Product.sku`. */
  variantId?: string
} | null

export type ProductLike = {
  name: string
  brand: string
  /** Vendor CDN thumbnail; used when `images` is omitted/empty. */
  thumbnail: string | null
  description?: string
  /**
   * Extra gallery images (e.g. per-finish imagery) beyond `thumbnail` —
   * Google prefers multiple images per product (Minor 3). Optional; falls
   * back to `[thumbnail]` when omitted or empty.
   */
  images?: string[]
  /** See `RenderedLeaf` above. */
  leaf: RenderedLeaf
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
 * `Product` JSON-LD for the PDP. `product.name` already begins with the
 * brand (vendor-sync's `buildGroupTitle`/`buildTireGroupTitle`) — `name`
 * here is `product.name` alone; `brand` is the separate field, never
 * concatenated (mirrors the Task 2 title-doubling fix in generateMetadata).
 *
 * `price` and `availability` both come from `product.leaf` — the single
 * variant/size the PDP hero renders by default (see `pick-default-leaf.ts`).
 * Sourcing both from the SAME leaf means they can never disagree with each
 * other, or with what the page itself shows (Important 1/2 of the WB-095
 * Task 5 fix wave).
 *
 * `offers` is omitted entirely when no usable price exists on that leaf — a
 * genuinely price-less product must not advertise a fabricated $0.00 (the
 * same honesty rule `canPurchasePrice`/the purchase panels already apply),
 * and there is deliberately no sibling/product-level price fallback here —
 * see `RenderedLeaf`'s doc and `price-truth.ts`'s "no sibling fallback" rule.
 */
export function productJsonLd(
  product: ProductLike,
  url: string
): Record<string, unknown> {
  const { leaf } = product
  const availability = leaf ? toSchemaAvailability(leaf.availability) : null
  const hasPrice = leaf?.priceCents != null

  const images = product.images?.length
    ? product.images
    : product.thumbnail
      ? [product.thumbnail]
      : []

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    ...(images.length ? { image: images } : {}),
    ...(product.description ? { description: product.description } : {}),
    ...(leaf?.variantId ? { sku: leaf.variantId } : {}),
    url,
    ...(hasPrice
      ? {
          offers: {
            "@type": "Offer",
            url,
            priceCurrency: "USD",
            price: centsToMajorUnits(leaf!.priceCents as number),
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
