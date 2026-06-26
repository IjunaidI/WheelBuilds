import "server-only"
import { HttpTypes } from "@medusajs/types"
import { getProductByHandle } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { getDiscoveryProducts } from "@modules/discovery/data/get-products"
import { EMPTY_FILTERS, type DiscoveryProduct } from "@modules/discovery/data/types"
import { num } from "@modules/product-detail/data/group-sizes"
import { normalizeFinish } from "@lib/fitment/normalize-finish"
import { canonicalBoltPatterns } from "@lib/fitment/canonical-bolt-pattern"
import { selectFeatured } from "./select-featured"

const DEFAULT_COUNTRY = process.env.NEXT_PUBLIC_DEFAULT_REGION || "us"

function parseHandles(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Medusa Store API product → DiscoveryProduct (from-price = min non-zero across variants). */
function toFeatured(p: HttpTypes.StoreProduct): DiscoveryProduct {
  const variants = p.variants ?? []
  const pmeta = (p.metadata ?? {}) as Record<string, unknown>
  const rep = (variants[0]?.metadata ?? {}) as Record<string, unknown>
  const pricesCents = variants
    .map((v) => Math.round(num((v.calculated_price as any)?.calculated_amount) * 100))
    .filter((n) => n > 0)
  const boltPattern = String(rep.bolt_pattern_raw ?? "")
  return {
    id: p.id!,
    handle: p.handle!,
    brand: String(pmeta.brand ?? ""),
    name: p.title ?? "",
    priceCents: pricesCents.length ? Math.min(...pricesCents) : 0,
    thumbnail: p.thumbnail ?? null,
    finish: normalizeFinish(pmeta.finish),
    diameter: num(rep.wheel_diameter_in),
    width: num(rep.wheel_width_in),
    boltPattern,
    boltPatternsCanonical: boltPattern
      ? Array.from(new Set(canonicalBoltPatterns(boltPattern)))
      : [],
    categories: [],
  }
}

/**
 * Featured products for the home Featured Blocks. Curated via
 * NEXT_PUBLIC_FEATURED_HANDLES (CSV of handles, fetched exact via the Store
 * API); falls back to top-priced wheels from Meili when unset/short. Never
 * throws (both sources swallow failures → []).
 */
export async function getFeaturedProducts(limit = 3): Promise<DiscoveryProduct[]> {
  const handles = parseHandles(process.env.NEXT_PUBLIC_FEATURED_HANDLES)

  let curated: DiscoveryProduct[] = []
  if (handles.length) {
    const region = await getRegion(DEFAULT_COUNTRY)
    if (region) {
      const fetched = await Promise.all(
        handles.map((h) => getProductByHandle(h, region.id).catch(() => undefined))
      )
      curated = fetched
        .filter((p): p is HttpTypes.StoreProduct => Boolean(p))
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
