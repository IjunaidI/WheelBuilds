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
import { getFitmentByProduct } from "@lib/data/fitment"
import { canonicalBoltPatterns } from "@lib/fitment/canonical-bolt-pattern"
import { normalizeFinish } from "@lib/fitment/normalize-finish"
import { DiscoveryProduct } from "@modules/discovery/data/types"
import { ProductDetail } from "./types"
import { num, groupVariantsIntoSizes, isRealBoltPattern } from "./group-sizes"
import { buildFinishOptions } from "./finish-options"

const DEFAULT_COUNTRY = process.env.NEXT_PUBLIC_DEFAULT_REGION || "us"

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
    // DiscoveryProduct base
    id: product.id!,
    handle: product.handle!,
    brand: String(pmeta.brand ?? ""),
    name: product.title ?? "",
    priceCents: fromCents,
    thumbnail: product.thumbnail ?? null,
    finishes: Array.from(new Set(finishOptionsList.map((f) => f.normalized))),
    diameter: num(rep.wheel_diameter_in),
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

export async function getProductDetail(handle: string): Promise<ProductDetail> {
  const region = await getRegion(DEFAULT_COUNTRY)
  if (!region) notFound()
  const product = await getProductByHandle(handle, region.id)
  if (!product) notFound()
  const detail = mapToDetail(product)
  const fitment = await getFitmentByProduct(
    detail.boltPatternsCanonical,
    detail.specs.centerBoreMm || undefined
  )
  return { ...detail, fitment }
}

export async function getRelatedProducts(
  product: ProductDetail
): Promise<DiscoveryProduct[]> {
  const region = await getRegion(DEFAULT_COUNTRY)
  if (!region) return []

  // Re-read the product to get its brand collection id. getProductByHandle is
  // React.cache'd, so this dedupes with the fetch in getProductDetail (free).
  const full = await getProductByHandle(product.handle, region.id)
  const collectionId = (full as any)?.collection_id
  if (!collectionId) return []

  // Same brand collection, excluding the current product.
  const { response } = await getProductsList({
    queryParams: { collection_id: [collectionId], limit: 8 } as any,
    countryCode: DEFAULT_COUNTRY,
  })

  return response.products
    .filter((p) => p.handle !== product.handle)
    .slice(0, 6)
    .map((p) => {
      const m = (p.variants?.[0]?.metadata ?? {}) as Record<string, unknown>
      const pmeta = (p.metadata ?? {}) as Record<string, unknown>
      return {
        id: p.id!,
        handle: p.handle!,
        brand: String(pmeta.brand ?? ""),
        name: p.title ?? "",
        priceCents: Math.round(
          num((p.variants?.[0]?.calculated_price as any)?.calculated_amount) *
            100
        ),
        thumbnail: p.thumbnail ?? null,
        finishes: [normalizeFinish(pmeta.finish)],
        diameter: num(m.wheel_diameter_in),
        width: num(m.wheel_width_in),
        boltPattern: String(m.bolt_pattern_raw ?? ""),
        boltPatternsCanonical: m.bolt_pattern_raw
          ? Array.from(new Set(canonicalBoltPatterns(String(m.bolt_pattern_raw))))
          : [],
      }
    })
}
