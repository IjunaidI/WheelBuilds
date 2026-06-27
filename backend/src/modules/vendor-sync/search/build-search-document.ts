import { canonicalBoltPatterns } from "./bolt-pattern-canonical"
import { normalizeFinish } from "./normalize-finish"

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
 * Medusa wheel product → flat Meilisearch document. Returns null for
 * non-wheel products so the transformer can skip them (tires are a later
 * spec). All consumers of the index read this shape.
 */
export function buildSearchDocument(product: IndexableProduct) {
  const meta = product.metadata ?? {}
  if (meta.product_type !== "wheel") return null

  const variants = product.variants ?? []

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
    if (bp) {
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
export type WheelSearchDocument = NonNullable<ReturnType<typeof buildSearchDocument>>
