/** Unmanaged / backorderable lines have no real stock ceiling — cap at a sane default. */
const FALLBACK_MAX = 10

export type StockShape = {
  inventory_quantity?: number | null
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
}

/** True when the variant has no real stock ceiling — either inventory isn't managed, or backorder is allowed. */
function isAlwaysAvailable(variant: StockShape | undefined): boolean {
  const managed = variant?.manage_inventory === true
  const backorder = variant?.allow_backorder === true
  return !managed || backorder
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
  if (isAlwaysAvailable(variant)) return Math.max(FALLBACK_MAX, currentQty)
  const stock = Math.max(0, variant?.inventory_quantity ?? 0)
  return Math.max(stock, currentQty)
}

/**
 * True when `quantity` is actually available for `variant` right now. Shares
 * the same manage_inventory/allow_backorder branch as maxSelectableQty above
 * so the qty-selector cap and any stock-preflight check can never silently
 * disagree — unlike maxSelectableQty, this has no currentQty floor, because
 * its job is to DETECT an over-quantity line, not to cap a selector.
 * (WB-092 C2 — used by lib/data/find-insufficient-lines.ts and the cart line
 * OOS badge.)
 */
export function hasSufficientStock(
  variant: StockShape | undefined,
  quantity: number
): boolean {
  if (isAlwaysAvailable(variant)) return true
  const stock = Math.max(0, variant?.inventory_quantity ?? 0)
  return quantity <= stock
}
