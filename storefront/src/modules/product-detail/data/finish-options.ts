import { HttpTypes } from "@medusajs/types"
import { Finish } from "@modules/common/components/wheel"
import { normalizeFinish } from "@lib/fitment/normalize-finish"
import { groupVariantsIntoSizes } from "./group-sizes"
import { FinishOption } from "./types"

const BLANK_FINISH = "—"

/**
 * Partition a product's variants by their RAW finish (matching the backend's
 * Finish variant axis), and build a per-finish size matrix + image. Blank
 * finishes collapse under the "—" sentinel. Sorted by raw label. (WB-059)
 *
 * NOTE (WB-090 P15): each finish gets its OWN `groupVariantsIntoSizes` call
 * below, so two finishes' SizeOption objects are never object-identical even
 * when they represent the same Diameter×Width×BoltPattern combo. The hero's
 * finish-switch re-snap effect (`components/hero/index.tsx`) accounts for
 * this via `findBySizeKey` (group-sizes.ts) rather than reference equality.
 */
export function buildFinishOptions(
  variants: HttpTypes.StoreProductVariant[],
  productWeightLb: number
): FinishOption[] {
  const byFinish = new Map<string, HttpTypes.StoreProductVariant[]>()
  for (const v of variants) {
    const m = (v.metadata ?? {}) as Record<string, unknown>
    const raw = String(m.finish ?? "").trim() || BLANK_FINISH
    const list = byFinish.get(raw) ?? []
    list.push(v)
    byFinish.set(raw, list)
  }
  return Array.from(byFinish.entries())
    .map(([raw, vs]: [string, HttpTypes.StoreProductVariant[]]) => {
      const firstImage = vs
        .map((v: HttpTypes.StoreProductVariant) => ((v.metadata ?? {}) as Record<string, unknown>).image_url)
        .find((u: unknown): u is string => typeof u === "string" && !!u) ?? null
      return {
        raw,
        normalized: normalizeFinish(raw) as Finish,
        imageUrl: firstImage,
        sizeOptions: groupVariantsIntoSizes(vs, productWeightLb),
      }
    })
    .sort((a, b) => a.raw.localeCompare(b.raw))
}

/**
 * Normalized finish UNION across all variants — the same derivation
 * mapToDetail uses (via buildFinishOptions → f.normalized), but without
 * materializing the per-finish size matrices card mappers don't need.
 * Variants with no real finish value are skipped: a product with no finish
 * data anywhere gets an empty array so the card can OMIT its finish swatch
 * rather than default to "black" (WB-074 D6 — the pre-fix related/featured
 * mappers read the retired `product.metadata.finish` via
 * `normalizeFinish(undefined)`, which always resolves to "black").
 */
export function finishesUnion(
  variants: { metadata?: unknown }[]
): Finish[] {
  const set = new Set<Finish>()
  for (const v of variants) {
    const m = (v.metadata ?? {}) as Record<string, unknown>
    const raw = String(m.finish ?? "").trim()
    if (!raw) continue
    set.add(normalizeFinish(raw))
  }
  return Array.from(set)
}
