/**
 * True when a Medusa product carries a usable image (thumbnail). The storefront
 * twin lives at storefront/src/lib/util/has-image.ts — keep them equivalent.
 */
export function hasImage(thumbnail?: string | null): boolean {
  return typeof thumbnail === "string" && thumbnail.trim().length > 0
}
