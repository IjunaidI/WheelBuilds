/**
 * Product fields the Meilisearch plugin fetches (via query.graph) for each
 * product before running our transformer. MUST include 'status': the plugin's
 * per-event upsert step (@rokmohar/medusa-plugin-meilisearch 1.3.5) branches on
 * product.status to DELETE drafted products from the index; without it,
 * product.status is undefined and drafts are silently re-added (WB-089 L1).
 * Standalone constant so a unit test guards the 'status' entry.
 */
export const MEILI_PRODUCT_FIELDS = [
  "id", "title", "description", "handle", "thumbnail", "created_at", "status",
  "metadata",
  "variants.sku", "variants.metadata",
  "variants.prices.amount", "variants.prices.currency_code",
] as const
