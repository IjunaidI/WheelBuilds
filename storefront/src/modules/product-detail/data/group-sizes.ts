import { HttpTypes } from "@medusajs/types"
import { OffsetVariant, SizeOption } from "./types"

/** Coerce an unknown to a finite number, else 0. Shared by the PDP loader. */
export const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0

/** Coerce to a finite number or null (distinct from num()'s 0 default). */
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null

/** Vendor placeholders that must never become a selectable bolt-pattern gate. */
const PLACEHOLDER_BOLT_PATTERNS = new Set(["", "blank", "n/a"])

/**
 * True when a vendor `bolt_pattern_raw` is a real, selectable pattern (not a
 * placeholder like "" / "BLANK" / "N/A"). Used to keep placeholder values out of
 * the PDP bolt-pattern picker (WB-048) — they would otherwise become a clickable
 * grid-gating chip once WB-003 made the bolt-pattern row load-bearing.
 */
export function isRealBoltPattern(raw: unknown): boolean {
  return !PLACEHOLDER_BOLT_PATTERNS.has(String(raw ?? "").trim().toLowerCase())
}

function availabilityOf(qty: number): SizeOption["availability"] {
  if (qty <= 0) return "out_of_stock"
  if (qty <= 4) return "low_stock"
  return "in_stock"
}

const rank = { in_stock: 2, low_stock: 1, out_of_stock: 0 } as const

/**
 * Group variants into the Diameter × Width × BoltPattern size matrix. The
 * group key includes `bolt_pattern_raw`, so each SizeOption is scoped to ONE
 * bolt pattern and its offsets / price / availability never mix across
 * patterns. `productWeightLb` is the single product-level weight (vendor data
 * has no per-size weight) applied to every size.
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
    const offsetMm = num(m.offset_mm)
    const rawBp = String(m.bolt_pattern_raw ?? "")
    const boltPattern = isRealBoltPattern(rawBp) ? rawBp : ""
    const key = `${diameter}x${width}|${boltPattern}`
    const qty = num((v as any).inventory_quantity)
    const priceCents = Math.round(
      num((v.calculated_price as any)?.calculated_amount) * 100
    )
    const avail = availabilityOf(qty)
    const offset: OffsetVariant = {
      value: offsetMm,
      backspaceIn: "",
      priceCents: priceCents > 0 ? priceCents : undefined,
      variantId: v.id,
      availability: avail,
      centerBoreMm: numOrNull(m.center_bore_mm),
      loadRatingLb: numOrNull(m.load_rating_lb),
    }
    const existing = byKey.get(key)
    if (existing) {
      existing.offsetVariants = [...(existing.offsetVariants ?? []), offset]
      // Best availability across sibling offsets within this pattern.
      if (rank[avail] > rank[existing.availability]) existing.availability = avail
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
        oemOffsetMm: offsetMm,
        boltPattern,
        offsetVariants: [offset],
        weightLb: productWeightLb,
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

/** Default size pick: first in-stock, else the first. */
export function pickDefaultSize(sizes: SizeOption[]): SizeOption {
  return sizes.find((s) => s.availability !== "out_of_stock") ?? sizes[0]
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
