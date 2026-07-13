import "server-only"
import { HttpTypes } from "@medusajs/types"
import { getProductByHandle } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { hasImage } from "@lib/util/has-image"
import { getDiscoveryProducts } from "@modules/discovery/data/get-products"
import { EMPTY_FILTERS, type DiscoveryProduct } from "@modules/discovery/data/types"
import { num, isRealBoltPattern } from "@modules/product-detail/data/group-sizes"
import { finishesUnion } from "@modules/product-detail/data/finish-options"
import { canonicalBoltPatterns } from "@lib/fitment/canonical-bolt-pattern"
import { selectFeatured } from "./select-featured"

function parseHandles(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Medusa Store API product → DiscoveryProduct (from-price = min non-zero across variants).
 * Reads brand + per-variant axes (bolt_pattern_raw/wheel_diameter_in/wheel_width_in) from
 * `metadata`, which the Store API returns by default (same fetch the PDP's mapToDetail relies on).
 * If `getProductByHandle`'s `fields` is ever tightened to drop `metadata`, these stats go blank —
 * keep `metadata` in that fetch.
 *
 * `finishes` is the variant-metadata UNION (mirrors mapToDetail — WB-074 D6;
 * the retired `product.metadata.finish` read via `normalizeFinish(undefined)`
 * defaulted every card to "black" post-WB-059). `boltPattern` is gated
 * through `isRealBoltPattern` so the WB-048 "BLANK" placeholder never prints
 * on a card (WB-074 D7).
 */
export function toFeatured(p: HttpTypes.StoreProduct): DiscoveryProduct {
  const variants = p.variants ?? []
  const pmeta = (p.metadata ?? {}) as Record<string, unknown>
  const rep = (variants[0]?.metadata ?? {}) as Record<string, unknown>
  const pricesCents = variants
    .map((v) => Math.round(num((v.calculated_price as any)?.calculated_amount) * 100))
    .filter((n) => n > 0)
  const rawBoltPattern = String(rep.bolt_pattern_raw ?? "")
  const boltPattern = isRealBoltPattern(rawBoltPattern) ? rawBoltPattern : ""
  return {
    id: p.id!,
    handle: p.handle!,
    brand: String(pmeta.brand ?? ""),
    name: p.title ?? "",
    priceCents: pricesCents.length ? Math.min(...pricesCents) : 0,
    thumbnail: p.thumbnail ?? null,
    finishes: finishesUnion(variants),
    diameter: num(rep.wheel_diameter_in),
    width: num(rep.wheel_width_in),
    boltPattern,
    boltPatternsCanonical: boltPattern
      ? Array.from(new Set(canonicalBoltPatterns(boltPattern)))
      : [],
  }
}

/**
 * Featured products for the home Featured Blocks. Curated via
 * NEXT_PUBLIC_FEATURED_HANDLES (CSV of handles, fetched exact via the Store
 * API); falls back to top-priced wheels from Meili when unset/short. Never
 * throws (both sources swallow failures → []).
 */
export async function getFeaturedProducts(
  countryCode: string,
  limit = 3
): Promise<DiscoveryProduct[]> {
  const handles = parseHandles(process.env.NEXT_PUBLIC_FEATURED_HANDLES)

  let curated: DiscoveryProduct[] = []
  if (handles.length) {
    const region = await getRegion(countryCode).catch(() => null)
    if (region) {
      const fetched = await Promise.all(
        handles.map((h) => getProductByHandle(h, region.id).catch(() => undefined))
      )
      curated = fetched
        .filter((p): p is HttpTypes.StoreProduct => p != null && hasImage(p.thumbnail))
        .map(toFeatured)
    }
  }

  if (curated.length >= limit) return curated.slice(0, limit)

  const { products: fallback } = await getDiscoveryProducts({
    filters: EMPTY_FILTERS,
    sort: "price-desc",
    page: 1,
  })
  return selectFeatured(curated.concat(fallback), handles, limit)
}
