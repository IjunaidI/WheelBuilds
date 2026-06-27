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
