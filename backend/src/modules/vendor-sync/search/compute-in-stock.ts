/**
 * Minimal shape read off a variant to decide availability. Mirrors the
 * `variants.inventory_items.inventory.stocked_quantity` / `.reserved_quantity`
 * fields widened onto MEILI_PRODUCT_FIELDS (WB-100) — confirmed via an
 * empirical spike (medusa exec probe + a live transformer log) that
 * query.graph resolves these off the InventoryItem module's computed
 * (MikroORM @Formula, lazy) properties, summed across all stock locations
 * for that inventory item.
 */
type StockVariant = {
  metadata?: Record<string, unknown> | null
  inventory_items?: Array<{
    inventory?: {
      stocked_quantity?: number | null
      reserved_quantity?: number | null
    } | null
  }>
}

const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0

/**
 * in_stock = true iff at least one NON-discontinued variant has available
 * stock (stocked - reserved > 0) in at least one of its inventory items.
 * false for an all-discontinued or empty variant list (consistent with the
 * doc builders already dropping the product before this runs for an
 * all-discontinued set — see buildWheelDocument/buildTireDocument).
 */
export function computeInStock(variants: StockVariant[]): boolean {
  return variants.some((v) => {
    if ((v.metadata ?? {}).discontinued === true) return false
    return (v.inventory_items ?? []).some((ii) => {
      const inv = ii?.inventory
      if (!inv) return false
      return num(inv.stocked_quantity) - num(inv.reserved_quantity) > 0
    })
  })
}
