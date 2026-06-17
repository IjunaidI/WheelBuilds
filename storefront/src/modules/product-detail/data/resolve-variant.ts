import { OffsetVariant, SizeOption } from "./types"

/**
 * Resolve the exact OffsetVariant the user has selected (size × offset).
 * Mirrors the match the hero uses for pricing; the returned variant's
 * `variantId` is what add-to-cart sends to Medusa. Returns null when the
 * size has no offsets or none match the selected ET.
 */
export function resolveSelectedVariant(
  size: SizeOption,
  offsetMm: number
): OffsetVariant | null {
  return size.offsetVariants?.find((o) => o.value === offsetMm) ?? null
}
