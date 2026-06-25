/** Unmanaged / backorderable lines have no real stock ceiling — cap at a sane default. */
const FALLBACK_MAX = 10

type StockShape = {
  inventory_quantity?: number | null
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
}

/**
 * Max quantity selectable for a cart line. Honors live inventory only when the
 * variant manages stock AND disallows backorder; otherwise falls back to a sane
 * cap. Never returns below currentQty, so a stock drop after add-to-cart cannot
 * make the already-in-cart quantity unselectable. (WB-034)
 */
export function maxSelectableQty(
  variant: StockShape | undefined,
  currentQty: number
): number {
  const managed = variant?.manage_inventory === true
  const backorder = variant?.allow_backorder === true
  if (!managed || backorder) return Math.max(FALLBACK_MAX, currentQty)
  const stock = Math.max(0, variant?.inventory_quantity ?? 0)
  return Math.max(stock, currentQty)
}
