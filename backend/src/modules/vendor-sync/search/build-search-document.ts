import { canonicalBoltPatterns } from "./bolt-pattern-canonical"
import { normalizeFinish } from "./normalize-finish"
import { hasImage } from "./has-image"
import { isRealBoltPattern } from "./placeholder-bolt-pattern"

/** Minimal shape we read off a Medusa product in the Meilisearch transformer. */
type IndexableVariant = {
  sku?: string
  prices?: { amount: number; currency_code: string }[]
  metadata?: Record<string, unknown> | null
}
type IndexableProduct = {
  id: string
  handle: string
  title: string
  description?: string
  thumbnail?: string | null
  created_at?: string
  metadata?: Record<string, unknown> | null
  variants?: IndexableVariant[]
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null

const uniqSorted = (xs: number[]): number[] =>
  Array.from(new Set(xs)).sort((a, b) => a - b)

const uniqStr = (xs: string[]): string[] => Array.from(new Set(xs))

/**
 * Medusa product → flat Meilisearch document. Dispatches by product_type:
 * a wheel doc, a tire doc, or null for anything else (the plugin coalesces a
 * falsy result to a minimal { id, product_type } stub in medusa-config.js).
 */
export function buildSearchDocument(product: IndexableProduct) {
  // No image → not shown anywhere. Returning null routes through the
  // medusa-config stub fallback (forced to product_type:'non-wheel'), so it
  // matches no wheel/tire discovery filter. (WB-084)
  if (!hasImage(product.thumbnail)) return null
  const meta = product.metadata ?? {}
  if (meta.product_type === "wheel") return buildWheelDocument(product, meta)
  if (meta.product_type === "tire") return buildTireDocument(product, meta)
  return null
}

/**
 * Medusa wheel product → flat Meilisearch document. All consumers of the
 * wheel index shape read this function's return type (`WheelSearchDocument`).
 */
function buildWheelDocument(
  product: IndexableProduct,
  meta: Record<string, unknown>
) {
  const variants = (product.variants ?? []).filter(
    (v) => (v.metadata ?? {}).discontinued !== true
  )
  if (variants.length === 0) return null

  const diameters: number[] = []
  const widths: number[] = []
  const offsets: number[] = []
  const centerBores: number[] = []
  const boltRaw: string[] = []
  const boltCanonical: string[] = []
  const usdPrices: number[] = []
  const skus: string[] = []
  const finishes: string[] = []

  for (const v of variants) {
    if (typeof v.sku === "string" && v.sku) skus.push(v.sku)
    const vm = v.metadata ?? {}
    const d = num(vm.wheel_diameter_in)
    if (d !== null) diameters.push(d)
    const w = num(vm.wheel_width_in)
    if (w !== null) widths.push(w)
    const o = num(vm.offset_mm)
    if (o !== null) offsets.push(o)
    const cb = num(vm.center_bore_mm)
    if (cb !== null) centerBores.push(cb)
    const bp = typeof vm.bolt_pattern_raw === "string" ? vm.bolt_pattern_raw : ""
    if (bp && isRealBoltPattern(bp)) {
      boltRaw.push(bp)
      boltCanonical.push(...canonicalBoltPatterns(bp))
    }
    if (typeof vm.finish === "string" && vm.finish) {
      const fin = normalizeFinish(vm.finish)
      if (fin) finishes.push(fin)
    }
    // USD-only by design: vendor-sync stores MSRP in MAJOR units under "usd"
    // (the amount Medusa v2 + cart/checkout treat as dollars). A non-USD
    // deployment yields no matches here, so price_min/price_max fall back to 0
    // — revisit when multi-currency lands.
    for (const p of v.prices ?? []) {
      if (p.currency_code === "usd" && Number.isFinite(p.amount)) {
        usdPrices.push(p.amount)
      }
    }
  }

  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    description: product.description ?? "",
    thumbnail: product.thumbnail ?? null,
    created_at: product.created_at ?? null,
    product_type: "wheel",
    brand: typeof meta.brand === "string" ? meta.brand : "",
    finishes: uniqStr(finishes),
    skus: uniqStr(skus),
    diameters: uniqSorted(diameters),
    widths: uniqSorted(widths),
    offsets: uniqSorted(offsets),
    center_bores: uniqSorted(centerBores),
    bolt_patterns: uniqStr(boltRaw),
    bolt_patterns_canonical: uniqStr(boltCanonical),
    // Major units → integer cents: the storefront's DiscoveryProduct.priceCents
    // contract (the Discovery card divides by 100). PDP reads live Medusa
    // calculated_amount (major units) and ×100 itself, so the two surfaces agree.
    price_min: usdPrices.length ? Math.round(Math.min(...usdPrices) * 100) : 0,
    price_max: usdPrices.length ? Math.round(Math.max(...usdPrices) * 100) : 0,
  }
}

/**
 * The flat document shape produced for each wheel — the cross-module contract
 * read by the Meilisearch index settings and downstream search consumers.
 * Derived from the function's return so it can never drift from what is built.
 */
export type WheelSearchDocument = ReturnType<typeof buildWheelDocument>

const str = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null

function buildTireDocument(
  product: IndexableProduct,
  meta: Record<string, unknown>
) {
  const variants = (product.variants ?? []).filter(
    (v) => (v.metadata ?? {}).discontinued !== true
  )
  if (variants.length === 0) return null

  const sizes: string[] = []
  const rimDiameters: number[] = []
  const sectionWidths: number[] = []
  const aspectRatios: number[] = []
  const loadIndexes: number[] = []
  const speedRatings: string[] = []
  const usdPrices: number[] = []
  const skus: string[] = []
  // Per-variant (size, load, speed) tuples for the storefront's multi-axis
  // fit filter (WB-068) — lets it check "does this tire have a variant that
  // fits" straight off the Meili hit, no Store-API round-trip needed.
  const fitSpecs: string[] = []

  for (const v of variants) {
    if (typeof v.sku === "string" && v.sku) skus.push(v.sku)
    const vm = v.metadata ?? {}
    const size = str(vm.canonical_size)
    if (size) sizes.push(size)
    const rim = num(vm.rim_diameter_in)
    if (rim !== null) rimDiameters.push(rim)
    const w = num(vm.tire_width_mm)
    if (w !== null) sectionWidths.push(w)
    const a = num(vm.aspect_ratio)
    if (a !== null) aspectRatios.push(a)
    const li = num(vm.load_index)
    if (li !== null) loadIndexes.push(li)
    const sr = str(vm.speed_rating)
    if (sr) speedRatings.push(sr)
    if (size) {
      const load = vm.load_index != null ? String(vm.load_index) : ""
      const speed = sr ?? ""
      fitSpecs.push(`${size}|${load}|${speed}`)
    }
    for (const p of v.prices ?? []) {
      if (p.currency_code === "usd" && Number.isFinite(p.amount)) {
        usdPrices.push(p.amount)
      }
    }
  }

  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    description: product.description ?? "",
    thumbnail: product.thumbnail ?? null,
    created_at: product.created_at ?? null,
    product_type: "tire",
    brand: typeof meta.brand === "string" ? meta.brand : "",
    skus: uniqStr(skus),
    tire_sizes: uniqStr(sizes),
    fit_specs: fitSpecs,
    rim_diameters: uniqSorted(rimDiameters),
    section_widths: uniqSorted(sectionWidths),
    aspect_ratios: uniqSorted(aspectRatios),
    load_indexes: uniqSorted(loadIndexes),
    speed_ratings: uniqStr(speedRatings),
    tire_type: classifyTireTypeFromMeta(meta, variants),
    price_min: usdPrices.length ? Math.round(Math.min(...usdPrices) * 100) : 0,
    price_max: usdPrices.length ? Math.round(Math.max(...usdPrices) * 100) : 0,
  }
}

/**
 * Product-level tire class from prefix (product metadata) + first variant's
 * parsed structure. Mirrors classifyTireType but reads the flattened metadata
 * available in the indexer (no TireNormalizedRecord here).
 */
function classifyTireTypeFromMeta(
  meta: Record<string, unknown>,
  variants: IndexableVariant[]
): "passenger" | "light-truck" | "other" {
  const prefix = str(meta.tire_prefix)?.toUpperCase()
  if (prefix === "LT") return "light-truck"
  if (prefix === "P") return "passenger"
  if (prefix === "ST") return "other"
  const vm = variants[0]?.metadata ?? {}
  if (num(vm.tire_width_mm) !== null && num(vm.aspect_ratio) !== null) return "passenger"
  if (str(vm.construction_type) !== null) return "light-truck"
  return "other"
}

export type TireSearchDocument = ReturnType<typeof buildTireDocument>
