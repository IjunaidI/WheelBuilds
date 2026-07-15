import { hasSufficientStock, StockShape } from "@modules/cart/components/item/max-qty"

export type StockCheckLine = {
  variant_id?: string | null
  product_id?: string | null
  quantity: number
  product_title?: string | null
  title?: string | null
}

export type LiveStockVariant = StockShape & {
  id: string
}

export type InsufficientLine = {
  item: StockCheckLine
  title: string
  available: number
}

/**
 * Pure preflight check (WB-092 C2). Given the cart's line items and the
 * CURRENT (live-fetched) variant data for those same lines, returns every
 * line whose quantity exceeds what's actually available right now.
 *
 * Mirrors max-qty.ts's own manage_inventory/allow_backorder rules via
 * hasSufficientStock, so the qty-selector cap (WB-034) and this
 * payment-blocking check can never silently disagree.
 *
 * A line whose variant isn't present in `liveVariants` (e.g. the live
 * product/variant lookup came back short, or a fetch failure upstream
 * already produced an empty list) is treated as available rather than
 * blocked — a failed enrichment must never itself block a real, in-stock
 * checkout. checkStockAvailability (./cart.ts) is the caller responsible for
 * failing open on actual fetch errors; this function only ever compares data
 * it was given.
 */
export function findInsufficientLines(
  items: StockCheckLine[],
  liveVariants: LiveStockVariant[]
): InsufficientLine[] {
  const byId = new Map(liveVariants.map((v) => [v.id, v]))
  const insufficient: InsufficientLine[] = []

  for (const item of items) {
    if (!item.variant_id) continue
    const variant = byId.get(item.variant_id)
    if (!variant) continue

    if (hasSufficientStock(variant, item.quantity)) continue

    insufficient.push({
      item,
      title: item.product_title || item.title || "this item",
      available: Math.max(0, variant.inventory_quantity ?? 0),
    })
  }

  return insufficient
}
