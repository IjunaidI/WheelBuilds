/**
 * True when a product carries a usable image (thumbnail). Backend twin:
 * backend/src/modules/vendor-sync/search/has-image.ts — keep them equivalent.
 */
export function hasImage(thumbnail?: string | null): boolean {
  return typeof thumbnail === "string" && thumbnail.trim().length > 0
}
