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
 */
export function lineItemAmounts(item: PricedLineItem): LineItemAmounts {
  const quantity = item.quantity ?? 0
  const total = item.total ?? 0
  const unitPrice = item.unit_price ?? (quantity > 0 ? total / quantity : 0)

  return { total, unitPrice }
}
