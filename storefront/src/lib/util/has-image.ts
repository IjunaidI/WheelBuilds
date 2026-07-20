/**
 * True when a product carries a NON-EMPTY thumbnail string. Backend twin:
 * backend/src/modules/vendor-sync/search/has-image.ts — keep them equivalent.
 *
 * ⚠️ This is an EMPTINESS check, NOT a reachability check — it cannot tell a
 * working URL from one that 404s. Do not read it as "this product has a usable
 * image". WB-115 found 664 of 2,852 indexed products (23%) pointed at a dead
 * vendor URL while ZERO had an empty thumbnail, so this guard caught none of
 * them. Reachability is enforced upstream at feed staging
 * (backend `vendor-sync/pipeline/image-reachability.ts`), which drops dead-image
 * rows so they never reach Medusa or the index in the first place.
 */
export function hasImage(thumbnail?: string | null): boolean {
  return typeof thumbnail === "string" && thumbnail.trim().length > 0
}
