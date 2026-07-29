export type PricedLineItem = {
  total?: number | null
  unit_price?: number | null
  quantity?: number | null
}

export type LineItemAmounts = {
  total: number
  unitPrice: number
}

/**
 * Stored/charged amounts for a cart or order line item — the source of truth
 * for what the customer is actually being charged, independent of whatever
 * the variant's live price happens to be today.
 *
 * Cart/mini-cart pricing used to read `getPricesForVariant(item.variant)`
 * (the LIVE variant price) as the displayed amount. That drifts from the
 * cart subtotal after a vendor-sync reprice, and — worse — a discontinued
 * (drafted) product has no resolvable variant price, so the live-price path
 * yields `NaN`. `item.total` / `item.unit_price` are the amounts actually
 * charged and always resolve, so they're the correct source of truth; live
 * variant data may still be used to DECORATE (e.g. an original/strikethrough
 * price) but must never be the source of the displayed charged amount.
 *
 * WB-118 Q-01 — `total` is NOT always present. A live capture of the Store
 * API cart response (2026-07-29) showed the line item carrying no `total`
 * key at all; its full key set is id/quantity/unit_price/tax_lines/
 * adjustments/product/variant/…, i.e. per-line totals are not decorated on
 * that response, only cart-level ones are. `item.total ?? 0` therefore
 * rendered "$0.00" in the cart's TOTAL column beside a perfectly correct
 * unit price. Each amount now falls back to the other, so a line renders
 * correctly when EITHER field is present.
 *
 * Both fallbacks stay inside stored amounts (`total`, `unit_price`,
 * `quantity`) — nothing here reaches for live variant data, which is the
 * whole point of this helper. `??` (nullish) not `||` is deliberate in both
 * directions: a genuine $0 line must keep reading $0, not get "fixed".
 */
export function lineItemAmounts(item: PricedLineItem): LineItemAmounts {
  const quantity = item.quantity ?? 0
  const total = item.total ?? (item.unit_price ?? 0) * quantity
  const unitPrice = item.unit_price ?? (quantity > 0 ? total / quantity : 0)

  return { total, unitPrice }
}
