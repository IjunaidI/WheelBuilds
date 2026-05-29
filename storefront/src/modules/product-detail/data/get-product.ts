/**
 * Product Detail adapter — real Medusa wiring.
 *
 * Reads the authoritative product (live price + inventory) from the Medusa
 * Store API, so PDP never shows a stale Meilisearch snapshot. Maps the
 * Medusa product + its variants → ProductDetail. Types stay stable.
 *
 * fitment: [] until Spec 2 (wheel-size.com). The Fitment section degrades to
 * "no fitment confirmed yet" on an empty list.
 */

import { notFound } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import { getProductByHandle, getProductsList } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { DiscoveryProduct } from "@modules/discovery/data/types"
import { Finish } from "@modules/common/components/wheel"
import { ProductDetail, SizeOption } from "./types"

const DEFAULT_COUNTRY = process.env.NEXT_PUBLIC_DEFAULT_REGION || "us"

const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0

// Byte-equivalent to the backend's normalize-finish.ts (which the index uses).
// Keep the two in lockstep so the PDP swatch matches the Discovery grid swatch.
// Precedence: bronze → explicit "black" (dominates a silver accent) → silver → black.
function normalizeFinish(raw: unknown): Finish {
  const s = String(raw ?? "").toLowerCase()
  if (/bronze|gold|copper|brass/.test(s)) return "bronze"
  if (s.includes("black")) return "black"
  if (/silver|chrome|machined|milled|polished|gunmetal|gr[ae]y|titanium|graphite/.test(s))
    return "silver"
  return "black"
}

function availabilityOf(qty: number): SizeOption["availability"] {
  if (qty <= 0) return "out_of_stock"
  if (qty <= 4) return "low_stock"
  return "in_stock"
}

/**
 * Group variants into the Diameter×Width size matrix the hero expects.
 * `productWeightLb` is the single product-level weight (vendor data has no
 * per-size weight) — applied to every size.
 */
function toSizeOptions(
  variants: HttpTypes.StoreProductVariant[],
  productWeightLb: number
): SizeOption[] {
  const byKey = new Map<string, SizeOption>()
  for (const v of variants) {
    const m = (v.metadata ?? {}) as Record<string, unknown>
    const diameter = num(m.wheel_diameter_in)
    const width = num(m.wheel_width_in)
    const offsetMm = num(m.offset_mm)
    const key = `${diameter}x${width}`
    const qty = num((v as any).inventory_quantity)
    const priceCents = Math.round(
      num((v.calculated_price as any)?.calculated_amount) * 100
    )
    const existing = byKey.get(key)
    if (existing) {
      existing.offsetVariants = [
        ...(existing.offsetVariants ?? []),
        { value: offsetMm, backspaceIn: "", priceCents: priceCents > 0 ? priceCents : undefined },
      ]
      // Best availability across sibling offsets — if ANY offset under this
      // size is in stock, the size cell shows in_stock so the picker isn't
      // suppressed; the offset-level picker handles the per-variant choice.
      const rank = { in_stock: 2, low_stock: 1, out_of_stock: 0 } as const
      const next = availabilityOf(qty)
      if (rank[next] > rank[existing.availability]) existing.availability = next
      // Min non-zero price across sibling offsets for the "from" price shown
      // at the size level.
      if (priceCents > 0) {
        existing.priceCentsOverride =
          existing.priceCentsOverride && existing.priceCentsOverride > 0
            ? Math.min(existing.priceCentsOverride, priceCents)
            : priceCents
      }
    } else {
      byKey.set(key, {
        diameter,
        width,
        offsetMm,
        oemOffsetMm: offsetMm,
        offsetVariants: [{ value: offsetMm, backspaceIn: "", priceCents: priceCents > 0 ? priceCents : undefined }],
        weightLb: productWeightLb,
        availability: availabilityOf(qty),
        priceCentsOverride: priceCents > 0 ? priceCents : undefined,
      })
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => a.diameter - b.diameter || a.width - b.width
  )
}

function mapToDetail(product: HttpTypes.StoreProduct): ProductDetail {
  const pmeta = (product.metadata ?? {}) as Record<string, unknown>
  const variants = product.variants ?? []
  const rep = (variants[0]?.metadata ?? {}) as Record<string, unknown>
  const finish = normalizeFinish(pmeta.finish)

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
        .filter(Boolean)
    )
  )

  const weightLb = num((product as any).weight) / 453.592

  return {
    // DiscoveryProduct base
    id: product.id!,
    handle: product.handle!,
    brand: String(pmeta.brand ?? ""),
    name: product.title ?? "",
    priceCents: fromCents,
    finish,
    diameter: num(rep.wheel_diameter_in),
    width: num(rep.wheel_width_in),
    boltPattern: boltPatterns[0] ?? "",
    categories: [],
    isNew: false,
    fitsActiveVehicle: false,

    // ProductDetail extras
    description: product.description ?? "",
    specs: {
      construction: "—", // Spec §5: not in vendor data (plan gap 4.1).
      weightLb,
      loadRatingLb: num(rep.load_rating_lb),
      centerBoreMm: num(rep.center_bore_mm),
      countryOfOrigin: "—",
      warranty: "—",
      finishOptions: 1,
    },
    finishOptions: [finish],
    sizeOptions: toSizeOptions(variants, weightLb),
    boltPatternOptions: boltPatterns,
    fitment: [], // Spec 2
    relatedHandles: [],
  }
}

export async function getProductDetail(handle: string): Promise<ProductDetail> {
  const region = await getRegion(DEFAULT_COUNTRY)
  if (!region) notFound()
  const product = await getProductByHandle(handle, region.id)
  if (!product) notFound()
  return mapToDetail(product)
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
        finish: normalizeFinish(pmeta.finish),
        diameter: num(m.wheel_diameter_in),
        width: num(m.wheel_width_in),
        boltPattern: String(m.bolt_pattern_raw ?? ""),
        categories: [],
      }
    })
}
