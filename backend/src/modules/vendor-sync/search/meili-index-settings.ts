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
  // WB-100 spike (CONFIRMED via `medusa exec` probe + this transformer):
  // query.graph resolves these off the InventoryItem module's computed
  // (MikroORM @Formula, lazy) properties, aggregated across all stock
  // locations for that inventory item. Real numbers, not undefined.
  "variants.inventory_items.inventory.stocked_quantity",
  "variants.inventory_items.inventory.reserved_quantity",
] as const

/**
 * Attributes Meilisearch full-text-searches against. Must include 'style' and
 * 'search_text' (added to the index documents in WB-087 Task 1) or queries
 * against those fields silently return zero hits — the plugin only searches
 * fields explicitly listed here, independent of what is indexed (WB-087 D2).
 */
export const MEILI_SEARCHABLE_ATTRIBUTES = [
  "title", "brand", "style", "skus", "search_text",
] as const

/**
 * Bidirectional synonym map so common shopper vocabulary ("rims", "tyres")
 * matches our canonical terms and vice versa (WB-087 L7).
 */
export const MEILI_SYNONYMS = {
  rims: ["wheels"],
  wheels: ["rims"],
  tyre: ["tire"],
  tyres: ["tires"],
} as const
