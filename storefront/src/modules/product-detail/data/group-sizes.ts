import { HttpTypes } from "@medusajs/types"
import { OffsetVariant, SizeOption } from "./types"
import { LOW_STOCK_THRESHOLD } from "./pdp-config"
import { deriveBackspacing } from "./backspacing"
import { isSpecialOrder } from "./order-signal"

/** Coerce an unknown to a finite number, else 0. Shared by the PDP loader. */
export const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0

/** Coerce to a finite number or null (distinct from num()'s 0 default). */
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null

/**
 * Grams → pounds, rounded to 1 decimal. Medusa stores `weight` in grams;
 * shared by every weight rollup (the product-level fallback computed in
 * get-product.ts / map-tire-detail.ts, and the per-variant threading in
 * `groupVariantsIntoSizes` below) so the importer's grams round-trip never
 * surfaces an ugly value like 31.9997 lb.
 */
export function gramsToLb(grams: number): number {
  return Math.round((grams / 453.592) * 10) / 10
}

/**
 * Sign-aware ET (offset) formatter (WB-090 P7). A negative `mm` already
 * carries its own "-" when stringified, so hand-rolled `+${mm}` templates
 * double the sign into "+-12mm" — only a non-negative value needs the "+"
 * prepended. Mirrors variant-picker.tsx's already-correct inline
 * `{v >= 0 ? "+" : ""}{v}` pattern; every other offset-rendering site should
 * call this instead of re-deriving the same conditional.
 */
export function formatOffset(mm: number): string {
  return `${mm >= 0 ? "+" : ""}${mm}`
}

/**
 * Vendor placeholders that must never become a selectable bolt-pattern gate.
 * Must stay byte-identical with the backend twin in
 * backend/src/modules/vendor-sync/search/placeholder-bolt-pattern.ts.
 */
const PLACEHOLDER_BOLT_PATTERNS = new Set(["", "blank", "n/a", "na", "call"])

/**
 * True when a vendor `bolt_pattern_raw` is a real, selectable pattern (not a
 * placeholder like "" / "BLANK" / "N/A"). Used to keep placeholder values out of
 * the PDP bolt-pattern picker (WB-048) — they would otherwise become a clickable
 * grid-gating chip once WB-003 made the bolt-pattern row load-bearing.
 */
export function isRealBoltPattern(raw: unknown): boolean {
  return !PLACEHOLDER_BOLT_PATTERNS.has(String(raw ?? "").trim().toLowerCase())
}

/**
 * Distinct wheel diameters across a product's variants, ascending (WB-088
 * D5). Feeds `DiscoveryProduct.diameters` for the featured/related card
 * mappers (get-featured.ts's `toFeatured`, get-product.ts's
 * `toRelatedProduct`), which — unlike `hitToProduct`'s Meili `diameters`
 * field — only have per-variant metadata to derive it from. Mirrors
 * `finishesUnion`'s shape (finish-options.ts).
 */
export function diametersUnion(variants: { metadata?: unknown }[]): number[] {
  const set = new Set<number>()
  for (const v of variants) {
    const m = (v.metadata ?? {}) as Record<string, unknown>
    const d = num(m.wheel_diameter_in)
    if (d > 0) set.add(d)
  }
  return Array.from(set).sort((a, b) => a - b)
}

export function availabilityOf(
  qty: number,
  threshold: number = LOW_STOCK_THRESHOLD
): SizeOption["availability"] {
  if (qty <= 0) return "out_of_stock"
  if (qty <= threshold) return "low_stock"
  return "in_stock"
}

export const rank = { in_stock: 2, low_stock: 1, out_of_stock: 0 } as const

/**
 * The best-availability offset among a size's sibling ETs — ties resolve to
 * the first-listed (vendor feed order), matching `resolveLeafVariant`'s
 * tie-break. Used as a size's organic `defaultOffsetMm` (WB-090 P1) so a
 * first-seen-but-out-of-stock ET can never become the default while a
 * sibling ET is actually purchasable — without this, the Status stat (a
 * size-level rollup) and the buy button (variant-level) could disagree on
 * the same screen.
 */
export function bestAvailabilityOffset(
  offsetVariants: OffsetVariant[]
): number | undefined {
  if (offsetVariants.length === 0) return undefined
  let best = offsetVariants[0]
  for (let i = 1; i < offsetVariants.length; i++) {
    const o = offsetVariants[i]
    if (rank[o.availability] > rank[best.availability]) best = o
  }
  return best.value
}

/**
 * A size's stable identity: Diameter × Width × BoltPattern — deliberately NOT
 * offset, since several sibling ETs collapse into one SizeOption's
 * `offsetVariants`. This is `groupVariantsIntoSizes`'s own Map key, exported
 * so callers can recognize "the same size" across independent grouping runs
 * (e.g. one per finish, WB-090 P15) — `buildFinishOptions` calls
 * `groupVariantsIntoSizes` fresh per finish, so two finishes' SizeOption
 * objects for the identical Diameter×Width×BoltPattern combo are never
 * object-identical, and a reference-equality check (`Array.includes`) can
 * never detect that continuity. This key can.
 */
export function sizeKey(s: {
  diameter: number
  width: number
  boltPattern: string
}): string {
  return `${s.diameter}x${s.width}|${s.boltPattern}`
}

/**
 * Group variants into the Diameter × Width × BoltPattern size matrix. The
 * group key includes `bolt_pattern_raw`, so each SizeOption is scoped to ONE
 * bolt pattern and its offsets / price / availability never mix across
 * patterns. Each SizeOption's `weightLb` is threaded from ITS OWN variant's
 * `weight` (grams → lb, WB-090 P8/L6) — `productWeightLb` is only the
 * fallback used when a variant carries no weight of its own, so a size no
 * longer inherits an unrelated sibling size's shipping weight.
 *
 * Rows with no real Diameter AND Width (both <= 0 — a non-vendor / malformed
 * product whose variant metadata never carried wheel_diameter_in /
 * wheel_width_in) are dropped entirely rather than collapsing into a fake
 * "0×0" SizeOption cell (WB-090 P19).
 *
 * Each offset variant's own `sku` (WB-098 Task 3) is threaded through
 * unchanged — a plain top-level variant field (not metadata), the vendor
 * part number vendor-sync writes via `sku: r.partNumber`. `undefined` when
 * absent; there is no product-level fallback (unlike weight) because a sku
 * is either real or it isn't.
 *
 * `isSpecialOrder` (WB-098 Task 4) is read from the SAME metadata blob as
 * `center_bore_mm`/`load_rating_lb` above (`m.vendor_inv_order_type`) via
 * `isSpecialOrder()` in `order-signal.ts` — per-variant, never rolled up to
 * the size level, since sibling offsets can carry different vendor order
 * types.
 */
export function groupVariantsIntoSizes(
  variants: HttpTypes.StoreProductVariant[],
  productWeightLb: number
): SizeOption[] {
  const byKey = new Map<string, SizeOption>()
  for (const v of variants) {
    const m = (v.metadata ?? {}) as Record<string, unknown>
    const diameter = num(m.wheel_diameter_in)
    const width = num(m.wheel_width_in)
    if (diameter <= 0 || width <= 0) continue
    const offsetMm = num(m.offset_mm)
    const rawBp = String(m.bolt_pattern_raw ?? "")
    const boltPattern = isRealBoltPattern(rawBp) ? rawBp : ""
    const key = sizeKey({ diameter, width, boltPattern })
    const qty = num((v as any).inventory_quantity)
    const priceCents = Math.round(
      num((v.calculated_price as any)?.calculated_amount) * 100
    )
    const avail = availabilityOf(qty)
    // Per-variant shipping weight (WB-090 P8/L6) — falls back to the
    // product-level rollup when this specific variant has no weight of its
    // own, so a size is never left with a fake 0 lb.
    const variantWeightGrams = num((v as any).weight)
    const variantWeightLb =
      variantWeightGrams > 0 ? gramsToLb(variantWeightGrams) : productWeightLb
    const offset: OffsetVariant = {
      value: offsetMm,
      backspaceIn: deriveBackspacing(width, offsetMm),
      priceCents: priceCents > 0 ? priceCents : undefined,
      variantId: v.id,
      sku: typeof v.sku === "string" && v.sku ? v.sku : undefined,
      availability: avail,
      centerBoreMm: numOrNull(m.center_bore_mm),
      loadRatingLb: numOrNull(m.load_rating_lb),
      quantity: qty,
      isSpecialOrder: isSpecialOrder(m.vendor_inv_order_type),
    }
    const existing = byKey.get(key)
    if (existing) {
      existing.offsetVariants = [...(existing.offsetVariants ?? []), offset]
      // Best availability across sibling offsets within this pattern.
      if (rank[avail] > rank[existing.availability]) existing.availability = avail
      // Best-availability default offset among sibling offsets (WB-090 P1) —
      // recomputed off the running list so the organic default never sticks
      // to a first-seen-but-out-of-stock ET while a sibling is purchasable.
      existing.defaultOffsetMm = bestAvailabilityOffset(existing.offsetVariants)
      // Min non-zero price across sibling offsets for the size "from" price.
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
        defaultOffsetMm: offsetMm,
        boltPattern,
        offsetVariants: [offset],
        weightLb: variantWeightLb,
        availability: avail,
        priceCentsOverride: priceCents > 0 ? priceCents : undefined,
      })
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => a.diameter - b.diameter || a.width - b.width
  )
}

/**
 * The sizes available for a given bolt pattern. Falls back to ALL sizes when
 * no size matches (a product with no/unknown bolt pattern), so single-pattern
 * and pattern-less products behave exactly as before.
 */
export function sizesForBoltPattern(
  sizes: SizeOption[],
  pattern: string
): SizeOption[] {
  const matching = sizes.filter((s) => s.boltPattern === pattern)
  return matching.length > 0 ? matching : sizes
}

/** Default size pick: first in-stock, else the first, else null (total — never crashes on an empty list). */
export function pickDefaultSize(sizes: SizeOption[]): SizeOption | null {
  return sizes.find((s) => s.availability !== "out_of_stock") ?? sizes[0] ?? null
}

/**
 * Find `current`'s equivalent (same `sizeKey` — Diameter×Width×BoltPattern)
 * within a different `sizes` list, or `undefined` when no equivalent exists.
 * Powers the PDP hero's finish-switch continuity (WB-090 P15): each finish's
 * SizeOption[] is built by a fresh `groupVariantsIntoSizes` call, so the
 * "same" size under a different finish is never the same object — this looks
 * up by identity key instead of by reference, and returns the NEW list's own
 * object (never `current` itself) so the caller's downstream price/stock/
 * offsets read from the finish that's actually selected.
 */
export function findBySizeKey(
  sizes: SizeOption[],
  current: SizeOption | null
): SizeOption | undefined {
  if (!current) return undefined
  const key = sizeKey(current)
  return sizes.find((s) => sizeKey(s) === key)
}

/**
 * Distinct bolt patterns present in a finish's size options, order-stable
 * (first-seen order, not sorted). Scoping this to the ACTIVE finish — instead
 * of the product-wide bolt-pattern set — keeps the bolt-pattern chip row and
 * the visible size grid in sync when the shopper switches finish (B4): a
 * pattern only offered under a different finish stops being offered as a
 * chip once that finish is no longer selected.
 */
export function boltPatternsForFinish(finishSizeOptions: SizeOption[]): string[] {
  return Array.from(
    new Set(finishSizeOptions.map((s) => s.boltPattern).filter(isRealBoltPattern))
  )
}

const candidatesFor = (variants: OffsetVariant[], offsetMm: number) =>
  variants.filter((o) => o.value === offsetMm)

const sortedDistinct = (xs: (number | null)[]): number[] =>
  Array.from(new Set(xs.filter((x): x is number => x != null))).sort((a, b) => a - b)

/** Distinct non-null center bores available at a given offset. */
export function boresFor(variants: OffsetVariant[], offsetMm: number): number[] {
  return sortedDistinct(candidatesFor(variants, offsetMm).map((o) => o.centerBoreMm))
}

/** Distinct non-null load ratings available at a given offset. */
export function loadsFor(variants: OffsetVariant[], offsetMm: number): number[] {
  return sortedDistinct(candidatesFor(variants, offsetMm).map((o) => o.loadRatingLb))
}

/**
 * Distinct non-null load ratings available at a given offset AND center bore.
 * Cascades the Load Rating selector off the chosen Center Bore so an invalid
 * (bore, load) pair — one that maps to no variant — can never be offered.
 * A null centerBoreMm is a wildcard (all loads at the offset).
 */
export function loadsForBore(
  variants: OffsetVariant[],
  offsetMm: number,
  centerBoreMm: number | null
): number[] {
  const cands = candidatesFor(variants, offsetMm).filter(
    (o) => centerBoreMm == null || o.centerBoreMm === centerBoreMm
  )
  return sortedDistinct(cands.map((o) => o.loadRatingLb))
}

/**
 * Narrow a size's offset variants to one leaf by (offset, [bore], [load]).
 * Unspecified bore/load are wildcards; ties resolve to the best-availability
 * candidate, so an unspecified pick lands on an in-stock variant when possible.
 */
export function resolveLeafVariant(
  size: SizeOption,
  offsetMm: number,
  centerBoreMm?: number | null,
  loadRatingLb?: number | null
): OffsetVariant | null {
  const matches = candidatesFor(size.offsetVariants ?? [], offsetMm)
    .filter((o) => centerBoreMm == null || o.centerBoreMm === centerBoreMm)
    .filter((o) => loadRatingLb == null || o.loadRatingLb === loadRatingLb)
  if (matches.length === 0) return null
  return matches.sort(
    (a, b) => rank[b.availability] - rank[a.availability]
  )[0]
}
