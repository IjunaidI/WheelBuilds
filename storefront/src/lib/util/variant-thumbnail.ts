import { hasImage } from "./has-image"

type VariantThumbnailLike = {
  metadata?: unknown
  product?: { thumbnail?: string | null } | null
}

/**
 * Per-finish image if the variant carries one, else the product's
 * representative thumbnail. Vendor-sync's `build-metadata.ts` writes
 * `variant.metadata.image_url` for the PDP finish swatch; without preferring
 * it here, cart and mini-cart thumbnails always showed the product's
 * default-finish image regardless of which finish the customer actually
 * bought — e.g. a Bronze buyer's line showed a Black wheel (WB-092 C7).
 */
export function variantThumbnail(
  variant: VariantThumbnailLike | null | undefined
): string | null | undefined {
  const metadata = (variant?.metadata ?? {}) as Record<string, unknown>
  const imageUrl = metadata.image_url

  if (typeof imageUrl === "string" && hasImage(imageUrl)) {
    return imageUrl
  }

  return variant?.product?.thumbnail
}
