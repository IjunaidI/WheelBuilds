/**
 * Product Detail adapter — real Medusa wiring.
 *
 * Reads the authoritative product (live price + inventory) from the Medusa
 * Store API, so PDP never shows a stale Meilisearch snapshot. Maps the
 * Medusa product + its variants → ProductDetail. Types stay stable.
 *
 * fitment is populated by getProductDetail via the reverse-fitment route
 * (WB-009); mapToDetail returns the empty default. The Fitment section
 * degrades to "no fitment confirmed yet" on an empty list.
 */

import { notFound } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import { getProductByHandle, getProductsList } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { getFitmentByProduct, getFitmentByTireProduct } from "@lib/data/fitment"
import { hasImage } from "@lib/util/has-image"
import { canonicalBoltPatterns } from "@lib/fitment/canonical-bolt-pattern"
import { DiscoveryProduct } from "@modules/discovery/data/types"
import { AnyProductDetail, ProductDetail } from "./types"
import { num, groupVariantsIntoSizes, isRealBoltPattern, diametersUnion } from "./group-sizes"
import { buildFinishOptions, finishesUnion } from "./finish-options"
import { mapTireDetail } from "./tire/map-tire-detail"
import { getTireDiscoveryProducts } from "@modules/tire-discovery/data/get-tire-products"
import { EMPTY_TIRE_FILTERS } from "@modules/tire-discovery/data/types"
import type { TireDiscoveryProduct } from "@modules/tire-discovery/data/types"

function mapToDetail(product: HttpTypes.StoreProduct): ProductDetail {
  const pmeta = (product.metadata ?? {}) as Record<string, unknown>
  const variants = product.variants ?? []
  const rep = (variants[0]?.metadata ?? {}) as Record<string, unknown>

  // "From" price across variants — corrected from the plan's MAX_SAFE_INTEGER
  // pattern, which would render a price-less product as ~$90 quadrillion.
  const variantPricesCents = variants
    .map((v) =>
      Math.round(num((v.calculated_price as any)?.calculated_amount) * 100)
    )
    .filter((n) => n > 0)
  const fromCents = variantPricesCents.length ? Math.min(...variantPricesCents) : 0

  const boltPatterns = Array.from(
    new Set(
      variants
        .map((v) => String((v.metadata as any)?.bolt_pattern_raw ?? ""))
        .filter(isRealBoltPattern)
    )
  )

  // Round to 1 decimal — the importer's grams round-trip otherwise yields ugly
  // values like 31.9997 lb. Single source: specs grid + variant-picker both read this.
  const weightLb = Math.round((num((product as any).weight) / 453.592) * 10) / 10

  const finishOptionsList = buildFinishOptions(variants, weightLb)

  return {
    kind: "wheel",

    // DiscoveryProduct base
    id: product.id!,
    handle: product.handle!,
    brand: String(pmeta.brand ?? ""),
    name: product.title ?? "",
    priceCents: fromCents,
    thumbnail: product.thumbnail ?? null,
    finishes: Array.from(new Set(finishOptionsList.map((f) => f.normalized))),
    diameter: num(rep.wheel_diameter_in),
    diameters: diametersUnion(variants),
    width: num(rep.wheel_width_in),
    boltPattern: boltPatterns[0] ?? "",
    isNew: false,

    // ProductDetail extras
    description: product.description ?? "",
    specs: {
      // No vendor source for wheels — surface admin-set metadata if present, else hide (WB-029).
      construction: (typeof pmeta.construction === "string" && pmeta.construction) || null,
      weightLb,
      loadRatingLb: num(rep.load_rating_lb),
      centerBoreMm: num(rep.center_bore_mm),
      countryOfOrigin:
        (typeof pmeta.country_of_origin === "string" && pmeta.country_of_origin) || null,
      warranty: (typeof pmeta.warranty === "string" && pmeta.warranty) || null,
      finishOptions: finishOptionsList.length,
    },
    finishOptions: finishOptionsList,
    sizeOptions: groupVariantsIntoSizes(variants, weightLb),
    boltPatternOptions: boltPatterns,
    boltPatternsCanonical: Array.from(
      new Set(boltPatterns.flatMap((raw) => canonicalBoltPatterns(raw)))
    ),
    fitment: [], // default; getProductDetail overrides via reverse fitment (WB-009)
    relatedHandles: [],
  }
}

export async function getProductDetail(
  handle: string,
  countryCode: string
): Promise<AnyProductDetail> {
  const region = await getRegion(countryCode)
  if (!region) notFound()
  const product = await getProductByHandle(handle, region.id)
  if (!product) notFound()
  // No image → not shown anywhere, including a direct PDP link. Covers wheel
  // AND tire PDP (this precedes the tire branch below). (WB-084)
  if (!hasImage(product.thumbnail)) notFound()

  if ((product.metadata as any)?.product_type === "tire") {
    const tire = mapTireDetail(product)
    const specs = tire.sizeOptions.map((o) => ({
      size: o.canonicalSize,
      loadIndex: o.loadIndex ?? null,
      speedRating: o.speedRating ?? null,
    }))
    const fitment = await getFitmentByTireProduct(specs)
    return { ...tire, fitment }
  }

  const detail = mapToDetail(product)
  // WB-072 S2: pass the product's buildable (diameter, width, offset) sizes so
  // the "confirmed models" list requires an in-window size — the same gate the
  // active-vehicle band applies — instead of bolt+bore alone. One entry per
  // size × offset variant (falls back to the size's offsetMm when it has no
  // offsetVariants), matching the per-size conjunction fitsVehicle/buildFitView use.
  const productSizes = detail.sizeOptions.flatMap((s) =>
    (s.offsetVariants?.length ? s.offsetVariants.map((o) => o.value) : [s.offsetMm]).map((offset) => ({
      diameter: s.diameter,
      width: s.width,
      offset,
    }))
  )
  // WB-091 P5: pass the full SET of per-size bores (deduped, across every
  // variant) instead of `detail.specs.centerBoreMm` — that's a single
  // arbitrary `variants[0]` pick, which can wrongly gate a multi-bore
  // product's "confirmed models" list on whichever variant happened to load
  // first. The backend matches a cached vehicle if ANY bore in the set
  // clears that vehicle's hub.
  const productBores = Array.from(
    new Set(
      detail.sizeOptions.flatMap((s) => (s.offsetVariants ?? []).map((o) => o.centerBoreMm))
    )
  ).filter((b): b is number => b != null && b > 0)
  const fitment = await getFitmentByProduct(
    detail.boltPatternsCanonical,
    productBores,
    productSizes
  )
  return { ...detail, fitment }
}

/** Related tires by brand, via the SP2 Meili discovery path (throw-safe). */
export async function getRelatedTireProducts(
  brand: string,
  excludeHandle: string
): Promise<TireDiscoveryProduct[]> {
  if (!brand) return []
  const result = await getTireDiscoveryProducts({
    filters: { ...EMPTY_TIRE_FILTERS, brands: [brand] },
    sort: "relevance",
    page: 1,
  })
  return result.products.filter((p) => p.handle !== excludeHandle).slice(0, 4)
}

/**
 * Related-product card mapper (WB-074 D6/D7). `finishes` is the
 * variant-metadata UNION — mirrors mapToDetail's derivation — not the
 * retired `product.metadata.finish` (moved to variant metadata by WB-059;
 * reading the product-level field made `normalizeFinish(undefined)` default
 * every card to "black"). `boltPattern` is gated through `isRealBoltPattern`
 * so the WB-048 "BLANK" placeholder never prints on a card. Variant metadata
 * for the full `variants` array already comes back on this fetch (same
 * `*variants.calculated_price` field-selection base `getProductByHandle`
 * relies on for `mapToDetail`) — if `getProductsList`'s default `fields` is
 * ever tightened, widen the `getRelatedProducts` query to keep this working.
 */
export function toRelatedProduct(p: HttpTypes.StoreProduct): DiscoveryProduct {
  const variants = p.variants ?? []
  const m = (variants[0]?.metadata ?? {}) as Record<string, unknown>
  const pmeta = (p.metadata ?? {}) as Record<string, unknown>
  const rawBoltPattern = String(m.bolt_pattern_raw ?? "")
  const boltPattern = isRealBoltPattern(rawBoltPattern) ? rawBoltPattern : ""
  return {
    id: p.id!,
    handle: p.handle!,
    brand: String(pmeta.brand ?? ""),
    name: p.title ?? "",
    priceCents: Math.round(
      num((variants[0]?.calculated_price as any)?.calculated_amount) * 100
    ),
    thumbnail: p.thumbnail ?? null,
    finishes: finishesUnion(variants),
    diameter: num(m.wheel_diameter_in),
    diameters: diametersUnion(variants),
    width: num(m.wheel_width_in),
    boltPattern,
    boltPatternsCanonical: boltPattern
      ? Array.from(new Set(canonicalBoltPatterns(boltPattern)))
      : [],
  }
}

export async function getRelatedProducts(
  product: ProductDetail,
  countryCode: string
): Promise<DiscoveryProduct[]> {
  const region = await getRegion(countryCode)
  if (!region) return []

  // Re-read the product to get its brand collection id. getProductByHandle is
  // React.cache'd, so this dedupes with the fetch in getProductDetail (free).
  const full = await getProductByHandle(product.handle, region.id)
  const collectionId = (full as any)?.collection_id
  if (!collectionId) return []

  // Same brand collection, excluding the current product.
  const { response } = await getProductsList({
    queryParams: { collection_id: [collectionId], limit: 8 } as any,
    countryCode,
  })

  return response.products
    .filter((p) => p.handle !== product.handle && hasImage(p.thumbnail))
    .slice(0, 6)
    .map(toRelatedProduct)
}
